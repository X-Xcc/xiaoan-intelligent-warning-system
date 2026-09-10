import unittest
from types import SimpleNamespace

import tools.go2_video_bridge as go2_video_bridge
from tools.go2_video_bridge import BridgeState, camera_payload, encode_mjpeg_part
from tools.go2_video_bridge import create_app
from tools.go2_video_bridge import windows_platform_import_guard
from fastapi import HTTPException


class Go2VideoBridgeTests(unittest.TestCase):
    def test_connection_without_frame_is_offline(self):
        state = BridgeState()
        state.set_connected(True)
        self.assertFalse(camera_payload(state)["upstreamOnline"])

    def test_disconnect_clears_frame(self):
        state = BridgeState()
        state.publish(b"jpeg")
        state.set_connected(False)
        self.assertIsNone(state.snapshot()[0])

    def test_offline_feed_rejects_before_streaming_headers(self):
        app = create_app(BridgeState())
        endpoint = next(r.endpoint for r in app.routes if r.path == "/video_feed")
        with self.assertRaises(HTTPException) as result:
            endpoint("robot-dog-01")
        self.assertEqual(result.exception.status_code, 503)

    def test_camera_payload_reports_robot_dog_offline_without_frames(self):
        payload = camera_payload(BridgeState())
        self.assertEqual(payload, {
            "items": [{
                "id": "robot-dog-01",
                "name": "机械狗巡检视角",
                "online": False,
                "area": "东门主通道 · 低位巡检",
                "source": "ROBOT-DOG-01",
                "feedUrl": "/video_feed?cam=robot-dog-01",
            }],
            "upstreamOnline": False,
        })


    def test_encode_mjpeg_part_contains_boundary_headers_and_jpeg_bytes(self):
        frame = encode_mjpeg_part(b"jpeg-bytes")
        self.assertTrue(frame.startswith(b"--frame\r\n"))
        self.assertIn(b"Content-Type: image/jpeg\r\n", frame)
        self.assertTrue(frame.endswith(b"jpeg-bytes\r\n"))

    def test_windows_import_guard_avoids_wmi_and_restores_platform_helpers(self):
        original_system = lambda: "original"
        original_machine = lambda: "original-machine"
        platform_module = SimpleNamespace(
            system=original_system,
            machine=original_machine,
        )

        with windows_platform_import_guard(platform_module, is_windows=True):
            self.assertEqual(platform_module.system(), "Windows")
            self.assertEqual(platform_module.machine(), "AMD64")

        self.assertIs(platform_module.system, original_system)
        self.assertIs(platform_module.machine, original_machine)

    def test_windows_console_encoding_configures_reconfigurable_streams(self):
        calls: list[dict[str, str]] = []
        stream = SimpleNamespace(reconfigure=lambda **kwargs: calls.append(kwargs))
        configure = getattr(go2_video_bridge, "configure_windows_console_encoding", None)

        self.assertTrue(callable(configure))
        configure((stream,), is_windows=True)

        self.assertEqual(calls, [{"encoding": "utf-8", "errors": "backslashreplace"}])


if __name__ == "__main__":
    unittest.main()
