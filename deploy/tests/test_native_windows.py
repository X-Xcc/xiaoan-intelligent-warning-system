"""Contract tests for the Windows-native deployment entry points."""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "deploy" / "native"


class NativeDeploymentTests(unittest.TestCase):
    def test_one_click_entries_forward_arguments_and_preserve_exit_code(self):
        for name, target in (
            ("\u4e00\u952e\u542f\u52a8.cmd", "start.cmd"),
            ("\u4e00\u952e\u505c\u6b62.cmd", "stop.cmd"),
        ):
            path = ROOT / name
            self.assertTrue(path.is_file(), f"Missing one-click entry: {name}")
            text = path.read_text(encoding="utf-8-sig")
            self.assertIn(f'call "%~dp0{target}" %*', text)
            self.assertIn("exit /b %errorlevel%", text)
        start = (ROOT / "start.cmd").read_text(encoding="utf-8-sig")
        self.assertIn("-Force -EnableCameras -OpenBrowser %*", start)
        self.assertIn('set "result=%errorlevel%"', start)
        self.assertIn("exit /b %result%", start)

    def test_stop_handles_watchdog_before_application_services(self):
        text = (NATIVE / "stop.ps1").read_text(encoding="utf-8-sig")
        markers = (
            "Stop-NativeWatchdogProcess",
            "Stop-NativeChild 'web'",
            "Stop-NativeChild 'detector'",
            "Stop-NativeChild 'api'",
            "pg_ctl.exe",
        )
        for marker in markers:
            self.assertIn(marker, text)
        positions = [text.index(marker) for marker in markers]
        self.assertEqual(positions, sorted(positions))

    def test_stop_contract_mock_executes_expected_call_order(self):
        import re

        text = (NATIVE / "stop.ps1").read_text(encoding="utf-8-sig")
        calls = []
        if "Stop-NativeWatchdogProcess" in text:
            calls.append("watchdog")
        direct_calls = re.findall(r"Stop-NativeChild '([^']+)'", text)
        loop = re.search(
            r"foreach\s*\(\$name\s+in\s+@\((.*?)\)\)",
            text,
            flags=re.DOTALL,
        )
        if loop:
            calls.extend(re.findall(r"'([^']+)'", loop.group(1)))
        else:
            calls.extend(direct_calls)
        if "pg_ctl.exe" in text:
            calls.append("postgres")
        self.assertEqual(
            calls,
            ["watchdog", "web", "detector", "api", "postgres"],
        )

    def test_force_start_and_watchdog_entry_points_exist(self):
        for path in (
            NATIVE / "services.ps1",
            NATIVE / "watchdog.ps1",
            ROOT / "install-login-autostart.cmd",
            ROOT / "remove-login-autostart.cmd",
        ):
            self.assertTrue(path.is_file(), f"Missing force-start entry point: {path}")

    def test_watchdog_contract_owns_processes_and_requires_fresh_real_frames(self):
        paths = (
            NATIVE / "common.ps1",
            NATIVE / "services.ps1",
            NATIVE / "watchdog.ps1",
            ROOT / "install-login-autostart.cmd",
            ROOT / "remove-login-autostart.cmd",
        )
        text = "\n".join(
            path.read_text(encoding="utf-8-sig")
            for path in paths
            if path.is_file()
        )
        for required in (
            "XiaoAn.Native",
            "watchdog.pid",
            "watchdog.json",
            "Test-NativeChildOwnership",
            "device-bridges/readiness",
            "frameCount",
            "lastFrameAt",
            "XiaoAn Native Force Start",
        ):
            self.assertIn(required, text)
        for forbidden in (
            "USB",
            "placeholder",
            "占位",
            "sample://",
            "pre-recorded",
        ):
            self.assertNotIn(forbidden.lower(), text.lower())

    def test_login_autostart_contract_is_fixed_and_narrow(self):
        install = ROOT / "install-login-autostart.cmd"
        remove = ROOT / "remove-login-autostart.cmd"
        self.assertTrue(install.is_file(), f"Missing login install script: {install}")
        self.assertTrue(remove.is_file(), f"Missing login removal script: {remove}")
        install_text = install.read_text(encoding="utf-8-sig")
        remove_text = remove.read_text(encoding="utf-8-sig")
        self.assertIn("/Create /F", install_text)
        self.assertIn("ONLOGON", install_text)
        self.assertIn("XiaoAn Native Force Start", install_text)
        self.assertIn('/Delete /TN "XiaoAn Native Force Start" /F', remove_text)
        for text in (install_text, remove_text):
            self.assertNotIn("/Delete /F", text.replace(
                '/Delete /TN "XiaoAn Native Force Start" /F', ""
            ))
            self.assertNotIn(" /Delete *", text)
            self.assertNotIn(" /Delete /TN *", text)

    def test_watchdog_checks_health_layers_and_uses_minimal_recovery_actions(self):
        text = (NATIVE / "watchdog.ps1").read_text(encoding="utf-8-sig")
        for required in (
            "Get-NativeHealthSnapshot",
            "Test-NativeRealCameraSnapshot",
            "Get-NativeRecoveryAction",
            "Invoke-NativeRecoveryAction",
            "web",
            "api",
            "detector",
            "Start-Sleep -Seconds 2",
            "60",
            "15",
        ):
            self.assertIn(required, text)

    def test_browser_opens_only_after_all_services_are_ready(self):
        text = (NATIVE / "start.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("[switch]$OpenBrowser", text)
        self.assertIn("if ($OpenBrowser) { Open-NativeDashboard", text)
        self.assertGreater(text.index("if ($OpenBrowser)"), text.rindex("Wait-NativeHttp"))

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
