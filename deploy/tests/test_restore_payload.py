from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import restore_payload


class RestorePayloadTests(unittest.TestCase):
    def test_accounts_does_not_require_setup_or_connect_detector(self):
        # Stub only the database/account boundary; do not import the live API.
        database, models, accounts, sqlalchemy = (MagicMock() for _ in range(4))
        database.SessionLocal.return_value.__enter__.return_value.scalars.return_value.all.return_value = [
            "synthetic-staff"
        ]
        accounts.initialize_accounts.return_value = {"created": True, "fieldAccounts": 1}
        modules = {
            "app.services.database": database, "app.services.models": models,
            "app.services.deployment_accounts": accounts, "sqlalchemy": sqlalchemy,
        }
        output, errors = io.StringIO(), io.StringIO()
        read_text = Path.read_text

        def read_source_report(path, *args, **kwargs):
            if path == Path("/app/server/.secrets/deployment-accounts/source-key.json"):
                return json.dumps({"serviceKey": {"secret": "synthetic-source-secret"}})
            return read_text(path, *args, **kwargs)

        with tempfile.TemporaryDirectory() as directory:
            setup = Path(directory) / "unmounted-setup"
            with (patch.dict(sys.modules, modules), patch.object(Path, "mkdir"),
                  patch.object(Path, "read_text", autospec=True, side_effect=read_source_report) as reads,
                  patch.object(sys, "argv", ["restore_payload.py", "accounts", "--setup", str(setup)]),
                  redirect_stdout(output), redirect_stderr(errors)):
                try:
                    restore_payload.main()
                except SystemExit as error:
                    self.fail(f"Accounts unexpectedly required setup or linkage files: exit {error.code}")
                reads.assert_not_called()
            accounts.initialize_accounts.assert_called_once_with(
                Path("/app/server/.secrets/deployment-accounts/accounts.json"),
                field_staff_ids=["synthetic-staff"],
            )
            accounts.initialize_source_access_key.assert_called_once_with(
                Path("/app/server/.secrets/deployment-accounts/source-key.json")
            )
            self.assertFalse(setup.exists())
        self.assertIn("PASS:", output.getvalue())
        self.assertEqual(errors.getvalue(), "")

    def test_linkage_action_only_reads_report_and_preserves_login_and_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            setup, server = root / "setup", root / "server"
            setup.mkdir()
            report = server / ".secrets/deployment-accounts/source-key.json"
            report.parent.mkdir(parents=True)
            original = 'API_KEY="synthetic-detector-login"\nADMIN_PASSWORD="keep$$value"\n'
            (setup / "detector.env").write_text(original)
            original_bytes = (setup / "detector.env").read_bytes()
            report.write_text(json.dumps({"serviceKey": {"secret": "synthetic-source-secret"}}))
            before = report.read_bytes()
            output, errors = io.StringIO(), io.StringIO()
            with (patch.object(restore_payload, "provision") as provision,
                  patch.object(sys, "argv", ["restore_payload.py", "connect-detector",
                                            "--setup", str(setup), "--server", str(server)]),
                  redirect_stdout(output), redirect_stderr(errors)):
                try:
                    restore_payload.main()
                    once = (setup / "detector.env").read_bytes()
                    restore_payload.main()
                except SystemExit as error:
                    self.fail(f"File-only detector linkage unavailable: exit {error.code}")
                provision.assert_not_called()
            self.assertEqual(report.read_bytes(), before)
            self.assertEqual((setup / "detector.env").read_bytes(), once)
            self.assertTrue(once.startswith(original_bytes))
            self.assertIn('CICSIC_REVIEW_API_KEY="synthetic-source-secret"', once.decode())
            self.assertNotIn("synthetic-source-secret", output.getvalue() + errors.getvalue())
            self.assertEqual(errors.getvalue(), "")

    def test_linkage_conflict_fails_without_provisioning_or_leaking_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report = root / ".secrets/deployment-accounts/source-key.json"
            report.parent.mkdir(parents=True)
            report.write_text(json.dumps({"serviceKey": {"secret": "synthetic-new-secret"}}))
            original = 'CICSIC_REVIEW_API_KEY="synthetic-existing-secret"\n'
            (root / "detector.env").write_text(original)
            output, errors = io.StringIO(), io.StringIO()
            with (patch.object(restore_payload, "provision") as provision,
                  patch.object(sys, "argv", ["restore_payload.py", "connect-detector",
                                            "--setup", str(root), "--server", str(root)]),
                  redirect_stdout(output), redirect_stderr(errors),
                  self.assertRaises(SystemExit) as raised):
                restore_payload.main()
            self.assertEqual(raised.exception.code, 1)
            provision.assert_not_called()
            self.assertEqual((root / "detector.env").read_text(), original)
            self.assertIn("private diagnostics withheld", errors.getvalue())
            self.assertNotIn("synthetic-", output.getvalue() + errors.getvalue())

    def test_every_installed_file_is_verified_before_services_start(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            payload, server, detector = root / "payload", root / "server", root / "detector"
            for relative, destination in restore_payload.file_mapping(server, detector).items():
                source = payload / relative
                source.mkdir(parents=True)
                destination.mkdir(parents=True)
                (source / "fixture.bin").write_bytes(b"synthetic-private-file")
                (destination / "fixture.bin").write_bytes(b"synthetic-private-file")
            result = restore_payload.verify_files(payload, server, detector)
            self.assertEqual(result["files"], len(restore_payload.file_mapping(server, detector)))
            (detector / "models/fixture.bin").write_bytes(b"corrupted-private-file")
            with self.assertRaises(ValueError):
                restore_payload.verify_files(payload, server, detector)

    def test_runtime_is_allowlisted_and_keeps_public_browser_keys_separate(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / "runtime.json").write_text(json.dumps({
                "api": {"SECURITY_VLM_API_KEY": "synthetic", "DATABASE_URL": "must-not-copy",
                        "CICSIC_ADMIN_AUTH_ENABLED": "false"},
                "browser": {"VITE_AMAP_KEY": "map-fixture"},
                "detector": {"CAM_PASSWORD": "synthetic-camera", "DATA_DIR": "unsafe-path"},
            }))
            server = path / "server"
            (path / "detections/0").mkdir(parents=True)
            api, detector = restore_payload.runtime_settings(path, server)
            self.assertNotIn("DATABASE_URL", api)
            self.assertNotIn("CICSIC_ADMIN_AUTH_ENABLED", api)
            self.assertEqual(api["XIAOAN_AMAP_KEY"], "map-fixture")
            self.assertEqual(api["SECURITY_DETECTION_DATA_DIRS"], str(server / "security-data/0"))
            self.assertEqual(detector, {"CAM_PASSWORD": "synthetic-camera"})

    def test_environment_prevents_line_injection_and_interpolation(self):
        self.assertIn("$$", restore_payload.dotenv({"API_KEY": "$not-an-environment-variable"}))
        with self.assertRaises(ValueError):
            restore_payload.dotenv({"API_KEY": "value\nOTHER=1"})

    def test_existing_volume_is_rejected_without_modification(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / "keep").write_text("original")
            with self.assertRaises(ValueError):
                restore_payload.empty_directory(path)
            self.assertEqual((path / "keep").read_text(), "original")

    def test_linkage_uses_separate_source_key_and_preserves_detector_login(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            original = 'API_KEY="detector-only"\nADMIN_PASSWORD="with$$dollar"\n'
            (path / "detector.env").write_text(original)
            report = path / "source-key.json"
            report.write_text(json.dumps({"serviceKey": {"secret": "synthetic-source-key"}}))
            with unittest.mock.patch.dict("os.environ", {"XIAOAN_API_BASE_URL": "http://127.0.0.1:18010"}):
                restore_payload.connect_detector(path, report)
            after = (path / "detector.env").read_text()
            self.assertTrue(after.startswith(original))
            self.assertIn('CICSIC_REVIEW_API_KEY="synthetic-source-key"', after)
            self.assertIn('CICSIC_REVIEW_URL="http://127.0.0.1:18010/api/security-ai/yolo-reviews"', after)
            with unittest.mock.patch.dict("os.environ", {"XIAOAN_API_BASE_URL": "http://127.0.0.1:18010"}):
                restore_payload.connect_detector(path, report)
            self.assertEqual((path / "detector.env").read_text(), after)
            report.write_text(json.dumps({"serviceKey": {"secret": "different-key"}}))
            with self.assertRaises(ValueError):
                with unittest.mock.patch.dict("os.environ", {"XIAOAN_API_BASE_URL": "http://127.0.0.1:18010"}):
                    restore_payload.connect_detector(path, report)
            self.assertEqual((path / "detector.env").read_text(), after)


if __name__ == "__main__":
    unittest.main()
