"""Isolated low-latency media tests; no physical camera access."""
import asyncio
from fractions import Fraction
import json
from pathlib import Path
import sys
import unittest
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import Mock, patch
import os

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import bridge_media


class LatestVideoTests(unittest.IsolatedAsyncioTestCase):
    async def test_consumers_receive_latest_frame_without_backlog(self):
        import av
        source = bridge_media.LatestVideo()
        track = source.subscribe()
        for value in range(20):
            frame = av.VideoFrame(64, 48, "yuv420p")
            frame.pts = value * 3000
            frame.time_base = Fraction(1, 90000)
            source.publish(frame)
        self.assertEqual((await track.recv()).pts, 57000)
        waiting = asyncio.create_task(track.recv())
        await asyncio.sleep(0)
        self.assertFalse(waiting.done())
        source.publish(frame)
        self.assertIs(await waiting, frame)
        track.stop()
        source.close()


class MediaHubTests(unittest.TestCase):
    def test_signaling_is_loopback_and_requires_private_worker_key(self):
        hub = bridge_media.MediaHub()
        try:
            self.assertEqual(hub.address[0], "127.0.0.1")
            request = Request(f"http://127.0.0.1:{hub.address[1]}/offer",
                              data=b"{}", headers={"Content-Type": "application/json"})
            with self.assertRaises(HTTPError) as error:
                urlopen(request, timeout=3)
            self.assertEqual(error.exception.code, 401)
        finally:
            hub.close()

    def test_audio_and_datachannel_offers_are_rejected(self):
        hub = bridge_media.MediaHub()
        try:
            request = Request(f"http://127.0.0.1:{hub.address[1]}/offer",
                              data=json.dumps({"type": "offer", "sdp": "v=0\r\nm=audio 9 RTP/AVP 0\r\n"}).encode(),
                              headers={"Content-Type": "application/json", "Authorization": "Bearer " + hub.key})
            with self.assertRaises(HTTPError):
                urlopen(request, timeout=3)
            self.assertEqual(len(hub.peers), 0)
        finally:
            hub.close()


class RealVideoTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_webrtc_decodes_continuous_h264(self):
        import av
        from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription
        hub = bridge_media.MediaHub()
        stopped = threading.Event()
        def produce():
            while not stopped.is_set():
                frame = av.VideoFrame(320, 240, "yuv420p")
                for plane in frame.planes:
                    plane.update(bytes([100]) * plane.buffer_size)
                hub.publish(frame)
                stopped.wait(1 / 30)
        thread = threading.Thread(target=produce, daemon=True)
        thread.start()
        pc = RTCPeerConnection(RTCConfiguration(iceServers=[]))
        frames = []
        done = asyncio.Event()
        @pc.on("track")
        async def track_received(track):
            try:
                for _ in range(45):
                    frame = await track.recv()
                    self.assertEqual((frame.width, frame.height), (320, 240))
                    frames.append(time.monotonic())
                done.set()
            except Exception:
                done.set()
        try:
            pc.addTransceiver("video", direction="recvonly")
            await pc.setLocalDescription(await pc.createOffer())
            def offer():
                request = Request(f"http://127.0.0.1:{hub.address[1]}/offer",
                                  data=json.dumps({"sdp": pc.localDescription.sdp, "type": "offer"}).encode(),
                                  headers={"Content-Type": "application/json", "Authorization": "Bearer " + hub.key})
                with urlopen(request, timeout=9) as response:
                    return json.load(response)
            answer = await asyncio.to_thread(offer)
            await pc.setRemoteDescription(RTCSessionDescription(type=answer["type"], sdp=answer["sdp"]))
            await asyncio.wait_for(done.wait(), 6)
            self.assertEqual(len(frames), 45)
            self.assertGreater((len(frames) - 1) / (frames[-1] - frames[0]), 20)
        finally:
            await pc.close()
            stopped.set()
            thread.join(timeout=2)
            await asyncio.to_thread(hub.close)


class AuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_changed_device_endpoint_closes_old_peer(self):
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///:memory:", "CICSIC_ALLOW_SQLITE_TESTS": "1", "APP_ENV": "test"}):
            from app.api.routes import device_bridges as route
        manager = Mock()
        session = {"manager": manager, "device": "camera", "endpoint": (12345, "private-key"),
                   "token": "revoked", "cookie": None, "expires": time.monotonic() + 10}
        route._media_sessions["peer"] = session
        with patch.object(route.system_control, "verify_admin_token", return_value=False), \
                patch.object(route, "_preview_authorized", return_value=False):
            await route._media_watch("peer", session)
        manager.media_request.assert_called_once_with(session["endpoint"], "close", {"id": "peer"})
        self.assertNotIn("peer", route._media_sessions)

    async def test_video_session_is_accessible_without_credentials_but_device_must_match(self):
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///:memory:", "CICSIC_ALLOW_SQLITE_TESTS": "1", "APP_ENV": "test"}):
            from app.api.routes import device_bridges as route
        from fastapi import HTTPException
        request = Mock(cookies={route.COOKIE_NAME: "different-session"})
        with patch.dict(route._media_sessions, {"peer": {"device": "camera", "token": "owner-token", "cookie": "owner-cookie"}}, clear=True):
            self.assertEqual(route._media_session("camera", "peer", request, None)["device"], "camera")
            with self.assertRaises(HTTPException):
                route._media_session("another-camera", "peer", request, None)


if __name__ == "__main__":
    unittest.main()
