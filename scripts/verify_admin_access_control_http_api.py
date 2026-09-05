"""Verify production admin-token initialization and access control."""

from __future__ import annotations

import json
import os
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request
from base64 import b64encode
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
VERIFY_DIR = ROOT / ".verify"
DATABASE_FILE = VERIFY_DIR / "admin_access_control.sqlite3"
ADMIN_TOKEN = f"verify-{secrets.token_urlsafe(24)}"
DB_ADMIN_USER = "verify-db-admin"
DB_ADMIN_PASSWORD = f"verify-{secrets.token_urlsafe(24)}"


def request_json(
    base_url: str,
    path: str,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request_headers = {"Content-Type": "application/json"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(
        f"{base_url}{path}", data=body, headers=request_headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def assert_safe_error(payload: dict, token: str) -> None:
    serialized = json.dumps(payload)
    assert token not in serialized, payload
    assert "Traceback" not in serialized and str(ROOT) not in serialized, payload


def request_text(base_url: str, path: str, headers: dict[str, str]) -> tuple[int, str]:
    request = urllib.request.Request(f"{base_url}{path}", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8")


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_until_ready(base_url: str, process: subprocess.Popen[str]) -> None:
    deadline = time.time() + 20
    while time.time() < deadline:
        if process.poll() is not None:
            stderr = process.stderr.read() if process.stderr else ""
            raise AssertionError(f"API server exited early: {stderr[-2000:]}")
        try:
            status, _ = request_json(base_url, "/api/health")
            if status == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.2)
    raise AssertionError("API server did not become ready")


def start_server(port: int, environment: dict[str, str]) -> subprocess.Popen[str]:
    return subprocess.Popen(
        [
            str(SERVER_DIR / ".venv-runtime" / "Scripts" / "python.exe"),
            "-m",
            "uvicorn",
            "app.main:app",
            "--app-dir",
            str(SERVER_DIR),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def stop_server(process: subprocess.Popen[str]) -> str:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    return process.stderr.read() if process.stderr else ""


def main() -> None:
    VERIFY_DIR.mkdir(exist_ok=True)
    DATABASE_FILE.unlink(missing_ok=True)
    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    locked_environment = os.environ.copy()
    locked_environment.update(
        {
            "DATABASE_URL": f"sqlite:///{DATABASE_FILE.as_posix()}",
            "CICSIC_ALLOW_SQLITE_TESTS": "1",
            "APP_ENV": "production",
            "CICSIC_ADMIN_AUTH_ENABLED": "false",
            "CICSIC_ADMIN_TOKEN": "",
            "DB_ADMIN_USER": DB_ADMIN_USER,
            "DB_ADMIN_PASSWORD": DB_ADMIN_PASSWORD,
        }
    )
    locked_process = start_server(port, locked_environment)
    try:
        wait_until_ready(base_url, locked_process)

        status, auth_status = request_json(base_url, "/api/admin/auth/status")
        assert status == 200, auth_status
        assert auth_status == {"enabled": True, "tokenConfigured": False}, auth_status
        status, locked_read = request_json(base_url, "/api/admin/platform-settings")
        assert status == 401, locked_read
        assert_safe_error(locked_read, ADMIN_TOKEN)
        status, locked_write = request_json(
            base_url,
            "/api/admin/platform-settings",
            "PUT",
            {"sourceAuthEnabled": False, "publicWriteRateLimitPerMinute": 20, "evidenceUploadLimitMb": 20},
        )
        assert status == 401, locked_write
        assert_safe_error(locked_write, ADMIN_TOKEN)
    finally:
        locked_stderr = stop_server(locked_process)
        assert ADMIN_TOKEN not in locked_stderr, "admin token leaked to server stderr"
        assert "Traceback" not in locked_stderr and str(ROOT) not in locked_stderr, "diagnostic data leaked to server stderr"

    environment = dict(locked_environment)
    environment["CICSIC_ADMIN_TOKEN"] = ADMIN_TOKEN
    process = start_server(port, environment)
    try:
        wait_until_ready(base_url, process)

        status, auth_status = request_json(base_url, "/api/admin/auth/status")
        assert status == 200, auth_status
        assert auth_status == {"enabled": True, "tokenConfigured": True}, auth_status

        status, anonymous_read = request_json(base_url, "/api/admin/platform-settings")
        assert status == 401, anonymous_read
        assert_safe_error(anonymous_read, ADMIN_TOKEN)
        status, anonymous_voice_read = request_json(base_url, "/api/admin/voice-broadcast-settings")
        assert status == 401, anonymous_voice_read
        assert_safe_error(anonymous_voice_read, ADMIN_TOKEN)
        status, anonymous_db_admin = request_json(base_url, "/api/db-admin")
        assert status == 401, anonymous_db_admin
        assert_safe_error(anonymous_db_admin, ADMIN_TOKEN)

        status, anonymous_write = request_json(
            base_url,
            "/api/admin/platform-settings",
            "PUT",
            {
                "sourceAuthEnabled": False,
                "publicWriteRateLimitPerMinute": 20,
                "evidenceUploadLimitMb": 20,
            },
        )
        assert status == 401, anonymous_write
        assert_safe_error(anonymous_write, ADMIN_TOKEN)

        status, enabled = request_json(
            base_url,
            "/api/admin/platform-settings",
            "PUT",
            {
                "adminAuthEnabled": True,
                "sourceAuthEnabled": False,
                "publicWriteRateLimitPerMinute": 20,
                "evidenceUploadLimitMb": 20,
            },
            {"X-Admin-Token": ADMIN_TOKEN},
        )
        assert status == 200, enabled
        assert enabled["settings"]["adminAuthEnabled"] is True, enabled
        assert "adminToken" not in enabled["settings"], enabled
        assert "adminTokenHash" not in json.dumps(enabled), enabled

        status, anonymous = request_json(base_url, "/api/admin/overview")
        assert status == 401, anonymous
        assert_safe_error(anonymous, ADMIN_TOKEN)
        status, wrong_token = request_json(
            base_url,
            "/api/admin/overview",
            headers={"X-Admin-Token": "wrong-token"},
        )
        assert status == 401, wrong_token
        assert_safe_error(wrong_token, ADMIN_TOKEN)
        status, wrong_voice_token = request_json(
            base_url,
            "/api/admin/voice-broadcast-settings",
            headers={"X-Admin-Token": "wrong-token"},
        )
        assert status == 401, wrong_voice_token
        assert_safe_error(wrong_voice_token, ADMIN_TOKEN)

        auth_headers = {"X-Admin-Token": ADMIN_TOKEN}
        status, authorized_settings = request_json(
            base_url, "/api/admin/platform-settings", headers=auth_headers
        )
        assert status == 200, authorized_settings
        assert authorized_settings["settings"]["adminAuthEnabled"] is True, authorized_settings
        status, overview = request_json(base_url, "/api/admin/overview", headers=auth_headers)
        assert status == 200, overview
        status, voice_settings = request_json(
            base_url, "/api/admin/voice-broadcast-settings", headers=auth_headers
        )
        assert status == 200, voice_settings
        status, db_admin_without_basic = request_json(base_url, "/api/db-admin", headers=auth_headers)
        assert status == 401, db_admin_without_basic
        legacy_basic = b64encode(b"admin:yanhuo-shaobing-db-admin").decode("ascii")
        status, legacy_db_admin = request_json(
            base_url,
            "/api/db-admin",
            headers={**auth_headers, "Authorization": f"Basic {legacy_basic}"},
        )
        assert status == 401, legacy_db_admin
        configured_basic = b64encode(f"{DB_ADMIN_USER}:{DB_ADMIN_PASSWORD}".encode("utf-8")).decode("ascii")
        status, db_admin_without_token = request_text(
            base_url,
            "/api/db-admin",
            {"Authorization": f"Basic {configured_basic}"},
        )
        assert status == 401, db_admin_without_token
        status, db_admin_page = request_text(
            base_url,
            "/api/db-admin",
            {**auth_headers, "Authorization": f"Basic {configured_basic}"},
        )
        assert status == 200, db_admin_page
        assert ADMIN_TOKEN not in db_admin_page and DB_ADMIN_PASSWORD not in db_admin_page, db_admin_page
        assert "Traceback" not in db_admin_page and str(ROOT) not in db_admin_page, db_admin_page
        status, ops_overview = request_json(base_url, "/api/security-ops/overview", headers=auth_headers)
        assert status == 200, ops_overview

        status, auth_status = request_json(base_url, "/api/admin/auth/status")
        assert status == 200, auth_status
        assert auth_status == {"enabled": True, "tokenConfigured": True}, auth_status

        status, disabled = request_json(
            base_url,
            "/api/admin/platform-settings",
            "PUT",
            {
                "adminAuthEnabled": False,
                "sourceAuthEnabled": False,
                "publicWriteRateLimitPerMinute": 20,
                "evidenceUploadLimitMb": 20,
            },
            auth_headers,
        )
        assert status == 200, disabled
        assert disabled["settings"]["adminAuthEnabled"] is True, disabled
        status, still_blocked = request_json(base_url, "/api/admin/overview")
        assert status == 401, still_blocked

        status, logs = request_json(base_url, "/api/admin/system-audit-logs", headers=auth_headers)
        assert status == 200, logs
        serialized = json.dumps(logs)
        assert ADMIN_TOKEN not in serialized, logs
        assert "Traceback" not in serialized and str(ROOT) not in serialized, logs
        print("admin access-control HTTP API verification passed")
    finally:
        stderr = stop_server(process)
        assert ADMIN_TOKEN not in stderr, "admin token leaked to server stderr"
        assert "Traceback" not in stderr and str(ROOT) not in stderr, "diagnostic data leaked to server stderr"
        for _ in range(10):
            try:
                DATABASE_FILE.unlink(missing_ok=True)
                break
            except PermissionError:
                time.sleep(0.2)


if __name__ == "__main__":
    main()
