"""Offline camera configuration transport tests; no camera or service is started."""
import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]


def load_camera():
    spec = importlib.util.spec_from_file_location("camera_auth_fixture", ROOT / "detection/camera.py")
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {"cv2": types.ModuleType("cv2")}):
        spec.loader.exec_module(module)
    return module


class CameraServiceAuthTests(unittest.TestCase):
    def setUp(self):
        self.camera = load_camera()
        self.camera._HAS_REQUESTS = True
        self.request = Mock()
        self.camera.requests = types.SimpleNamespace(get=self.request)
        self.fallback = patch.object(self.camera, "_load_cameras_config_fallback", return_value=["private-file"]).start()
        self.addCleanup(patch.stopall)

    def response(self, status, data):
        return types.SimpleNamespace(status_code=status, raise_for_status=lambda: None, json=lambda: data)

    def test_service_key_uses_private_endpoint_and_preserves_detection_credentials(self):
        self.request.return_value = self.response(200, {"data": [
            {"id": "rtsp-test", "type": "rtsp", "address": "rtsp://user:fixture-password@camera.invalid/live"},
            {"id": "http-test", "type": "http_snapshot", "address": "https://camera.invalid/snapshot",
             "username": "fixture-user", "password": "${CAM_PASSWORD}"},
            {"id": "usb-test", "type": "usb", "address": 0},
        ]})
        with patch.dict(os.environ, {"API_KEY": "fixture-service-key", "CAM_PASSWORD": "fixture-camera-password"}):
            result = self.camera.load_cameras_config("http://127.0.0.1:5000/")
        self.request.assert_called_once_with(
            "http://127.0.0.1:5000/api/internal/camera_config",
            headers={"X-API-Key": "fixture-service-key"}, timeout=5, allow_redirects=False,
        )
        self.assertEqual(result[0]["address"], "rtsp://user:fixture-password@camera.invalid/live")
        self.assertEqual(result[1]["user"], "fixture-user")
        self.assertEqual(result[1]["password"], "fixture-camera-password")
        self.assertEqual(result[2]["address"], 0)
        self.fallback.assert_not_called()

    def test_no_key_uses_private_file_without_any_anonymous_request(self):
        for key in ("", "  "):
            with self.subTest(key=key), patch.dict(os.environ, {"API_KEY": key}):
                self.assertEqual(self.camera.load_cameras_config(), ["private-file"])
        self.request.assert_not_called()

    def test_redirect_and_denied_responses_never_become_source_configuration(self):
        for status in (301, 302, 307, 401, 403, 500):
            with self.subTest(status=status), patch.dict(os.environ, {"API_KEY": "fixture-service-key"}):
                self.request.return_value = self.response(status, {"data": []})
                self.assertEqual(self.camera.load_cameras_config(), ["private-file"])
                self.assertFalse(self.request.call_args.kwargs.get("allow_redirects", True))

    def test_transport_errors_do_not_log_private_addresses_or_keys(self):
        self.request.side_effect = RuntimeError("fixture-service-key https://user:fixture-password@camera.invalid")
        with patch.dict(os.environ, {"API_KEY": "fixture-service-key"}), self.assertLogs(level="WARNING") as logs:
            self.assertEqual(self.camera.load_cameras_config(), ["private-file"])
        output = " ".join(logs.output)
        self.assertNotIn("fixture-service-key", output)
        self.assertNotIn("fixture-password", output)

    def test_container_smoke_uses_its_existing_login_token_for_camera_inventory(self):
        source = (ROOT / "tests/smoke_container.py").read_text(encoding="utf-8")
        self.assertIn('request("/api/camera_config", token=token)', source)


if __name__ == "__main__":
    unittest.main()
