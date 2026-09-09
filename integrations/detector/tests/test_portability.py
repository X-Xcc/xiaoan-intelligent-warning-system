import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_source(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "detection" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PortabilityTests(unittest.TestCase):
    def test_runtime_paths_and_thresholds_are_configurable(self):
        with tempfile.TemporaryDirectory() as tmp:
            thresholds = Path(tmp) / "thresholds.json"
            thresholds.write_text(json.dumps({"model": {"img_size": 256}}))
            env = {
                "YOLOV8_MODEL_PATH": str(Path(tmp) / "pose.pt"),
                "DATA_DIR": str(Path(tmp) / "data"),
                "RESULT_DIR": str(Path(tmp) / "results"),
                "THRESHOLDS_PATH": str(thresholds),
                "YOLOV8_DEVICE": "cpu",
            }
            with patch.dict(os.environ, env):
                config = load_source("config").Config()
            self.assertEqual(config.MODEL_PATH, env["YOLOV8_MODEL_PATH"])
            self.assertEqual(config.DATASET_DIR, env["DATA_DIR"])
            self.assertEqual(config.IMG_SIZE, 256)
            self.assertEqual(config.DEVICE, "cpu")

    def test_private_camera_file_preserves_rtsp_and_http_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            cameras = Path(tmp) / "private.json"
            cameras.write_text(json.dumps({"cameras": [
                {"id": "test-1", "type": "rtsp", "address": "rtsp://camera.example.invalid/live",
                 "name": "Test camera"},
                {"id": "test-2", "type": "http_snapshot",
                 "address": "http://camera.example.invalid/snapshot", "username": "test-user",
                 "password": "${CAM_PASSWORD}"},
            ]}))
            with patch.dict(os.environ, {"CAMERAS_CONFIG_PATH": str(cameras), "CAM_PASSWORD": "fixture-only"}):
                with patch.dict(sys.modules, {"cv2": types.ModuleType("cv2")}):
                    module = load_source("camera")
                    result = module._load_cameras_config_fallback()
            self.assertEqual(len(result), 2)
            self.assertEqual(result[0]["type"], "rtsp")
            self.assertEqual(result[1]["user"], "test-user")
            self.assertEqual(result[1]["password"], "fixture-only")

    def test_deployment_has_no_private_camera_seed(self):
        self.assertEqual(list(ROOT.rglob("cameras.json")), [])

    def test_cicsic_review_uses_scoped_service_key_header(self):
        notifier = load_source("cicsic_notifier")
        calls = []
        client = notifier.CicsicReviewNotifier(
            url="http://cicsic.example.invalid/api/security-ai/yolo-reviews",
            enabled=True, api_key="fixture-service-key",
            post_func=lambda url, payload, headers, timeout: calls.append(headers),
        )
        client._send({"sourceId": "test"})
        self.assertEqual(calls, [{"X-Service-Key": "fixture-service-key"}])
        self.assertNotIn("X-API-Key", calls[0])


if __name__ == "__main__":
    unittest.main()
