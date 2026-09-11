"""Contract tests for the Windows-native deployment entry points."""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "deploy" / "native"


class NativeDeploymentTests(unittest.TestCase):
    def test_native_entry_points_exist(self):
        files = {
            NATIVE / "bootstrap.ps1",
            NATIVE / "start.ps1",
            NATIVE / "restore.ps1",
            NATIVE / "static_server.py",
            ROOT / "start.cmd",
            ROOT / "restore.cmd",
            ROOT / "install-prerequisites.cmd",
            ROOT / "stop.cmd",
        }
        for path in files:
            self.assertTrue(path.is_file(), f"Missing native deployment file: {path}")
        text = "\n".join(path.read_text(encoding="utf-8-sig") for path in files if path.suffix != ".py")

    def test_start_contract_owns_local_services_and_defers_hardware(self):
        text = (NATIVE / "start.ps1").read_text(encoding="utf-8-sig") + (NATIVE / "common.ps1").read_text(encoding="utf-8-sig")
        for required in (
            "pg_ctl.exe", "uvicorn", "go2rtc.exe", "yolov8-security.war",
            "static_server.py", "CICSIC_BRIDGE_AUTOSTART", "DETECTOR_AUTOSTART",
            "GO2RTC_AUTOSTART", "PIP_CONFIG_FILE", "https://pypi.org/simple", "127.0.0.1",
            "--encoding=UTF8", "--locale=C", "postmaster.pid", "icacls.exe", "Test-NativePostgresConnection",
            r"HKLM:\SOFTWARE\Node.js", r"HKLM:\SOFTWARE\PostgreSQL\Installations",
            r"Eclipse Adoptium/*/bin/java.exe", r"JAVA_HOME", r".jdks/*/bin/java.exe",
        ):
            self.assertIn(required, text)

    def test_restore_contract_is_authenticated_and_non_destructive(self):
        text = (NATIVE / "restore.ps1").read_text(encoding="utf-8-sig")
        for required in (
            "private_bundle.py", "unpack", "pg_restore", "--single-transaction",
            "--exit-on-error", "verify-db", "verify-files", "CICSIC_BRIDGE_AUTOSTART",
            "DETECTOR_AUTOSTART", "GO2RTC_AUTOSTART", "Out-Null", "Restore stage:",
        ):
            self.assertIn(required, text)
        for forbidden in ("Remove-Item -Recurse", "rmdir /s"):
            self.assertNotIn(forbidden.lower(), text.lower())
        self.assertNotIn("configure.py') --directory $Native --detector", text)

    def test_private_detector_runtime_is_not_a_public_source_asset(self):
        ignore_rules = (ROOT / ".gitignore").read_text(encoding="utf-8-sig")
        start = (NATIVE / "start.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("integrations/detector/runtime/", ignore_rules)
        self.assertIn("go2rtc.exe", start)
        self.assertIn("go2rtc.yaml", start)

    def test_restore_allows_bootstrapped_node_runtime_but_rejects_other_runtime_data(self):
        common = (NATIVE / "common.ps1").read_text(encoding="utf-8-sig")
        restore = (NATIVE / "restore.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("Test-NativeRestoreRuntimeDirectory", common)
        self.assertIn("Test-NativeRestoreRuntimeDirectory (Join-Path $native '.runtime')", restore)
        self.assertNotIn("Test-NativeEmptyDirectory (Join-Path $native '.runtime')", restore)
        self.assertIn("bootstrap.ps1') -InstallMissing", restore)
        self.assertIn("bootstrap.ps1') -InstallMissing", (NATIVE / "start.ps1").read_text(encoding="utf-8-sig"))

    def test_static_server_keeps_assets_and_spa_routes_distinct(self):
        import importlib.util
        import tempfile

        path = NATIVE / "static_server.py"
        spec = importlib.util.spec_from_file_location("native_static", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "assets").mkdir()
            (root / "index.html").write_text("app")
            (root / "assets/app.js").write_text("asset")
            module.ApplicationHandler.root = root
            handler = object.__new__(module.ApplicationHandler)
            self.assertEqual(Path(handler.translate_path("/assets/app.js")), root / "assets/app.js")
            self.assertEqual(Path(handler.translate_path("/admin/bridges")), root / "index.html")


if __name__ == "__main__":
    unittest.main()
