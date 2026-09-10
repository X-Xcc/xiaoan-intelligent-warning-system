"""A running preview must stop after its cookie or header token is revoked."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"

from app.api.routes import device_bridges


class BridgeStreamSessionTests(unittest.TestCase):
    def test_revoked_cookie_stops_an_existing_stream(self):
        manager = Mock()
        manager.frames.return_value = iter([b"first", b"second"])
        with patch.object(device_bridges.time, "monotonic", side_effect=[1.0, 1.6]), \
                patch.object(device_bridges.system_control, "verify_admin_token", return_value=False), \
                patch.object(device_bridges, "_preview_authorized", side_effect=[True, False]):
            frames = list(device_bridges._stream_frames(manager, "test", "cookie", None))
        self.assertEqual(len(frames), 1)
        self.assertIn(b"first", frames[0])

    def test_revoked_header_token_stops_an_existing_stream(self):
        manager = Mock()
        manager.frames.return_value = iter([b"first", b"second"])
        with patch.object(device_bridges.time, "monotonic", side_effect=[1.0, 1.6]), \
                patch.object(device_bridges.system_control, "verify_admin_token", side_effect=[True, False]), \
                patch.object(device_bridges, "_preview_authorized", return_value=False):
            frames = list(device_bridges._stream_frames(manager, "test", None, "token"))
        self.assertEqual(len(frames), 1)
        self.assertIn(b"first", frames[0])

    def test_unauthorized_stream_never_yields_a_frame(self):
        manager = Mock()
        manager.frames.return_value = iter([b"private"])
        with patch.object(device_bridges.system_control, "verify_admin_token", return_value=False), \
                patch.object(device_bridges, "_preview_authorized", return_value=False):
            self.assertEqual(list(device_bridges._stream_frames(manager, "test", None, None)), [])


if __name__ == "__main__":
    unittest.main()
