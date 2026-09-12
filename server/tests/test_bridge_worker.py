"""Offline protocol and real decoder tests; never contact physical devices."""
from __future__ import annotations

import importlib
import errno
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import sysconfig
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from app.services import bridge_config
except ImportError:
    bridge_config = None
try:
    from app.services import bridge_worker as worker
except ImportError:
    worker = None


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(bridge_config, "The bridge configuration has not been implemented")

    def test_raw_rtsp_templates_and_encoded_credentials(self):
        base = {"name": "Fixture", "host": "::1", "username": "fixture@user",
                "password": "fixture:/?#@%", "channel": 2}
        expected = [
            ("hikvision", "main", "/Streaming/Channels/201"),
            ("hikvision", "sub", "/Streaming/Channels/202"),
            ("dahua", "main", "/cam/realmonitor?channel=2&subtype=0"),
            ("dahua", "sub", "/cam/realmonitor?channel=2&subtype=1"),
            ("rtsp", "sub", "/custom?profile=2"),
        ]
        for kind, stream, path in expected:
            with self.subTest(kind=kind, stream=stream):
                config = bridge_config.validate_config(
                    {**base, "kind": kind, "stream": stream,
                     "rtspPath": "/custom?profile=2" if kind == "rtsp" else ""})
                url = bridge_config.rtsp_url(config)
                self.assertEqual(url, "rtsp://fixture%40user:fixture%3A%2F%3F%23%40%25@[::1]:554" + path)
                self.assertNotIn("&amp;", url)

    def test_brand_camera_explicit_path_overrides_template(self):
        for kind in ("hikvision", "dahua"):
            with self.subTest(kind=kind):
                config = bridge_config.validate_config(
                    {"name": "Fixture", "kind": kind, "host": "127.0.0.1",
                     "rtspPath": "/custom-video?profile=3", "channel": 8, "stream": "sub"})
                self.assertEqual(bridge_config.rtsp_url(config),
                                 "rtsp://127.0.0.1:554/custom-video?profile=3")

    def test_dns_answers_are_checked_and_pinned_before_driver_access(self):
        from unittest.mock import patch
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("169.254.169.254", 554)),
        ]):
            with self.assertRaises(ValueError):
                bridge_config.resolve_host("camera.local", 554)
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("127.0.0.1", 554)),
        ]):
            self.assertEqual(bridge_config.resolve_host("camera.local", 554), "127.0.0.1")

    def test_scoped_ipv6_and_oversized_encoded_config_are_rejected(self):
        with self.assertRaises(ValueError):
            bridge_config.validate_host("fd12:3456::8%eth0")
        with self.assertRaises(ValueError):
            bridge_config.validate_config({"name": "\u6d4b" * 120, "kind": "rtsp", "host": "::1",
                                           "rtspPath": "/" + "\u6d4b" * 2047,
                                           "username": "\u6d4b" * 256, "password": "\u6d4b" * 512})

    def test_config_cannot_embed_credentials_in_query_variants(self):
        for path in ("/a?session_token=secret", "/a?authentication=secret", "/a?user-name=secret"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                bridge_config.validate_config({"name": "Fixture", "kind": "rtsp", "host": "::1",
                                               "rtspPath": path})


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(worker, "The isolated worker has not been implemented")

    def test_real_jpeg_encoding_dimensions_and_source_rate_limit(self):
        import cv2
        import numpy as np
        output = io.BytesIO()
        emitter = worker.Emitter(output)
        image = np.zeros((1080, 1920, 3), dtype=np.uint8)
        for _ in range(5):
            emitter.image(image)
        lines = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(lines), 1)
        event = lines[0]
        import base64
        encoded = base64.b64decode(event["jpeg"], validate=True)
        decoded = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_COLOR)
        self.assertEqual(decoded.shape[:2], (720, 1280))
        self.assertLessEqual(len(encoded), worker.MAX_JPEG_BYTES)
        self.assertEqual((event["width"], event["height"]), (1280, 720))

    def test_protocol_retries_short_writes(self):
        class ShortStream(io.BytesIO):
            def write(self, data):
                return super().write(data[:3])
        output = ShortStream()
        worker.Emitter(output).status("connecting", "connect", "connecting")
        self.assertEqual(json.loads(output.getvalue())["type"], "status")

    def test_failure_classification_is_safe_and_distinguishes_auth_from_network(self):
        self.assertTrue(hasattr(worker, "classify_failure"), "Safe failure classification is missing")
        cases = [
            (socket.gaierror(-2, "fixture-private"), "dns", ("dns", "dns_failed")),
            (ConnectionRefusedError(errno.ECONNREFUSED, "fixture-private"), "stream",
             ("network", "network_refused")),
            (TimeoutError(errno.ETIMEDOUT, "fixture-private"), "stream", ("network", "network_timeout")),
            (OSError(errno.ENETUNREACH, "fixture-private"), "network", ("network", "network_unreachable")),
            (RuntimeError("Server returned 401 Unauthorized rtsp://user:fixture-private@host"),
             "stream", ("stream", "auth_failed")),
            (RuntimeError("403 Forbidden fixture-private"), "stream", ("stream", "auth_failed")),
            (RuntimeError("Decoder not found fixture-private"), "decode", ("decode", "unsupported_stream")),
            (RuntimeError("Invalid data found fixture-private"), "decode", ("decode", "decode_failed")),
            (RuntimeError("fixture-private"), "stream", ("stream", "stream_failed")),
        ]
        for error, stage, expected in cases:
            with self.subTest(expected=expected):
                classified = worker.classify_failure(error, stage)
                self.assertEqual(classified, expected)
                self.assertNotIn("fixture-private", repr(classified))

    def test_av_decoder_uses_raw_rtsp_tcp_allowlist_timeouts_and_real_frames(self):
        import av
        import numpy as np
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.mp4"
            with av.open(str(path), "w") as container:
                stream = container.add_stream("mpeg4", rate=8)
                stream.width, stream.height, stream.pix_fmt = 64, 48, "yuv420p"
                for index in range(3):
                    frame = av.VideoFrame.from_ndarray(
                        np.full((48, 64, 3), index * 50, dtype=np.uint8), format="bgr24")
                    for packet in stream.encode(frame):
                        container.mux(packet)
                for packet in stream.encode():
                    container.mux(packet)
            real_open = av.open
            observed = {}
            def open_fixture(url, **kwargs):
                observed.update(url=url, **kwargs)
                return real_open(str(path))
            output = io.BytesIO()
            listener = socket.socket()
            self.addCleanup(listener.close)
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
            port = listener.getsockname()[1]
            config = bridge_config.validate_config(
                {"name": "Fixture", "kind": "dahua", "host": "127.0.0.1", "port": port, "channel": 2})
            with patch.object(av, "open", side_effect=open_fixture):
                with self.assertRaises((EOFError, RuntimeError)):
                    worker.decode_rtsp(config, worker.Emitter(output), threading.Event())
            self.assertEqual(observed["url"], f"rtsp://127.0.0.1:{port}/cam/realmonitor?channel=2&subtype=0")
            self.assertEqual(observed["options"]["rtsp_transport"], "tcp")
            self.assertEqual(set(observed["options"]["protocol_whitelist"].split(",")), {"rtsp", "tcp", "rtp"})
            self.assertEqual(observed["timeout"], (worker.OPEN_TIMEOUT, worker.READ_TIMEOUT))
            events = [json.loads(line) for line in output.getvalue().splitlines()]
            self.assertTrue(any(event["type"] == "frame" for event in events))
            self.assertEqual([event["code"] for event in events if event["type"] == "status"],
                             ["dns_ok", "network_ok", "stream_ok", "decoding"])

    def test_loopback_refused_port_never_reports_stream_or_auth_success(self):
        self.assertTrue(hasattr(worker, "classify_failure"), "Safe failure classification is missing")
        import av
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()
        config = bridge_config.validate_config(
            {"name": "Fixture", "kind": "rtsp", "host": "127.0.0.1",
             "port": port, "rtspPath": "/fixture"})
        output = io.BytesIO()
        with patch.object(av, "open", side_effect=AssertionError("No decoder access before TCP success")):
            with self.assertRaises(worker.BridgeFailure) as caught:
                worker.decode_rtsp(config, worker.Emitter(output), threading.Event())
        self.assertEqual(caught.exception.code, "network_refused")
        self.assertNotIn(b"stream_ok", output.getvalue())


    def test_go2_installed_import_names_and_windows_guard_restore(self):
        import platform
        original = platform.system
        with worker.windows_platform_import_guard(is_windows=True):
            self.assertEqual(platform.system(), "Windows")
        self.assertIs(platform.system, original)
        connection, modes = worker.load_go2()
        self.assertEqual(connection.__module__, "unitree_webrtc_connect.webrtc_driver")
        self.assertTrue(hasattr(modes, "LocalSTA"))
        self.assertTrue(hasattr(modes, "LocalAP"))

    def test_subprocess_protocol_suppresses_native_and_python_logging_noise(self):
        code = (
            "import sys,os,logging;"
            f"sys.path.insert(0,{str(Path(__file__).resolve().parents[1])!r});"
            "from app.services.bridge_worker import isolated_output;"
            "out=isolated_output();"
            "print('fixture-private');logging.error('fixture-private');"
            "os.write(1,b'fixture-private\\n');os.write(2,b'fixture-private\\n');"
            "out.write(b'{\"type\":\"status\"}\\n');out.flush()"
        )
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=8,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'{"type":"status"}\n')
        self.assertEqual(result.stderr, b"")

    @unittest.skipUnless(os.name == "nt", "Windows native standard handles")
    def test_windows_native_standard_handles_cannot_write_to_protocol_pipe(self):
        code = f"""
import sys, ctypes
sys.path.insert(0, {str(Path(__file__).resolve().parents[1])!r})
from app.services.bridge_worker import isolated_output
output = isolated_output()
kernel = ctypes.windll.kernel32
kernel.GetStdHandle.restype = ctypes.c_void_p
kernel.WriteFile.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong,
                            ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
noise = ctypes.create_string_buffer(b"fixture-private\\n")
written = ctypes.c_ulong()
for identifier in (-11, -12):
    kernel.WriteFile(kernel.GetStdHandle(identifier), noise, len(noise.value),
                     ctypes.byref(written), None)
output.write(b'{{"type":"status"}}\\n')
output.flush()
"""
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=8,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'{"type":"status"}\n')
        self.assertEqual(result.stderr, b"")

    def test_invalid_worker_input_is_bounded_and_does_not_echo_secrets(self):
        command = [sys.executable, "-u", str(Path(worker.__file__).resolve())]
        for payload in (b'{"password":"fixture-private","kind":"file"}\n',
                        b"x" * 20_000 + b"\n"):
            result = subprocess.run(command, input=payload, capture_output=True, timeout=8,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(b"fixture-private", result.stdout + result.stderr)
            self.assertEqual(result.stderr, b"")
            self.assertLess(len(result.stdout), 1024)
            self.assertEqual(json.loads(result.stdout)["status"], "error")

    def test_real_loopback_open_timeout_emits_sanitized_reconnect_status(self):
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        listener.settimeout(15)
        accepted = []
        def hold_connection():
            try:
                connection, _ = listener.accept()
                accepted.append(connection)
            except OSError:
                pass
        thread = threading.Thread(target=hold_connection, daemon=True)
        thread.start()
        config = {"name": "Fixture", "kind": "rtsp", "host": "127.0.0.1",
                  "port": listener.getsockname()[1], "rtspPath": "/fixture",
                  "username": "fixture-user", "password": "fixture-private"}
        executable = getattr(sys, "_base_executable", sys.executable) if os.name == "nt" else sys.executable
        environment = {**os.environ, "PYTHONPATH": sysconfig.get_path("purelib")}
        process = subprocess.Popen([executable, "-u", str(Path(worker.__file__).resolve())],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env=environment,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            process.stdin.write(json.dumps(config).encode() + b"\n")
            process.stdin.close()
            process.stdin = None
            try:
                stdout, stderr = process.communicate(timeout=worker.OPEN_TIMEOUT + 4)
            except subprocess.TimeoutExpired:
                process.terminate()
                stdout, stderr = process.communicate(timeout=4)
            self.assertNotIn(b"fixture-private", stdout + stderr)
            self.assertEqual(stderr, b"")
            events = [json.loads(line) for line in stdout.splitlines()]
            self.assertTrue(any(event.get("status") == "reconnecting" for event in events))
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=4)
            listener.close()
            for connection in accepted:
                connection.close()
            thread.join(timeout=1)

    def test_driver_retry_uses_exponential_backoff_and_never_serializes_exception(self):
        class Stop:
            def __init__(self):
                self.waits = []
            def is_set(self):
                return len(self.waits) >= 4
            def wait(self, delay):
                self.waits.append(delay)
                return self.is_set()
        stopped = Stop()
        output = io.BytesIO()
        with patch.object(worker, "decode_rtsp", side_effect=RuntimeError("fixture-private")):
            worker.run({"kind": "rtsp"}, worker.Emitter(output), stopped)
        self.assertEqual(stopped.waits, [0.5, 1.0, 2.0, 4.0])
        self.assertNotIn(b"fixture-private", output.getvalue())


class Go2LifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_video_callback_disconnect_and_no_cloud_credentials(self):
        self.assertIsNotNone(worker, "The isolated worker has not been implemented")
        import asyncio
        from types import SimpleNamespace
        calls = []
        class Video:
            def add_track_callback(self, callback):
                calls.append(("callback", callable(callback)))
            def switchVideoChannel(self, enabled):
                calls.append(("video", enabled))
                if enabled:
                    raise RuntimeError("Fixture video failed after negotiation")
        class Connection:
            def __init__(self, mode, **kwargs):
                calls.append(("init", mode, kwargs))
                self.isConnected = False
            async def connect(self):
                self.video = Video()
                self.isConnected = True
                await asyncio.sleep(0)
            async def disconnect(self):
                calls.append(("disconnect",))
        config = {"host": "127.0.0.1", "port": 554, "go2Mode": "LocalSTA",
                  "username": "fixture-user", "password": "fixture-private"}
        modes = SimpleNamespace(LocalSTA="sta", LocalAP="ap")
        before = dict(os.environ)
        with patch.object(worker, "load_go2", return_value=(Connection, modes)):
            with self.assertRaises(RuntimeError):
                await worker.decode_go2(config, worker.Emitter(io.BytesIO()), threading.Event())
        self.assertEqual(calls[0], ("init", "sta", {"ip": "127.0.0.1"}))
        self.assertIn(("callback", True), calls)
        self.assertIn(("video", True), calls)
        self.assertIn(("video", False), calls)
        self.assertIn(("disconnect",), calls)
        self.assertEqual(before, dict(os.environ))


if __name__ == "__main__":
    unittest.main()
