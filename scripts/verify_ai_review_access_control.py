"""Verify that AI review decisions require a real operator permission and are audited."""

from __future__ import annotations

import json
import os
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
DATABASE_FILE = VERIFY_DIR / "ai_review_access_control.sqlite3"


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


def reserve_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
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


def main() -> None:
    VERIFY_DIR.mkdir(exist_ok=True)
    DATABASE_FILE.unlink(missing_ok=True)
    port = reserve_port()
    base_url = f"http://127.0.0.1:{port}"
    environment = os.environ.copy()
    environment.update(
        {
            "APP_ENV": "development",
            "CICSIC_ADMIN_AUTH_ENABLED": "false",
            "DATABASE_URL": f"sqlite:///{DATABASE_FILE.as_posix()}",
            "CICSIC_ALLOW_SQLITE_TESTS": "1",
        }
    )
    os.environ.update(
        {
            "DATABASE_URL": environment["DATABASE_URL"],
            "CICSIC_ALLOW_SQLITE_TESTS": "1",
        }
    )
    sys.path.insert(0, str(SERVER_DIR))
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
        status, runtime = request_json(base_url, "/api/ai-center/runtime")
        assert status == 200, runtime
        review_payload = {
            "auditId": runtime["sampleResult"]["auditId"],
            "decision": "confirmed",
            "reason": "人工核验通过",
        }

        status, anonymous = request_json(
            base_url, "/api/ai-center/review", "POST", review_payload
        )
        assert status == 401, anonymous

        status, login = request_json(
            base_url, "/api/auth/wechat-login", "POST", {"code": "cmd-review"}
        )
        assert status == 200, login
        headers = {"Authorization": f"Bearer {login['token']}"}
        status, forbidden = request_json(
            base_url, "/api/ai-center/review", "POST", review_payload, headers
        )
        assert status == 403, forbidden
        from app.services import auth_store

        auth_store.upsert_user_role(login["user"]["openid"], "指挥员")
        status, profile = request_json(base_url, "/api/auth/me", headers=headers)
        assert status == 200 and "review" in profile["user"]["permissions"], profile

        status, unknown_audit = request_json(
            base_url,
            "/api/ai-center/review",
            "POST",
            {**review_payload, "auditId": "missing-audit-id"},
            headers,
        )
        assert status == 404, unknown_audit
        assert "Traceback" not in str(unknown_audit), unknown_audit

        status, reviewed = request_json(
            base_url, "/api/ai-center/review", "POST", review_payload, headers
        )
        assert status == 200, reviewed
        assert reviewed["review"]["operatorId"] == "dev_cmd-review", reviewed

        status, audit_logs = request_json(base_url, "/api/admin/system-audit-logs")
        assert status == 200, audit_logs
        assert any(
            item["action"] == "ai.result.review"
            and item["resourceId"] == review_payload["auditId"]
            and item["actor"] == "dev_cmd-review"
            for item in audit_logs["items"]
        ), audit_logs
        print("AI review access-control verification passed")
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
