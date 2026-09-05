"""Verify platform governance APIs against an isolated SQLite database."""

from __future__ import annotations

import json
import os
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
VERIFY_DIR = ROOT / ".verify"
DATABASE_FILE = VERIFY_DIR / "platform_governance.sqlite3"
ADMIN_TOKEN = f"verify-{secrets.token_urlsafe(24)}"


def request_json(
    base_url: str,
    path: str,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict, dict[str, str]]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request_headers = {"Content-Type": "application/json"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(
        f"{base_url}{path}", data=body, headers=request_headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8")), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8")), dict(error.headers)


def wait_until_ready(base_url: str, process: subprocess.Popen[str]) -> None:
    deadline = time.time() + 20
    while time.time() < deadline:
        if process.poll() is not None:
            stderr = process.stderr.read() if process.stderr else ""
            raise AssertionError(f"API server exited early: {stderr[-2000:]}")
        try:
            status, _, _ = request_json(base_url, "/api/health")
            if status == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.2)
    stderr = process.stderr.read() if process.stderr else ""
    raise AssertionError(f"API server did not become ready: {stderr[-2000:]}")


def reserve_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def main() -> None:
    VERIFY_DIR.mkdir(exist_ok=True)
    DATABASE_FILE.unlink(missing_ok=True)
    port = reserve_port()
    base_url = f"http://127.0.0.1:{port}"
    environment = os.environ.copy()
    environment.update(
        {
            "DATABASE_URL": f"sqlite:///{DATABASE_FILE.as_posix()}",
            "CICSIC_ALLOW_SQLITE_TESTS": "1",
            "APP_ENV": "test",
            "CICSIC_ADMIN_TOKEN": ADMIN_TOKEN,
        }
    )
    process = subprocess.Popen(
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
    try:
        wait_until_ready(base_url, process)

        status, readiness, headers = request_json(base_url, "/api/health/ready")
        assert status == 200, readiness
        assert readiness["status"] == "ready", readiness
        assert headers.get("x-request-id"), headers

        admin_headers = {"X-Admin-Token": ADMIN_TOKEN}
        settings_payload = {
            "sourceAuthEnabled": True,
            "publicWriteRateLimitPerMinute": 2,
            "evidenceUploadLimitMb": 8,
        }
        status, settings, _ = request_json(
            base_url, "/api/admin/platform-settings", "PUT", settings_payload, admin_headers
        )
        assert status == 200, settings
        assert settings["settings"]["sourceAuthEnabled"] is True, settings

        status, created_key, _ = request_json(
            base_url,
            "/api/admin/access-keys",
            "POST",
            {"name": "验收摄像头", "scopes": ["source:ingest"]},
            admin_headers,
        )
        assert status == 200, created_key
        assert created_key["secret"].startswith("cicsic_"), created_key

        observation = {
            "deviceId": "verify-governance-camera",
            "deviceType": "camera",
            "marketId": "NC-NM-001",
            "zoneId": "NC-NM-001-Z1",
            "riskType": "fight",
            "confidence": 0.92,
            "personCount": 2,
            "eventKey": "verify-governance-source",
        }
        status, blocked, _ = request_json(
            base_url, "/api/security-linkage/observations", "POST", observation
        )
        assert status == 401, blocked

        status, accepted, _ = request_json(
            base_url,
            "/api/security-linkage/observations",
            "POST",
            observation,
            {"X-Service-Key": created_key["secret"]},
        )
        assert status == 200, accepted

        for index in range(2):
            status, response, _ = request_json(
                base_url,
                "/api/events/help",
                "POST",
                {
                    "bay": "平台治理验收区",
                    "description": "平台治理接口验收",
                    "latitude": 28.6821,
                    "longitude": 115.8588,
                },
            )
            assert status == 200, response
        status, limited, _ = request_json(
            base_url,
            "/api/events/help",
            "POST",
            {
                "bay": "平台治理验收区",
                "description": "平台治理接口验收",
                "latitude": 28.6821,
                "longitude": 115.8588,
            },
        )
        assert status == 429, limited

        status, audit_logs, _ = request_json(base_url, "/api/admin/system-audit-logs", headers=admin_headers)
        assert status == 200, audit_logs
        assert any(item["action"] == "platform.settings.update" for item in audit_logs["items"]), audit_logs
        assert any(item["action"] == "access_key.create" for item in audit_logs["items"]), audit_logs

        status, revoked, _ = request_json(
            base_url,
            f"/api/admin/access-keys/{created_key['keyId']}",
            "PATCH",
            {"status": "revoked"},
            admin_headers,
        )
        assert status == 200, revoked
        status, rejected, _ = request_json(
            base_url,
            "/api/security-linkage/observations",
            "POST",
            {**observation, "eventKey": "verify-governance-revoked"},
            {"X-Service-Key": created_key["secret"]},
        )
        assert status == 401, rejected
        print("platform governance HTTP API verification passed")
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        for _ in range(10):
            try:
                DATABASE_FILE.unlink(missing_ok=True)
                break
            except PermissionError:
                time.sleep(0.2)


if __name__ == "__main__":
    main()
