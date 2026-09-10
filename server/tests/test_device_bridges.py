"""Offline bridge-manager tests. All credentials and devices are synthetic."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from app.services import device_bridges as bridges
except ImportError:
    bridges = None


def camera(**overrides):
    return {"name": "Fixture camera", "kind": "rtsp", "host": "127.0.0.1",
            "rtspPath": "/fixture", **overrides}


class ManagerStorageTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(bridges, "The bridge manager has not been implemented")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.manager = bridges.BridgeManager(self.temp.name)
        self.addCleanup(self.manager.shutdown)

    def test_create_contract_and_writeonly_password(self):
        result = self.manager.create_device(camera(password="fixture-password"))
        expected = {"name", "kind", "host", "port", "username", "rtspPath",
                    "channel", "stream", "go2Mode", "autoStart", "id", "hasPassword",
                    "status", "online", "fps", "width", "height", "frameCount",
                    "lastFrameAt", "lastError", "stage", "logs", "feedUrl",
                    "snapshotUrl", "createdAt", "updatedAt", "httpScheme", "httpPath", "usbIndex"}
        self.assertEqual(set(result), expected)
        self.assertEqual(result["port"], 554)
        self.assertFalse(result["autoStart"])
        self.assertTrue(result["hasPassword"])
        self.assertFalse(result["online"])
        self.assertEqual(result["status"], "stopped")
        self.assertEqual(result["feedUrl"], f'/api/device-bridges/{result["id"]}/feed')
        self.assertEqual(result["snapshotUrl"], f'/api/device-bridges/{result["id"]}/snapshot')
        self.assertNotIn("fixture-password", json.dumps(result))
        self.assertIsNone(self.manager.snapshot(result["id"]))

    def test_full_config_encrypted_separate_key_and_roundtrip(self):
        result = self.manager.create_device(camera(password="fixture-secret",
                                                  rtspPath="/private-fixture-path"))
        self.manager.set_bindings([result["id"]] + [None] * 15)
        files = list(Path(self.temp.name).iterdir())
        self.assertGreaterEqual(len(files), 3)
        for file in files:
            content = file.read_bytes()
            for secret in (b"fixture-secret", b"private-fixture-path", b"Fixture camera",
                           b"127.0.0.1"):
                self.assertNotIn(secret, content)
        restored = bridges.BridgeManager(self.temp.name)
        self.addCleanup(restored.shutdown)
        self.assertTrue(restored.get_device(result["id"])["hasPassword"])
        self.assertEqual(restored.get_bindings()[0], result["id"])
        self.assertEqual(restored.get_device(result["id"])["status"], "stopped")

    def test_password_omission_preserves_and_empty_string_clears(self):
        created = self.manager.create_device(camera(password="fixture-secret"))
        updated = self.manager.update_device(created["id"], {"name": "Renamed"})
        self.assertTrue(updated["hasPassword"])
        self.assertEqual(updated["createdAt"], created["createdAt"])
        restored = bridges.BridgeManager(self.temp.name)
        self.addCleanup(restored.shutdown)
        self.assertTrue(restored.get_device(created["id"])["hasPassword"])
        self.assertFalse(self.manager.update_device(created["id"], {"password": ""})["hasPassword"])

    def test_bindings_validate_persist_copy_and_clear_on_delete(self):
        created = self.manager.create_device(camera())
        bindings = self.manager.set_bindings([created["id"]] * 16)
        bindings[0] = None
        self.assertEqual(self.manager.get_bindings()[0], created["id"])
        for invalid in ([], [None] * 17, "invalid", [2] * 16, ["missing"] * 16):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.manager.set_bindings(invalid)
        self.manager.delete_device(created["id"])
        self.assertEqual(self.manager.get_bindings(), [None] * 16)
        with self.assertRaises(KeyError):
            self.manager.get_device(created["id"])

    def test_device_limit_is_atomic(self):
        def create(index):
            try:
                self.manager.create_device(camera(name=f"Fixture {index}"))
                return True
            except RuntimeError:
                return False
        with ThreadPoolExecutor(max_workers=8) as executor:
            created = list(executor.map(create, range(24)))
        self.assertEqual(sum(created), 16)
        self.assertEqual(len(self.manager.list_devices()), 16)

    def test_maximum_device_count_also_supports_large_valid_configs(self):
        for _ in range(16):
            self.manager.create_device(camera(name="\u6d4b" * 120, username="\u6d4b" * 256,
                                               password="\u6d4b" * 200,
                                               rtspPath="/" + "\u6d4b" * 2000))
        self.assertEqual(len(self.manager.list_devices()), 16)

    def test_default_directory_honors_environment(self):
        with patch.dict(os.environ, {"CICSIC_BRIDGE_DATA_DIR": self.temp.name}):
            other = bridges.BridgeManager()
        self.addCleanup(other.shutdown)
        other.create_device(camera())
        self.assertEqual(len(bridges.BridgeManager(self.temp.name).list_devices()), 1)

    def test_corrupted_ciphertext_fails_closed_without_overwrite(self):
        self.manager.create_device(camera())
        data_file = Path(self.temp.name) / "devices.json"
        original = data_file.read_bytes()
        data_file.write_bytes(original[:-8] + b"corrupt!")
        corrupted = data_file.read_bytes()
        with self.assertRaises(RuntimeError) as caught:
            bridges.BridgeManager(self.temp.name)
        self.assertNotIn("fixture", str(caught.exception))
        self.assertEqual(data_file.read_bytes(), corrupted)

    def test_concurrent_initialization_uses_one_atomically_published_key(self):
        fresh_directory = Path(self.temp.name) / "concurrent"
        with ThreadPoolExecutor(max_workers=8) as executor:
            managers = list(executor.map(lambda _: bridges.BridgeManager(fresh_directory), range(12)))
        result = managers[0].create_device(camera(password="synthetic-secret"))
        for manager in managers:
            manager.shutdown()
        restored = bridges.BridgeManager(fresh_directory)
        self.addCleanup(restored.shutdown)
        self.assertTrue(restored.get_device(result["id"])["hasPassword"])
        self.assertFalse(list(fresh_directory.glob("*.tmp")))

    def test_unknown_ids_raise_keyerror_for_all_device_operations(self):
        for name in ("get_device", "update_device", "delete_device", "start_device",
                     "stop_device", "restart_device", "snapshot", "test_device"):
            with self.subTest(name=name), self.assertRaises(KeyError):
                args = ("absent", {}) if name == "update_device" else ("absent",)
                getattr(self.manager, name)(*args)
        with self.assertRaises(KeyError):
            next(self.manager.frames("absent"))

    def test_invalid_types_ranges_and_unknown_fields_do_not_persist(self):
        invalid = [
            None, [], "config", camera(name=" "), camera(name=7), camera(kind="file"),
            camera(host=""), camera(port=True), camera(port="554"), camera(port=0),
            camera(port=65536), camera(channel=True), camera(channel=0), camera(channel=257),
            camera(stream="other"), camera(go2Mode="Remote"), camera(autoStart="false"),
            camera(username=None), camera(password=None), camera(password="bad\nsecret"),
            camera(rtspPath=3), camera(rtspPath=""), camera(extra="not-supported"),
            camera(name="x" * 121), camera(password="x" * 513),
        ]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError) as caught:
                self.manager.create_device(value)
            self.assertRegex(str(caught.exception), r"[\u4e00-\u9fff]")
        self.assertEqual(self.manager.list_devices(), [])

    def test_reject_unsafe_hosts_and_path_credentials_without_echoing_input(self):
        hosts = ["http://127.0.0.1", "user:secret@host", "a/b", "a\\b", "host:554",
                 "a b", "a\nb", "169.254.169.254", "100.100.100.200", "168.63.129.16",
                 "metadata.google.internal", "metadata", "::ffff:169.254.169.254",
                 "fd00:ec2::254", "0.0.0.0", "224.0.0.1", "2130706433", "0177.0.0.1",
                 "0x7f000001", "a..b", "-camera.local", "camera.local%00"]
        paths = ["rtsp://host/fixture", "//host/fixture", "/a#fragment", "/a\\b",
                 "/user:secret@host/fixture", "/a?password=secret", "/a?user=admin",
                 "/a?access_token=secret", "/a?url=http%3A%2F%2Fhost", "/a%0d%0aX",
                 "/a%250aX", "/a%252540host", "/a?auth=secret", "/a?%70assword=secret",
                 "/a%ZZ", "/a\x7f", "/a\u202e"]
        for field, values in (("host", hosts), ("rtspPath", paths)):
            for value in values:
                with self.subTest(field=field, value=value), self.assertRaises(ValueError) as caught:
                    self.manager.create_device(camera(**{field: value}))
                self.assertNotIn(value, str(caught.exception))

    def test_intended_lan_hosts_and_loopback_are_accepted(self):
        for host in ("127.0.0.1", "localhost", "192.168.1.8", "10.1.2.3", "172.16.1.2",
                     "camera.local", "::1", "[::1]", "fd12:3456::8"):
            with self.subTest(host=host):
                self.assertEqual(self.manager.create_device(camera(host=host))["status"], "stopped")

    def test_go2_ap_address_and_supported_local_modes(self):
        ap = self.manager.create_device(camera(kind="go2", host="192.168.12.1",
                                              rtspPath="", go2Mode="LocalAP"))
        self.assertEqual(ap["go2Mode"], "LocalAP")
        with self.assertRaises(ValueError):
            self.manager.create_device(camera(kind="go2", go2Mode="LocalAP"))

    def test_runtime_availability_has_no_driver_import_side_effects(self):
        with patch("importlib.import_module", side_effect=AssertionError("no driver import")):
            info = self.manager.runtime_info()
        for key in ("av", "opencv", "go2"):
            self.assertIs(type(info[key]), bool)
        self.assertEqual(info["running"], 0)
        self.assertEqual(info["maxDevices"], 16)

    def test_launch_does_not_block_on_worker_that_never_reads_stdin(self):
        from app.services.bridge_config import validate_config
        config = validate_config(camera(rtspPath="/" + "\u6d4b" * 1700))
        created = threading.Event()
        holder = {}
        real_popen = subprocess.Popen
        def launch(*args, **kwargs):
            holder["process"] = real_popen(*args, **kwargs)
            holder["kwargs"] = kwargs
            created.set()
            return holder["process"]
        command = self.manager._worker_command()[:2] + ["-c", "import time; time.sleep(60)"]
        with patch.object(self.manager, "_worker_command", return_value=command):
            with patch.object(bridges.subprocess, "Popen", side_effect=launch):
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(self.manager._launch, config)
                    try:
                        self.assertTrue(created.wait(3))
                        self.assertIs(future.result(timeout=0.5), holder["process"])
                        self.assertNotEqual(holder["kwargs"].get("bufsize"), 0)
                    finally:
                        process = holder.get("process")
                        if process:
                            process.terminate()
                            process.wait(timeout=3)
                            for stream in (process.stdin, process.stdout):
                                if stream and not stream.closed:
                                    stream.close()

    def test_worker_handle_owns_the_actual_python_decoder_process(self):
        command = self.manager._worker_command()[:2] + [
            "-c", "import os,time; print(os.getpid(),flush=True); time.sleep(60)"]
        process = None
        actual_pid = None
        with patch.object(self.manager, "_worker_command", return_value=command):
            try:
                process = self.manager._launch({})
                actual_pid = int(process.stdout.readline())
                self.assertEqual(process.pid, actual_pid,
                                 "The process handle must not belong only to a Python launcher")
            finally:
                if process:
                    self.manager._terminate(process)
                    if actual_pid and actual_pid != process.pid:
                        try:
                            import signal
                            os.kill(actual_pid, signal.SIGTERM)
                        except OSError:
                            pass
                    for stream in (process.stdin, process.stdout):
                        if stream and not stream.closed:
                            stream.close()

    def test_structurally_invalid_jpeg_is_not_a_frame(self):
        import base64
        state = bridges._Runtime()
        with self.manager._condition, self.assertRaises(ValueError):
            self.manager._accept_event(state, {"type": "frame", "width": 32, "height": 24,
                                               "jpeg": base64.b64encode(b"\xff\xd8junk\xff\xd9").decode()})

    def test_diagnostics_preserve_evidence_and_never_claim_authentication_from_tcp(self):
        device = self.manager.create_device(camera())
        state = self.manager._runtimes[device["id"]]
        with self.manager._condition:
            for stage, code in (("dns", "dns_ok"), ("network", "network_ok")):
                self.manager._accept_event(state, {"type": "status", "status": "connecting",
                                                   "stage": stage, "code": code})
            self.manager._accept_event(state, {"type": "status", "status": "reconnecting",
                                               "stage": "stream", "code": "auth_failed",
                                               "message": "fixture-private"})
        with patch.object(self.manager, "_start", return_value=state):
            result = self.manager.test_device(device["id"], timeout=0.01)
        evidence = {check["stage"]: check for check in result["checks"]}
        self.assertTrue(evidence["dns"]["ok"])
        self.assertTrue(evidence["network"]["ok"])
        self.assertFalse(evidence["stream"]["ok"])
        self.assertFalse(result["ok"])
        self.assertNotIn("fixture-private", json.dumps(result))
        self.assertNotIn("auth", {stage for stage, value in evidence.items() if value["ok"]})


class ManagerLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(bridges, "The bridge manager has not been implemented")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.manager = bridges.BridgeManager(self.temp.name)
        self.addCleanup(self.manager.shutdown)
        command = self.manager._worker_command()[:2] + [str(Path(__file__).resolve()), "--fixture-worker"]
        self.command_patch = patch.object(self.manager, "_worker_command", return_value=command)
        self.command_patch.start()
        self.addCleanup(self.command_patch.stop)

    def device(self, name="frames", **kwargs):
        return self.manager.create_device(camera(name=name, password="fixture-private", **kwargs))

    def wait_for(self, predicate, timeout=6):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.025)
        self.fail("Timed out waiting for the offline fixture")

    def test_start_frames_wallclock_metadata_and_stop_clear_frame(self):
        device = self.device()
        before = time.time()
        self.manager.start_device(device["id"])
        self.wait_for(lambda: self.manager.get_device(device["id"])["online"])
        current = self.manager.get_device(device["id"])
        from datetime import datetime
        self.assertGreaterEqual(datetime.fromisoformat(current["lastFrameAt"]).timestamp(), before)
        self.assertEqual((current["width"], current["height"]), (32, 24))
        self.assertGreaterEqual(current["frameCount"], 1)
        self.assertLessEqual(current["fps"], 8)
        self.assertTrue(self.manager.snapshot(device["id"]).startswith(b"\xff\xd8"))
        iterator = self.manager.frames(device["id"])
        self.assertTrue(next(iterator).startswith(b"\xff\xd8"))
        stopped = self.manager.stop_device(device["id"])
        self.assertEqual(stopped["status"], "stopped")
        self.assertIsNone(self.manager.snapshot(device["id"]))
        with self.assertRaises(StopIteration):
            next(iterator)
        self.assertEqual(self.manager.runtime_info()["running"], 0)

    def test_credentials_are_stdin_only_and_subprocess_is_hidden_no_shell(self):
        real_popen = subprocess.Popen
        with patch.object(bridges.subprocess, "Popen", wraps=real_popen) as launch:
            device = self.device()
            self.manager.start_device(device["id"])
            self.wait_for(lambda: self.manager.get_device(device["id"])["online"])
            args, kwargs = launch.call_args
        self.assertNotIn("fixture-private", repr(args) + repr(kwargs))
        self.assertFalse(kwargs.get("shell", False))
        self.assertEqual(kwargs["stdin"], subprocess.PIPE)
        self.assertEqual(kwargs["stderr"], subprocess.DEVNULL)
        self.assertNotIn("GO2_PASSWORD", kwargs["env"])
        if os.name == "nt":
            self.assertTrue(kwargs["creationflags"] & subprocess.CREATE_NO_WINDOW)

    def test_stale_frames_are_cleared_using_monotonic_not_wallclock(self):
        with patch.object(bridges, "STALE_SECONDS", 0.15):
            device = self.device("one-frame")
            self.manager.start_device(device["id"])
            self.wait_for(lambda: self.manager.snapshot(device["id"]) is not None)
            self.wait_for(lambda: self.manager.snapshot(device["id"]) is None)
            self.assertFalse(self.manager.get_device(device["id"])["online"])
            self.assertEqual(self.manager.get_device(device["id"])["fps"], 0)

    def test_hung_process_stop_and_restart_are_bounded(self):
        device = self.device("hang")
        self.manager.start_device(device["id"])
        self.wait_for(lambda: self.manager.runtime_info()["running"] == 1)
        before = time.monotonic()
        self.manager.stop_device(device["id"])
        self.assertLess(time.monotonic() - before, 4)
        self.manager.update_device(device["id"], {"name": "frames"})
        self.manager.restart_device(device["id"])
        self.wait_for(lambda: self.manager.get_device(device["id"])["online"])

    def test_existing_connection_test_is_preserved_and_temporary_test_stops(self):
        device = self.device()
        result = self.manager.test_device(device["id"], timeout=5)
        self.assertTrue(result["ok"])
        self.assertTrue(all(set(c) == {"stage", "ok", "message"} for c in result["checks"]))
        self.assertEqual(self.manager.get_device(device["id"])["status"], "stopped")
        self.manager.start_device(device["id"])
        self.wait_for(lambda: self.manager.get_device(device["id"])["online"])
        self.assertTrue(self.manager.test_device(device["id"], timeout=1)["ok"])
        self.assertTrue(self.manager.get_device(device["id"])["online"])
        self.assertEqual(self.manager.runtime_info()["running"], 1)

    def test_test_timeout_stops_only_its_process_and_checks_timeout_types(self):
        device = self.device("hang")
        self.assertFalse(self.manager.test_device(device["id"], timeout=0.1)["ok"])
        self.assertEqual(self.manager.runtime_info()["running"], 0)
        for timeout in (0, -1, True, "12", float("nan"), float("inf"), 61):
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                self.manager.test_device(device["id"], timeout=timeout)

    def test_worker_errors_and_noise_never_escape_and_logs_are_bounded(self):
        device = self.device("errors")
        self.manager.start_device(device["id"])
        self.wait_for(lambda: len(self.manager.get_device(device["id"])["logs"]) >= 2)
        result = self.manager.get_device(device["id"])
        self.assertNotIn("fixture-private", json.dumps(result))
        self.assertNotIn("rtsp://", json.dumps(result))
        self.assertLessEqual(len(result["lastError"]), 240)
        self.assertLessEqual(len(result["logs"]), bridges.MAX_LOGS)
        for log in result["logs"]:
            self.assertEqual(set(log), {"at", "level", "message"})
            self.assertLessEqual(len(log["message"]), 240)

    def test_oversized_or_malformed_worker_output_is_rejected(self):
        for name in ("oversize", "invalid-frame", "bad-jpeg"):
            with self.subTest(name=name):
                device = self.device(name)
                self.manager.start_device(device["id"])
                self.wait_for(lambda: bool(self.manager.get_device(device["id"])["lastError"]))
                self.assertIsNone(self.manager.snapshot(device["id"]))
                self.manager.stop_device(device["id"])

    def test_worker_crash_reconnects_with_backoff(self):
        device = self.device("crash")
        real_popen = subprocess.Popen
        with patch.object(bridges.subprocess, "Popen", wraps=real_popen) as launch:
            self.manager.start_device(device["id"])
            self.wait_for(lambda: launch.call_count >= 2)
            self.assertLessEqual(launch.call_count, 4)
        self.assertEqual(self.manager.get_device(device["id"])["status"], "reconnecting")

    def test_active_config_edit_restarts_without_duplicate_processes(self):
        device = self.device()
        self.manager.start_device(device["id"])
        self.wait_for(lambda: self.manager.get_device(device["id"])["online"])
        self.manager.update_device(device["id"], {"name": "one-frame"})
        self.wait_for(lambda: self.manager.get_device(device["id"])["online"])
        self.assertEqual(self.manager.runtime_info()["running"], 1)

    def test_edit_during_temporary_tests_stops_without_restarting(self):
        for testers in (1, 2):
            with self.subTest(testers=testers):
                device = self.device("hang")
                try:
                    with (patch.object(self.manager, "_launch", wraps=self.manager._launch) as launch,
                          ThreadPoolExecutor(max_workers=testers) as executor):
                        futures = [executor.submit(self.manager.test_device, device["id"], 5)
                                   for _ in range(testers)]
                        self.wait_for(lambda: self.manager._runtimes[device["id"]].testers == testers
                                      and self.manager.runtime_info()["running"] == 1)
                        state = self.manager._runtimes[device["id"]]
                        process = state.process
                        updated = self.manager.update_device(device["id"], {"name": "frames"})
                        results = [future.result(timeout=3) for future in futures]
                        self.assertEqual(updated["name"], "frames")
                        self.assertEqual(updated["status"], "stopped")
                        self.assertTrue(all(not result["ok"] for result in results))
                        self.assertTrue(all(result["device"]["status"] == "stopped"
                                            for result in results))
                        self.assertEqual(state.testers, 0)
                        self.assertFalse(state.thread.is_alive())
                        self.assertIsNotNone(process.poll())
                        self.assertEqual(launch.call_count, 1)
                        self.assertEqual(self.manager.runtime_info()["running"], 0)
                        self.assertIsNone(self.manager.snapshot(device["id"]))
                finally:
                    self.manager.stop_device(device["id"])

    def test_startup_only_restores_explicit_autostart_and_shutdown_is_idempotent(self):
        automatic = self.device(autoStart=True)
        manual = self.device()
        self.assertEqual(self.manager.runtime_info()["running"], 0)
        self.manager.startup()
        self.wait_for(lambda: self.manager.get_device(automatic["id"])["online"])
        self.assertEqual(self.manager.get_device(manual["id"])["status"], "stopped")
        self.manager.shutdown()
        self.manager.shutdown()
        self.assertEqual(self.manager.runtime_info()["running"], 0)

    def test_restore_can_defer_autostart_without_changing_device_configuration(self):
        automatic = self.device(autoStart=True)
        with patch.dict(os.environ, {"CICSIC_BRIDGE_AUTOSTART": "false"}):
            with patch.object(self.manager, "start_device") as launch:
                self.manager.startup()
                launch.assert_not_called()
        self.assertTrue(self.manager.get_device(automatic["id"])["autoStart"])
        self.assertEqual(self.manager.runtime_info()["running"], 0)

    def test_concurrent_tests_share_one_worker_and_user_start_adopts_it(self):
        device = self.device()
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(self.manager.test_device, device["id"], 5)
            second = executor.submit(self.manager.test_device, device["id"], 5)
            self.wait_for(lambda: self.manager.runtime_info()["running"] == 1)
            self.manager.start_device(device["id"])
            self.assertTrue(first.result(timeout=7)["ok"])
            self.assertTrue(second.result(timeout=7)["ok"])
        self.assertTrue(self.manager.get_device(device["id"])["online"])
        self.assertEqual(self.manager.runtime_info()["running"], 1)

    def test_watchdog_restarts_a_hung_decoder(self):
        with patch.object(bridges, "WATCHDOG_SECONDS", 0.25):
            device = self.device("hang")
            with patch.object(bridges.subprocess, "Popen", wraps=subprocess.Popen) as launch:
                self.manager.start_device(device["id"])
                self.wait_for(lambda: launch.call_count >= 2)
            self.assertIsNone(self.manager.snapshot(device["id"]))


def fixture_worker():
    """A subprocess protocol fixture, intentionally outside production modules."""
    config = json.loads(sys.stdin.buffer.readline())
    name = config["name"]
    if name == "crash":
        return
    if name == "oversize":
        sys.stdout.write("x" * 1_500_000 + "\n")
        sys.stdout.flush()
    elif name == "invalid-frame":
        print(json.dumps({"type": "frame", "jpeg": "invalid", "width": 32, "height": 24}), flush=True)
    elif name == "bad-jpeg":
        import base64
        print(json.dumps({"type": "frame", "jpeg": base64.b64encode(b"\xff\xd8junk\xff\xd9").decode(),
                          "width": 32, "height": 24}), flush=True)
    elif name == "errors":
        for _ in range(150):
            print(json.dumps({"type": "status", "status": "reconnecting", "stage": "connect",
                              "code": "connect_failed", "message":
                              "rtsp://user:fixture-private@127.0.0.1/private"}), flush=True)
    elif name != "hang":
        import base64
        import cv2
        import numpy as np
        ok, encoded = cv2.imencode(".jpg", np.zeros((24, 32, 3), dtype=np.uint8))
        assert ok
        event = {"type": "frame", "jpeg": base64.b64encode(encoded).decode("ascii"),
                 "width": 32, "height": 24, "at": -100}
        while True:
            print(json.dumps(event), flush=True)
            if name == "one-frame":
                break
            time.sleep(0.15)
    time.sleep(60)


if __name__ == "__main__":
    if "--fixture-worker" in sys.argv:
        fixture_worker()
    else:
        unittest.main()
