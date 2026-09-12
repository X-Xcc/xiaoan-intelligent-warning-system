"""Per-worker WebRTC output. Signaling stays authenticated and loopback-only."""
from __future__ import annotations

import asyncio
from fractions import Fraction
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import secrets
import threading
import time

from aiortc import RTCConfiguration, RTCPeerConnection, RTCRtpSender, RTCSessionDescription, VideoStreamTrack
from aiortc.mediastreams import MediaStreamError

MAX_PEERS = 4
LEASE_SECONDS = 6
MAX_SDP_BYTES = 100_000


class LatestVideo:
    """One frame per source, not an unbounded queue per viewer."""
    def __init__(self):
        self.frame = None
        self.version = 0
        self.changed = asyncio.Event()
        self.closed = False

    def publish(self, frame):
        self.frame = frame
        self.version += 1
        previous, self.changed = self.changed, asyncio.Event()
        previous.set()

    def close(self):
        self.closed = True
        self.frame = None
        self.changed.set()

    def subscribe(self):
        source = self

        class Track(VideoStreamTrack):
            def __init__(self):
                super().__init__()
                self.version = -1

            async def recv(self):
                while not source.closed and self.readyState == "live":
                    if source.frame is not None and source.version != self.version:
                        self.version = source.version
                        return source.frame
                    await source.changed.wait()
                raise MediaStreamError

        return Track()


class MediaHub:
    def __init__(self):
        self.key = secrets.token_urlsafe(32)
        self.loop = asyncio.new_event_loop()
        self.source = LatestVideo()
        self.peers = {}
        self._pending = None
        self._scheduled = False
        self._lock = threading.Lock()
        self._closed = False
        self.started_at = time.monotonic()
        self._thread = threading.Thread(target=self.loop.run_forever, daemon=True, name="bridge-webrtc")
        self._thread.start()
        hub = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + hub.key):
                    self.send_error(401)
                    return
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length <= MAX_SDP_BYTES:
                        self.send_error(413)
                        return
                    self.connection.settimeout(3)
                    data = json.loads(self.rfile.read(length))
                    future = asyncio.run_coroutine_threadsafe(hub.command(self.path, data), hub.loop)
                    try:
                        result = future.result(timeout=8)
                    except TimeoutError:
                        future.cancel()
                        raise
                    body = json.dumps(result).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except Exception:
                    self.send_error(503, "Media negotiation unavailable")

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.address = self.server.server_address
        self._http = threading.Thread(target=self.server.serve_forever, daemon=True, name="bridge-signaling")
        self._http.start()
        self._watch = asyncio.run_coroutine_threadsafe(self._expire(), self.loop)

    def publish(self, frame):
        # At most one cross-thread callback is pending, even if encoding is slow.
        with self._lock:
            if self._closed:
                return
            self._pending = frame
            if not self._scheduled:
                self._scheduled = True
                self.loop.call_soon_threadsafe(self._publish_latest)

    def _publish_latest(self):
        with self._lock:
            frame, self._pending = self._pending, None
            self._scheduled = False
        if frame is not None:
            frame.pts = int((time.monotonic() - self.started_at) * 90000)
            frame.time_base = Fraction(1, 90000)
            self.source.publish(frame)

    async def command(self, path, data):
        if path == "/offer":
            sdp = data.get("sdp")
            if (data.get("type") != "offer" or not isinstance(sdp, str)
                    or not sdp.startswith("v=0") or len(sdp) > MAX_SDP_BYTES
                    or sdp.count("m=video ") != 1
                    or any(line.startswith("m=") and not line.startswith("m=video ")
                           for line in sdp.splitlines())):
                raise ValueError("Invalid video-only SDP")
            if len(self.peers) >= MAX_PEERS:
                raise RuntimeError("Viewer capacity reached")
            identifier = secrets.token_hex(16)
            pc = RTCPeerConnection(RTCConfiguration(iceServers=[]))
            self.peers[identifier] = (pc, time.monotonic() + LEASE_SECONDS)

            @pc.on("connectionstatechange")
            async def changed():
                if pc.connectionState in ("failed", "closed"):
                    await self._close_peer(identifier)

            try:
                await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
                pc.addTrack(self.source.subscribe())
                for transceiver in pc.getTransceivers():
                    if transceiver.kind == "video":
                        codecs = [codec for codec in RTCRtpSender.getCapabilities("video").codecs
                                  if codec.mimeType.lower() == "video/h264"]
                        transceiver.setCodecPreferences(codecs)
                await pc.setLocalDescription(await pc.createAnswer())
                return {"id": identifier, "sdp": pc.localDescription.sdp, "type": "answer"}
            except BaseException:
                await self._close_peer(identifier)
                raise
        identifier = data.get("id")
        if path == "/close":
            await self._close_peer(identifier)
            return {"closed": True}
        if path == "/renew" and identifier in self.peers:
            pc, _ = self.peers[identifier]
            self.peers[identifier] = (pc, time.monotonic() + LEASE_SECONDS)
            return {"alive": True}
        raise ValueError("Unknown media session")

    async def _close_peer(self, identifier):
        peer = self.peers.pop(identifier, None)
        if peer:
            await peer[0].close()

    async def _expire(self):
        while True:
            await asyncio.sleep(0.5)
            now = time.monotonic()
            for identifier, (_, expires) in list(self.peers.items()):
                if now >= expires:
                    await self._close_peer(identifier)

    async def _shutdown(self):
        self.source.close()
        for identifier in list(self.peers):
            await self._close_peer(identifier)

    def close(self):
        with self._lock:
            self._closed = True
        self.server.shutdown()
        self.server.server_close()
        self._http.join(timeout=2)
        self._watch.cancel()
        asyncio.run_coroutine_threadsafe(self._shutdown(), self.loop).result(timeout=5)
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(timeout=3)
        self.loop.close()
