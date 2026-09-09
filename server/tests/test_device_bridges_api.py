"""HTTP acceptance for bridge management, without contacting physical devices."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))
HAS_ROUTER = importlib.util.find_spec("app.api.routes.device_bridges") is not None


class BridgeRoutePresenceTests(unittest.TestCase):
    def test_bridge_router_exists(self):
        self.assertTrue(HAS_ROUTER, "The operational device bridge API is missing")


@unittest.skipUnless(HAS_ROUTER, "Bridge router not implemented yet")
class PreviewStreamAuthorizationTests(unittest.TestCase):
    def test_header_rotation_stops_before_the_next_authorization_window(self):
        from app.api.routes import device_bridges as route
        manager = Mock()
        manager.frames.return_value = iter([b"first", b"second", b"blocked"])
        with patch.object(route.time, "monotonic", side_effect=[10, 10.2, 10.6]), \
                patch.object(route.system_control, "verify_admin_token", side_effect=[True, False]) as verify:
            frames = list(route._stream_frames(manager, "device", None, "old-token"))
        self.assertEqual(len(frames), 2)
        self.assertEqual(verify.call_count, 2)
        self.assertNotIn(b"blocked", b"".join(frames))

    def test_cookie_expiry_stops_active_stream(self):
        from app.api.routes import device_bridges as route
        manager = Mock()
        manager.frames.return_value = iter([b"first", b"blocked"])
        with patch.dict(route._sessions, {"preview": (10.5, "valid-token")}, clear=True), \
                patch.object(route.time, "monotonic", side_effect=[10, 10, 10.6, 10.6]), \
                patch.object(route.system_control, "verify_admin_token", side_effect=lambda token: token == "valid-token"):
            frames = list(route._stream_frames(manager, "device", "preview", None))
            self.assertNotIn("preview", route._sessions)
        self.assertEqual(len(frames), 1)

    def test_revoked_cookie_does_not_emit_even_the_first_frame(self):
        from app.api.routes import device_bridges as route
        manager = Mock()
        manager.frames.return_value = iter([b"blocked"])
        with patch.dict(route._sessions, {}, clear=True), \
                patch.object(route.system_control, "verify_admin_token", return_value=False):
            self.assertEqual(list(route._stream_frames(manager, "device", "revoked", None)), [])


class BridgeApiHarness(unittest.TestCase):
    configured_token = None
    app_environment = "test"
    short_admin_tokens = "false"

    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="cicsic-bridge-api-")
        cls.token = cls.configured_token or secrets.token_urlsafe(32)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}/api/device-bridges"
        cls.log = open(Path(cls.directory.name) / "server.log", "w+", encoding="utf-8")
        environment = dict(os.environ)
        environment.update({
            "DATABASE_URL": "sqlite:///" + (Path(cls.directory.name) / "test.db").as_posix(),
            "CICSIC_ALLOW_SQLITE_TESTS": "1",
            "APP_ENV": cls.app_environment,
            "CICSIC_ADMIN_AUTH_ENABLED": "true",
            "CICSIC_ADMIN_TOKEN": cls.token,
            "CICSIC_ALLOW_SHORT_ADMIN_TOKEN": cls.short_admin_tokens,
            "CICSIC_BRIDGE_DATA_DIR": str(Path(cls.directory.name) / "bridges"),
        })
        cls.process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--app-dir", str(ROOT / "server"),
             "--host", "127.0.0.1", "--port", str(cls.port), "--log-level", "warning"],
            cwd=ROOT, env=environment, stdout=cls.log, stderr=cls.log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if cls.process.poll() is not None:
                raise AssertionError("Isolated API exited during startup")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{cls.port}/api/health", timeout=1):
                    return
            except OSError:
                time.sleep(0.2)
        cls.process.terminate()
        cls.process.wait(timeout=8)
        raise AssertionError("Isolated API startup timed out")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        try:
            cls.process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            cls.process.kill()
            cls.process.wait(timeout=5)
        cls.log.close()
        for attempt in range(20):
            try:
                cls.directory.cleanup()
                break
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.1)

    def request(self, path="", method="GET", data=None, authorized=True, opener=None):
        headers = {"Content-Type": "application/json"}
        if authorized:
            headers["X-Admin-Token"] = self.token
        request = urllib.request.Request(
            self.base + path, method=method, headers=headers,
            data=json.dumps(data).encode() if data is not None else None,
        )
        try:
            with (opener.open(request, timeout=20) if opener else urllib.request.urlopen(request, timeout=20)) as response:
                content = response.read()
                return response.status, json.loads(content) if content else {}
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def create(self, **overrides):
        data = {"name": "HTTP test camera", "kind": "hikvision", "host": "127.0.0.1",
                "port": 65530, "password": "test-only-secret-do-not-return", **overrides}
        code, body = self.request("", "POST", data)
        self.assertEqual(code, 200, body)
        return body["device"]


@unittest.skipUnless(HAS_ROUTER, "Bridge router not implemented yet")
class BridgeApiTests(BridgeApiHarness):
    def test_anonymous_management_and_frames_are_denied(self):
        for path in ("", "/missing/snapshot", "/missing/feed"):
            code, _ = self.request(path, authorized=False)
            self.assertEqual(code, 401)
        code, body = self.request("/auth", authorized=False)
        self.assertEqual(code, 200)
        self.assertTrue(body["enabled"])
        self.assertFalse(body["authorized"])

    def test_crud_preserves_secret_without_returning_it(self):
        device = self.create()
        try:
            self.assertTrue(device["hasPassword"])
            self.assertNotIn("password", device)
            self.assertFalse(device["online"])
            code, body = self.request("/" + device["id"], "PUT", {"name": "Updated"})
            self.assertEqual(code, 200, body)
            self.assertTrue(body["device"]["hasPassword"])
            code, listing = self.request()
            self.assertEqual(code, 200)
            self.assertNotIn("test-only-secret", json.dumps(listing))
            self.assertEqual(len(listing["bindings"]), 16)
        finally:
            self.request("/" + device["id"], "DELETE")

    def test_invalid_payload_does_not_echo_credentials(self):
        code, body = self.request("", "POST", {
            "name": "bad", "kind": "unknown", "host": "127.0.0.1",
            "password": "NEVER-ECHO-THIS", "unexpected": "NEVER-ECHO-THIS",
        })
        self.assertEqual(code, 422, body)
        self.assertNotIn("NEVER-ECHO-THIS", json.dumps(body))

    def test_bindings_persist_and_delete_clears_reference(self):
        device = self.create()
        bindings = [device["id"]] + [None] * 15
        try:
            code, body = self.request("/bindings", "PUT", {"bindings": bindings})
            self.assertEqual(code, 200, body)
            self.assertEqual(self.request()[1]["bindings"], bindings)
            self.assertEqual(self.request("/bindings", "PUT", {"bindings": ["missing"] + [None] * 15})[0], 400)
        finally:
            self.request("/" + device["id"], "DELETE")
        self.assertNotIn(device["id"], self.request()[1]["bindings"])

    def test_offline_and_missing_frames_are_not_success(self):
        device = self.create()
        try:
            for suffix in ("/snapshot", "/feed"):
                self.assertEqual(self.request("/" + device["id"] + suffix)[0], 503)
                self.assertEqual(self.request("/missing" + suffix)[0], 404)
        finally:
            self.request("/" + device["id"], "DELETE")

    def test_preview_session_is_scoped_read_only(self):
        device = self.create()
        jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        try:
            code, body = self.request("/session", "POST", {}, opener=opener)
            self.assertEqual(code, 200, body)
            cookie = next(iter(jar))
            self.assertEqual(cookie.path, "/api/device-bridges")
            self.assertIn("HttpOnly", cookie._rest)
            self.assertEqual(self.request("/" + device["id"] + "/snapshot", authorized=False, opener=opener)[0], 503)
            self.assertEqual(self.request("/" + device["id"] + "/start", "POST", {}, authorized=False, opener=opener)[0], 401)
        finally:
            self.request("/" + device["id"], "DELETE")

    def test_preview_renewal_revokes_replaced_cookie(self):
        device = self.create()
        jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        old_jar = CookieJar()
        try:
            self.assertEqual(self.request("/session", "POST", {}, opener=opener)[0], 200)
            old_jar.set_cookie(next(iter(jar)))
            old_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(old_jar))
            self.assertEqual(self.request("/session", "POST", {}, opener=opener)[0], 200)
            self.assertEqual(self.request("/" + device["id"] + "/snapshot", authorized=False, opener=old_opener)[0], 401)
            self.assertEqual(self.request("/" + device["id"] + "/snapshot", authorized=False, opener=opener)[0], 503)
            self.assertEqual(self.request("/session", "DELETE", authorized=False, opener=opener)[0], 200)
            self.assertEqual(self.request("/" + device["id"] + "/snapshot", authorized=False, opener=opener)[0], 401)
        finally:
            self.request("/" + device["id"], "DELETE")

    def test_failed_test_cleans_up_and_reports_no_video(self):
        device = self.create()
        try:
            code, body = self.request("/" + device["id"] + "/test", "POST", {})
            self.assertEqual(code, 200, body)
            self.assertFalse(body["ok"])
            self.assertFalse(body["device"]["online"])
            self.assertGreater(len(body["checks"]), 0)
            self.assertEqual(self.request()[1]["runtime"]["running"], 0)
        finally:
            self.request("/" + device["id"], "DELETE")


class ShortProductionTokenApiTests(BridgeApiHarness):
    configured_token = "1234"
    app_environment = "production"
    short_admin_tokens = "true"

    def test_requested_token_authorizes_production_management(self):
        code, body = self.request("/auth")
        self.assertEqual(code, 200)
        self.assertTrue(body["enabled"])
        self.assertTrue(body["tokenConfigured"])
        self.assertTrue(body["authorized"])
        self.assertEqual(self.request()[0], 200)

    def test_production_anonymous_and_wrong_token_are_rejected(self):
        self.assertEqual(self.request(authorized=False)[0], 401)
        with patch.object(self, "token", "4321"):
            self.assertEqual(self.request()[0], 401)

    def test_requested_token_creates_preview_session(self):
        jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        code, body = self.request("/session", "POST", {}, opener=opener)
        self.assertEqual(code, 200, body)
        self.assertTrue(body["authorized"])
        self.assertEqual(self.request("/session", "DELETE", authorized=False, opener=opener)[0], 200)


if __name__ == "__main__":
    unittest.main()
