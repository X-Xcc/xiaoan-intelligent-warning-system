"""Contract tests for the Windows-native deployment entry points."""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "deploy" / "native"


class NativeDeploymentTests(unittest.TestCase):
    def test_one_click_start_is_the_only_start_entry_and_forwards_arguments(self):
        stable_start = ROOT / "\u4e00\u952e\u542f\u52a8\u7a33\u5b9a\u7248.cmd"
        self.assertTrue(stable_start.is_file(), f"Missing one-click entry: {stable_start.name}")
        text = stable_start.read_text(encoding="utf-8-sig")
        self.assertIn(
            r'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\native\start.ps1"',
            text,
        )
        self.assertIn("-Force -EnableCameras -OpenBrowser %*", text)
        self.assertIn('set "result=%errorlevel%"', text)
        self.assertIn("exit /b %result%", text)
        for legacy in (ROOT / "start.cmd", ROOT / "\u4e00\u952e\u542f\u52a8.cmd"):
            self.assertFalse(legacy.exists(), f"Legacy start entry must be removed: {legacy.name}")

    def test_one_click_stop_forwards_arguments_and_preserves_exit_code(self):
        path = ROOT / "\u4e00\u952e\u505c\u6b62.cmd"
        self.assertTrue(path.is_file(), f"Missing one-click entry: {path.name}")
        text = path.read_text(encoding="utf-8-sig")
        self.assertIn('call "%~dp0stop.cmd" %*', text)
        self.assertIn("exit /b %errorlevel%", text)

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
        import os
        import re
        import subprocess
        import tempfile

        text = (NATIVE / "stop.ps1").read_text(encoding="utf-8-sig")
        postgres_call = re.compile(
            r"(?m)^[ \t]*& \(Join-Path \(Get-NativePostgresBin\) 'pg_ctl\.exe'\).*$"
        )
        self.assertRegex(text, postgres_call)

        harness = r"""
$ErrorActionPreference = 'Stop'
$global:NativeStopCalls = @()
$global:NativePostgresBinLookups = 0

function Stop-NativeWatchdogProcess {
    $global:NativeStopCalls += 'watchdog'
}
function Stop-NativeChild {
    param([string]$Name)
    $global:NativeStopCalls += $Name
}
function Get-NativeDirectory {
    return $env:NATIVE_STOP_TEST_ROOT
}
function Get-NativePostgresBin {
    $global:NativePostgresBinLookups += 1
    return $env:NATIVE_STOP_TEST_ROOT
}
function Invoke-NativePostgresStop {
    param([string]$Path, [string[]]$Arguments)
    $global:NativeStopCalls += 'postgres'
}

. (Join-Path $env:NATIVE_STOP_TEST_ROOT 'stop.ps1')
Write-Output ('CALLS:' + ($global:NativeStopCalls -join ','))
Write-Output ('POSTGRES_LOOKUPS:' + $global:NativePostgresBinLookups)
"""

        with tempfile.TemporaryDirectory(prefix="native-stop-contract-") as temporary:
            temp_root = Path(temporary)
            temp_native = temp_root / "native"
            temp_native.mkdir()
            stop_copy = temp_native / "stop.ps1"
            stop_copy.write_text(
                postgres_call.sub(
                    "    Invoke-NativePostgresStop -Path (Join-Path (Get-NativePostgresBin) 'pg_ctl.exe') -Arguments @('-D', $data, '-m', 'fast', '-w', 'stop')",
                    text,
                    count=1,
                ),
                encoding="utf-8",
                newline="\r\n",
            )
            (temp_native / "common.ps1").write_text(
                "# Mocks are supplied by the executable harness.",
                encoding="utf-8",
                newline="\r\n",
            )
            (temp_native / "data" / "postgres").mkdir(parents=True)
            (temp_native / "data" / "postgres" / "PG_VERSION").write_text(
                "18",
                encoding="ascii",
            )
            harness_path = temp_root / "harness.ps1"
            harness_path.write_text(harness, encoding="utf-8", newline="\r\n")
            environment = os.environ.copy()
            environment["NATIVE_STOP_TEST_ROOT"] = str(temp_native)
            result = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(harness_path),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                env=environment,
                check=False,
            )

        self.assertEqual(
            result.returncode,
            0,
            msg=result.stdout + result.stderr,
        )
        output = result.stdout + result.stderr
        calls = re.search(r"CALLS:([^\r\n]*)", output)
        lookups = re.search(r"POSTGRES_LOOKUPS:(\d+)", output)
        self.assertIsNotNone(calls, output)
        self.assertIsNotNone(lookups, output)
        self.assertEqual(
            calls.group(1).split(","),
            ["watchdog", "web", "detector", "api", "postgres"],
        )
        self.assertGreaterEqual(int(lookups.group(1)), 1)

    def test_stop_does_not_shadow_powershell_pid_variable(self):
        import re

        text = (NATIVE / "common.ps1").read_text(encoding="utf-8-sig")
        self.assertIsNone(
            re.search(r"^\s*\$pid\s*=", text, flags=re.IGNORECASE | re.MULTILINE),
            "PowerShell $PID is read-only; use a differently named local variable.",
        )

    def test_process_ownership_falls_back_to_command_line_when_working_directory_is_unavailable(self):
        text = (NATIVE / "common.ps1").read_text(encoding="utf-8-sig")
        self.assertIn(
            "if ([string]::IsNullOrWhiteSpace($actualWorkingDirectory))",
            text,
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

    def test_watchdog_does_not_start_with_an_empty_windows_powershell_pipeline(self):
        text = (NATIVE / "watchdog.ps1").read_text(encoding="utf-8-sig")
        self.assertNotIn("\n            | Where-Object", text)

    def test_watchdog_supplies_database_password_before_psql_health_check(self):
        text = (NATIVE / "watchdog.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("$env:PGPASSWORD = $context.Settings['POSTGRES_PASSWORD']", text)

    def test_watchdog_recovery_waits_are_bounded_and_web_is_independent_of_detector(self):
        watchdog = (NATIVE / "watchdog.ps1").read_text(encoding="utf-8-sig")
        services = (NATIVE / "services.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("[int]$WaitSeconds", services)
        self.assertIn("-WaitSeconds 12", watchdog)
        self.assertLess(watchdog.index("if (-not $Snapshot.web)"), watchdog.index("if (-not $Snapshot.detector)"))

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
            ROOT / "\u4e00\u952e\u542f\u52a8\u7a33\u5b9a\u7248.cmd",
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

    def test_detector_build_clears_stale_classes_before_packaging(self):
        text = (NATIVE / "start.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("-DskipTests clean package spring-boot:repackage", text)

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
