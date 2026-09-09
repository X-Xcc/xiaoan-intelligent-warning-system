"""YOLO-compatible sources tested with local synthetic media, not physical cameras."""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import Mock, patch
from urllib.request import parse_http_list, parse_keqv_list

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.bridge_config import validate_config
from app.services.bridge_store import BridgeStore
from app.services.device_bridges import BridgeManager

HAS_SOURCES = importlib.util.find_spec("app.services.bridge_sources") is not None


class SourceConfigTests(unittest.TestCase):
    def test_usb_has_no_network_target_or_credentials(self):
        config = validate_config({"name": "Local fixture", "kind": "usb", "host": "", "usbIndex": 2})
        self.assertEqual(config["usbIndex"], 2)
        for invalid in (-1, 16, True, "0"):
            with self.subTest(index=invalid), self.assertRaises(ValueError):
                validate_config({**config, "usbIndex": invalid})
        for extra in ({"host": "127.0.0.1"}, {"username": "user"}, {"password": "secret"},
                      {"rtspPath": "/live"}, {"httpPath": "/snap"}):
            with self.subTest(fields=list(extra)), self.assertRaises(ValueError):
                validate_config({**config, **extra})

    def test_http_paths_are_separate_and_validated(self):
        for kind in ("http_snapshot", "http_mjpeg"):
            config = validate_config({"name": "HTTP fixture", "kind": kind, "host": "localhost",
                                      "port": 80, "httpScheme": "http", "httpPath": "/snapshot?channel=1"})
            self.assertEqual(config["httpPath"], "/snapshot?channel=1")
            for extra in ({"httpPath": ""}, {"httpPath": "//remote/path"},
                          {"httpPath": "/image?password=secret"}, {"httpScheme": "file"},
                          {"host": "169.254.169.254"}, {"rtspPath": "/other"}):
                with self.subTest(kind=kind, fields=list(extra)), self.assertRaises(ValueError):
                    validate_config({**config, **extra})

    def test_legacy_registry_loads_new_defaults_without_rewrite(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            store = BridgeStore(directory)
            row = validate_config({"name": "Legacy", "kind": "hikvision", "host": "127.0.0.1"})
            for key in ("httpScheme", "httpPath", "usbIndex"):
                row.pop(key, None)
            row.update(id="a" * 32, createdAt="2026-09-09T00:00:00+00:00", updatedAt="2026-09-09T00:00:00+00:00")
            store.save("devices.json", [row])
            before = (Path(directory) / "devices.json").read_bytes()
            manager = BridgeManager(directory)
            device = manager.get_device("a" * 32)
            self.assertEqual(device["httpScheme"], "http")
            self.assertEqual(device["usbIndex"], 0)
            self.assertEqual(before, (Path(directory) / "devices.json").read_bytes())

    def test_compatible_sources_module_exists(self):
        self.assertTrue(HAS_SOURCES)

    def test_legacy_record_missing_password_still_fails_closed(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            store = BridgeStore(directory)
            row = validate_config({"name": "Invalid legacy", "kind": "hikvision", "host": "127.0.0.1"})
            row.pop("password")
            row.update(id="b" * 32, createdAt="2026-09-09T00:00:00+00:00", updatedAt="2026-09-09T00:00:00+00:00")
            store.save("devices.json", [row])
            with self.assertRaises(RuntimeError):
                BridgeManager(directory)

    def test_kind_changes_discard_inapplicable_paths_and_previous_credentials(self):
        previous = validate_config({"name": "Previous", "kind": "hikvision", "host": "127.0.0.1",
                                    "rtspPath": "/Streaming/Channels/101", "username": "old",
                                    "password": "previous-password"})
        usb = validate_config({"kind": "usb", "host": "", "usbIndex": 1}, previous)
        self.assertEqual((usb["password"], usb["rtspPath"], usb["username"]), ("", "", ""))
        http = validate_config({"kind": "http_snapshot", "httpPath": "/snapshot", "port": 80}, previous)
        self.assertEqual((http["password"], http["rtspPath"]), ("", ""))
        rtsp = validate_config({"kind": "rtsp", "rtspPath": "/live"}, http)
        self.assertEqual(rtsp["httpPath"], "")


@unittest.skipUnless(HAS_SOURCES, "Source adapters not implemented yet")
class SourceDecodingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import cv2
        import numpy as np
        cls.images = []
        for color in ((30, 160, 220), (210, 40, 100)):
            image = np.zeros((96, 128, 3), dtype=np.uint8)
            image[:] = color
            cls.images.append(cv2.imencode(".jpg", image)[1].tobytes())
        cls.larger_image = cv2.imencode(".jpg", np.zeros((192, 256, 3), dtype=np.uint8))[1].tobytes()
        cls.requests = []
        cls.counter = 0
        cls.realm, cls.nonce = "fixture", "fixture-nonce"

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                cls.requests.append((self.path, self.headers.get("Host"), self.headers.get("Authorization", "")))
                if self.path == "/slow":
                    time.sleep(6)
                    return
                auth = self.headers.get("Authorization", "")
                accepted = True
                if self.path == "/basic":
                    accepted = auth == "Basic " + base64.b64encode(b"reader:fixture-password").decode()
                elif self.path == "/digest":
                    accepted = False
                    if auth.startswith("Digest "):
                        parts = parse_keqv_list(parse_http_list(auth[7:]))
                        digest = lambda text: hashlib.md5(text.encode()).hexdigest()
                        ha1 = digest("reader:fixture:fixture-password")
                        ha2 = digest("GET:/digest")
                        expected = digest(":".join((ha1, cls.nonce, parts.get("nc", ""),
                                                    parts.get("cnonce", ""), "auth", ha2)))
                        accepted = parts.get("response") == expected
                if not accepted:
                    self.send_response(401)
                    self.send_header("WWW-Authenticate", f'Digest realm="{cls.realm}", nonce="{cls.nonce}", qop="auth"' if self.path == "/digest" else 'Basic realm="fixture"')
                    self.end_headers()
                    return
                if self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/private-target")
                    self.end_headers()
                    return
                if self.path == "/html":
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html")
                    self.end_headers()
                    self.wfile.write(b"<html>not a camera frame</html>")
                    return
                if self.path == "/large":
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", "999999999")
                    self.end_headers()
                    return
                self.send_response(200)
                multipart = self.path.startswith("/mjpeg")
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame" if multipart else "image/jpeg")
                self.end_headers()
                try:
                    if multipart:
                        for number in range(120):
                            image = cls.images[number % 2]
                            if self.path == "/mjpeg-grow" and number >= 3:
                                image = cls.larger_image
                            self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                             + str(len(image)).encode() + b"\r\n\r\n" + image + b"\r\n")
                            self.wfile.flush()
                            time.sleep(0.02)
                    else:
                        cls.counter += 1
                        self.wfile.write(cls.images[cls.counter % 2])
                except (OSError, BrokenPipeError):
                    pass
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def config(self, path="/basic", **overrides):
        return validate_config({"name": "Synthetic HTTP", "kind": "http_snapshot",
                                "host": "127.0.0.1", "port": self.server.server_port,
                                "httpPath": path, "username": "reader", "password": "fixture-password",
                                **overrides})

    def test_snapshot_basic_digest_and_host_pinning_produce_decoded_frames(self):
        from app.services import bridge_sources
        for path in ("/basic", "/digest"):
            stopped = threading.Event()
            emitter = Mock()
            images = []
            def collect(image):
                images.append(image)
                if len(images) >= 2:
                    stopped.set()
            emitter.image.side_effect = collect
            with patch.object(bridge_sources, "resolve_host", return_value="127.0.0.1") as resolver:
                bridge_sources.decode_http(self.config(path, host="camera.invalid"), emitter, stopped)
            self.assertEqual(resolver.call_count, 1)
            self.assertEqual(images[0].shape, (96, 128, 3))
            self.assertFalse((images[0] == images[1]).all())
            self.assertTrue(any(host == f"camera.invalid:{self.server.server_port}" for _, host, _ in self.requests))

    def test_mjpeg_real_demux_changes_frames_and_stops(self):
        from app.services import bridge_sources
        stopped = threading.Event()
        emitter = Mock()
        images = []
        def collect(image):
            images.append(image)
            if len(images) == 3:
                stopped.set()
        emitter.image.side_effect = collect
        bridge_sources.decode_http(self.config("/mjpeg", kind="http_mjpeg"), emitter, stopped)
        self.assertEqual(len(images), 3)
        self.assertFalse((images[0] == images[1]).all())

    def test_http_rejects_redirect_html_oversize_and_wrong_password_without_frames(self):
        from app.services import bridge_sources
        for path, overrides in (("/redirect", {}), ("/html", {}), ("/large", {}),
                                ("/basic", {"password": "wrong-private-password"})):
            emitter = Mock()
            with self.subTest(path=path), self.assertRaises(Exception) as result:
                bridge_sources.decode_http(self.config(path, **overrides), emitter, threading.Event())
            emitter.image.assert_not_called()
            self.assertNotIn("wrong-private-password", str(result.exception))
        self.assertFalse(any(path == "/private-target" for path, _, _ in self.requests))

    def test_pixel_limit_reaches_decoder_before_open_and_survives_resolution_changes(self):
        import av
        from app.services import bridge_sources
        from app.services.bridge_worker import BridgeFailure
        native_open = av.open
        def open_with_native_limit(*args, **kwargs):
            # Disable later Python checks to prove native decoding enforces the limit.
            bridge_sources.MAX_INPUT_PIXELS = sys.maxsize
            return native_open(*args, **kwargs)
        for kind, path, limit in (("http_snapshot", "/basic", 10000),
                                  ("http_mjpeg", "/mjpeg", 10000),
                                  ("http_mjpeg", "/mjpeg-grow", 20000)):
            emitter = Mock()
            stopped = threading.Event()
            emitter.image.side_effect = lambda _: stopped.set() if emitter.image.call_count >= 8 else None
            with self.subTest(kind=kind, path=path), \
                    patch.object(bridge_sources, "MAX_INPUT_PIXELS", limit), \
                    patch.object(av, "open", side_effect=open_with_native_limit) as open_media:
                with self.assertRaises(BridgeFailure):
                    bridge_sources.decode_http(self.config(path, kind=kind), emitter, stopped)
                self.assertEqual(open_media.call_args.kwargs.get("options", {}).get("max_pixels"), str(limit))
                if path == "/mjpeg-grow":
                    self.assertGreater(emitter.image.call_count, 0)
                    self.assertTrue(all(call.args[0].shape == (96, 128, 3) for call in emitter.image.call_args_list))
                else:
                    emitter.image.assert_not_called()

    def test_usb_uses_source_backend_parameters_releases_without_fallback(self):
        import cv2
        import numpy as np
        from app.services import bridge_sources
        capture = Mock()
        capture.isOpened.return_value = True
        capture.read.return_value = True, np.zeros((96, 128, 3), dtype=np.uint8)
        stopped = threading.Event()
        emitter = Mock()
        emitter.image.side_effect = lambda _: stopped.set()
        with patch.object(cv2, "VideoCapture", return_value=capture) as factory:
            bridge_sources.decode_usb(validate_config({"name": "USB fixture", "kind": "usb", "host": "", "usbIndex": 2}), emitter, stopped)
        self.assertEqual(factory.call_args.args[0], 2)
        self.assertIn(unittest.mock.call(cv2.CAP_PROP_FRAME_WIDTH, 1280), capture.set.call_args_list)
        self.assertIn(unittest.mock.call(cv2.CAP_PROP_FPS, 30), capture.set.call_args_list)
        capture.release.assert_called_once()


from test_device_bridges_api import BridgeApiHarness


@unittest.skipUnless(HAS_SOURCES, "Source adapters not implemented yet")
class SourceApiTests(BridgeApiHarness):
    @classmethod
    def setUpClass(cls):
        SourceDecodingTests.setUpClass()
        try:
            super().setUpClass()
        except Exception:
            SourceDecodingTests.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        try:
            super().tearDownClass()
        finally:
            SourceDecodingTests.tearDownClass()

    def test_http_sources_run_in_isolated_worker_and_report_real_frames(self):
        for kind, path in (("http_snapshot", "/digest"), ("http_mjpeg", "/mjpeg")):
            device = self.create(name="SYNTHETIC HTTP", kind=kind, host="127.0.0.1",
                                 port=SourceDecodingTests.server.server_port, username="reader",
                                 password="fixture-password", httpPath=path)
            try:
                code, result = self.request("/" + device["id"] + "/test", "POST", {})
                self.assertEqual(code, 200)
                self.assertTrue(result["ok"], result["checks"])
                self.assertEqual(result["device"]["status"], "stopped")
                self.assertEqual(self.request("/" + device["id"] + "/start", "POST", {})[0], 200)
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    latest = self.request("/" + device["id"])[1]["device"]
                    if latest["online"] and latest["frameCount"] >= 3:
                        break
                    time.sleep(0.2)
                self.assertTrue(latest["online"])
                self.assertGreaterEqual(latest["frameCount"], 3)
                self.assertEqual((latest["width"], latest["height"]), (128, 96))
                self.assertEqual(self.request("/" + device["id"] + "/stop", "POST", {})[0], 200)
                self.assertFalse(self.request("/" + device["id"])[1]["device"]["online"])
            finally:
                self.request("/" + device["id"], "DELETE")

    def test_http_auth_failure_reports_auth_and_usb_creation_does_not_open_hardware(self):
        device = self.create(kind="http_snapshot", httpPath="/basic", username="reader",
                             password="wrong-password", port=SourceDecodingTests.server.server_port)
        try:
            code, result = self.request("/" + device["id"] + "/test", "POST", {})
            self.assertEqual(code, 200)
            self.assertFalse(result["ok"])
            self.assertTrue(any("401/403" in item["message"] for item in result["checks"]), result["checks"])
            code, updated = self.request("/" + device["id"], "PUT", {"kind": "usb", "host": "", "usbIndex": 3})
            self.assertEqual(code, 200, updated)
            self.assertFalse(updated["device"]["hasPassword"])
            self.assertEqual(updated["device"]["status"], "stopped")
            self.assertEqual(self.request()[1]["runtime"]["running"], 0)
        finally:
            self.request("/" + device["id"], "DELETE")

    def test_worker_preserves_http_timeout_diagnostic(self):
        device = self.create(kind="http_snapshot", httpPath="/slow",
                             port=SourceDecodingTests.server.server_port)
        try:
            code, result = self.request("/" + device["id"] + "/test", "POST", {})
            self.assertEqual(code, 200)
            self.assertFalse(result["ok"])
            self.assertTrue(any(item["stage"] == "network" and not item["ok"]
                                for item in result["checks"]), result["checks"])
        finally:
            self.request("/" + device["id"], "DELETE")

if __name__ == "__main__":
    unittest.main()
