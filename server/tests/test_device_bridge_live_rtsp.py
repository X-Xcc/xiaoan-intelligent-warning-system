"""Real RTSP decoding acceptance with synthetic loopback media, never real cameras."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import unittest
import urllib.request
from http.cookiejar import CookieJar

from test_device_bridges_api import BridgeApiHarness, HAS_ROUTER

MEDIAMTX = os.environ.get("CICSIC_TEST_MEDIAMTX", "")
FFMPEG = shutil.which("ffmpeg")


@unittest.skipUnless(HAS_ROUTER and Path(MEDIAMTX).is_file() and FFMPEG,
                     "Set CICSIC_TEST_MEDIAMTX to run real loopback RTSP acceptance")
class LiveRtspBridgeTests(BridgeApiHarness):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.rtsp_port = sock.getsockname()[1]
        cls.media_log = open(Path(cls.directory.name) / "media.log", "w+", encoding="utf-8")
        cls.publishers = []
        config = Path(cls.directory.name) / "mediamtx.yml"
        config.write_text(
            "logLevel: error\n"
            f"rtspAddress: 127.0.0.1:{cls.rtsp_port}\n"
            "rtspTransports: [tcp]\nrtmp: false\nhls: false\nwebrtc: false\n"
            "srt: false\nmoq: false\nplayback: false\n"
            "authInternalUsers:\n"
            "  - user: fixture-publisher\n    pass: fixture-publish\n"
            "    ips: [127.0.0.1]\n    permissions:\n      - action: publish\n"
            "  - user: fixture-reader\n    pass: fixture-read\n"
            "    ips: [127.0.0.1]\n    permissions:\n      - action: read\n"
            "paths:\n  all_others:\n", encoding="utf-8",
        )
        cls.media = subprocess.Popen(
            [MEDIAMTX, str(config)], cwd=cls.directory.name,
            stdout=cls.media_log, stderr=cls.media_log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if cls.media.poll() is not None:
                raise AssertionError("Loopback RTSP test server exited")
            try:
                with socket.create_connection(("127.0.0.1", cls.rtsp_port), timeout=0.5):
                    return
            except OSError:
                time.sleep(0.1)
        raise AssertionError("Loopback RTSP test server startup timed out")

    @classmethod
    def stop_process(cls, process):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

    @classmethod
    def tearDownClass(cls):
        for publisher in cls.publishers:
            cls.stop_process(publisher)
        cls.stop_process(cls.media)
        cls.media_log.close()
        super().tearDownClass()

    def publish(self, path):
        publisher = subprocess.Popen(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-re", "-f", "lavfi",
             "-i", "testsrc2=size=640x360:rate=12", "-an", "-c:v", "libx264",
             "-preset", "ultrafast", "-tune", "zerolatency", "-g", "12",
             "-pix_fmt", "yuv420p", "-f", "rtsp", "-rtsp_transport", "tcp",
             f"rtsp://fixture-publisher:fixture-publish@127.0.0.1:{self.rtsp_port}{path}"],
            stdout=self.media_log, stderr=self.media_log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        self.publishers.append(publisher)
        return publisher

    def wait_device(self, device_id, predicate, timeout=25):
        deadline = time.monotonic() + timeout
        last = {}
        while time.monotonic() < deadline:
            code, body = self.request("/" + device_id)
            self.assertEqual(code, 200, body)
            last = body["device"]
            if predicate(last):
                return last
            time.sleep(0.2)
        self.fail("Timed out waiting for actual stream state: " + json.dumps(last, ensure_ascii=True))

    def jpeg(self, device_id):
        request = urllib.request.Request(self.base + "/" + device_id + "/snapshot",
                                         headers={"X-Admin-Token": self.token})
        with urllib.request.urlopen(request, timeout=8) as response:
            self.assertEqual(response.headers.get_content_type(), "image/jpeg")
            self.assertIn("no-store", response.headers["Cache-Control"])
            return response.read()

    def test_actual_brand_streams_frames_disconnect_and_reconnect(self):
        import cv2
        import numpy as np

        for kind, path in (("rtsp", "/synthetic-fixture"),
                           ("hikvision", "/Streaming/Channels/101"),
                           ("dahua", "/cam/realmonitor")):
            with self.subTest(kind=kind):
                publisher = self.publish(path)
                device = self.create(kind=kind, name="SYNTHETIC TEST " + kind,
                                     port=self.rtsp_port, username="fixture-reader",
                                     password="fixture-read", rtspPath=path if kind == "rtsp" else "")
                try:
                    code, _ = self.request("/" + device["id"] + "/start", "POST", {})
                    self.assertEqual(code, 200)
                    live = self.wait_device(device["id"], lambda item: item["online"] and item["frameCount"] >= 3)
                    self.assertEqual((live["width"], live["height"]), (640, 360))
                    self.assertGreater(live["fps"], 0)
                    first = self.jpeg(device["id"])
                    pixels = cv2.imdecode(np.frombuffer(first, np.uint8), cv2.IMREAD_COLOR)
                    self.assertEqual(pixels.shape, (360, 640, 3))
                    self.assertGreater(float(pixels.std()), 15)
                    self.wait_device(device["id"], lambda item: item["frameCount"] >= live["frameCount"] + 4)
                    self.assertNotEqual(first, self.jpeg(device["id"]), "Video must contain new frames")
                    request = urllib.request.Request(self.base + "/" + device["id"] + "/feed",
                                                     headers={"X-Admin-Token": self.token})
                    with urllib.request.urlopen(request, timeout=8) as response:
                        self.assertIn("multipart/x-mixed-replace", response.headers["Content-Type"])
                        self.assertIn(b"Content-Type: image/jpeg", response.read(128))
                    self.stop_process(publisher)
                    self.wait_device(device["id"], lambda item: not item["online"], timeout=12)
                    self.assertEqual(self.request("/" + device["id"] + "/snapshot")[0], 503)
                    publisher = self.publish(path)
                    self.wait_device(device["id"], lambda item: item["online"], timeout=25)
                    code, _ = self.request("/" + device["id"] + "/stop", "POST", {})
                    self.assertEqual(code, 200)
                    stopped = self.wait_device(device["id"], lambda item: item["status"] == "stopped")
                    self.assertFalse(stopped["online"])
                finally:
                    self.request("/" + device["id"], "DELETE")
                    self.stop_process(publisher)

    def test_wrong_camera_password_is_not_reported_online_or_leaked(self):
        publisher = self.publish("/wrong-password-fixture")
        device = self.create(kind="rtsp", name="SYNTHETIC AUTH TEST", port=self.rtsp_port,
                             username="fixture-reader", password="fixture-wrong-password",
                             rtspPath="/wrong-password-fixture")
        try:
            code, body = self.request("/" + device["id"] + "/test", "POST", {})
            self.assertEqual(code, 200, body)
            self.assertFalse(body["ok"])
            self.assertFalse(body["device"]["online"])
            self.assertNotIn("fixture-wrong-password", json.dumps(body))
            self.assertEqual(self.request()[1]["runtime"]["running"], 0)
        finally:
            self.request("/" + device["id"], "DELETE")
            self.stop_process(publisher)

    def test_logout_terminates_an_already_open_preview(self):
        publisher = self.publish("/logout-fixture")
        device = self.create(kind="rtsp", name="SYNTHETIC SESSION TEST", port=self.rtsp_port,
                             username="fixture-reader", password="fixture-read", rtspPath="/logout-fixture")
        jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        try:
            self.request("/" + device["id"] + "/start", "POST", {})
            self.wait_device(device["id"], lambda item: item["online"])
            self.assertEqual(self.request("/session", "POST", {}, opener=opener)[0], 200)
            with opener.open(self.base + "/" + device["id"] + "/feed", timeout=5) as response:
                self.assertIn(b"Content-Type: image/jpeg", response.read(128))
                self.assertEqual(self.request("/session", "DELETE", authorized=False, opener=opener)[0], 200)
                deadline = time.monotonic() + 4
                closed = False
                while time.monotonic() < deadline:
                    if not response.read(65536):
                        closed = True
                        break
                self.assertTrue(closed, "Revoked preview continued transmitting frames")
        finally:
            self.request("/" + device["id"], "DELETE")
            self.stop_process(publisher)


if __name__ == "__main__":
    unittest.main()
