from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))
sys.path.insert(0, str(ROOT / "tools"))

from app.services.bridge_config import validate_config
from app.services.bridge_store import BridgeStore
from app.services.device_bridges import BridgeManager, STALE_SECONDS, _Runtime

import import_yolo_camera_bridges as importer


class RealCameraPolicyTests(unittest.TestCase):
    def test_usb_is_rejected_by_bridge_configuration(self):
        with self.assertRaises(ValueError):
            validate_config({"name": "USB fixture", "kind": "usb", "host": "", "usbIndex": 0})

    def test_importer_never_imports_usb_even_when_legacy_flag_is_present(self):
        row = {"id": "usb-1", "name": "legacy", "type": "usb", "address": 0}
        self.assertIsNone(importer.parse_camera(row, {}, include_local=True))

    def test_detector_does_not_scan_usb_when_camera_config_is_empty(self):
        camera_path = ROOT / "integrations" / "detector" / "detection" / "camera.py"
        spec = importlib.util.spec_from_file_location("camera_policy_under_test", camera_path)
        module = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(module)
        with patch.object(module, "detect_cameras", side_effect=AssertionError("USB scan called")):
            with patch.dict(module.os.environ, {"DETECTOR_DISCOVER_USB": "true"}):
                with patch.object(module, "_load_cameras_config_fallback", return_value=[]):
                    self.assertEqual(module.load_cameras_config(api_base="http://127.0.0.1:9"), [])

    def _manager_with_device(self, *, bound=True, online=True, stale=False):
        directory = tempfile.TemporaryDirectory()
        manager = BridgeManager(directory.name)
        device_id = "a" * 32
        now = "2026-09-12T10:00:00+00:00"
        row = {**validate_config({"name": "RTSP fixture", "kind": "rtsp",
                                  "host": "192.0.2.10", "rtspPath": "/live"}),
               "id": device_id, "createdAt": now, "updatedAt": now}
        manager._store.save("devices.json", [row])
        manager._devices[device_id] = row
        manager._runtimes[device_id] = _Runtime()
        manager._bindings = [device_id] + [None] * 15 if bound else [None] * 16
        state = manager._runtimes[device_id]
        state.status = "online" if online else "reconnecting"
        state.stage = "decode"
        state.jpeg = b"\xff\xd8\xff\xd9" if online else None
        state.frame_count = 2 if online else 0
        state.last_frame = time.monotonic() - (STALE_SECONDS + 1 if stale else 0.1)
        state.last_frame_at = now
        return directory, manager, device_id

    def test_readiness_requires_at_least_one_bound_device(self):
        directory, manager, _ = self._manager_with_device(bound=False)
        with directory:
            snapshot = manager.readiness_snapshot()
        self.assertFalse(snapshot["ready"])
        self.assertIn("no_bindings", {reason["code"] for reason in snapshot["reasons"]})

    def test_readiness_rejects_stale_or_offline_bound_device(self):
        for online, stale, code in ((False, False, "device_not_online"),
                                    (True, True, "frame_stale")):
            directory, manager, device_id = self._manager_with_device(online=online, stale=stale)
            with directory:
                snapshot = manager.readiness_snapshot()
            self.assertFalse(snapshot["ready"])
            self.assertIn(code, {reason["code"] for reason in snapshot["reasons"]})
            self.assertEqual(snapshot["devices"][0]["id"], device_id)

    def test_readiness_accepts_fresh_bound_device(self):
        directory, manager, _ = self._manager_with_device()
        with directory:
            snapshot = manager.readiness_snapshot()
        self.assertTrue(snapshot["ready"])
        self.assertEqual(snapshot["reasons"], [])
        self.assertEqual(snapshot["devices"][0]["frameCount"], 2)


if __name__ == "__main__":
    unittest.main()
