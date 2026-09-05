from __future__ import annotations

import sys
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from verify_env import configure_verify_environment

configure_verify_environment()

from sqlalchemy import delete, text

from app.services.database import DB_LOCK, SessionLocal
from app.services.models import EventAuditLog, NotificationRecord, SafetyEvent


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _request(method: str, url: str, payload: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            data = response.read().decode("utf-8")
            return response.status, json.loads(data) if data else {}
    except urllib.error.HTTPError as exc:
        data = exc.read().decode("utf-8")
        return exc.code, json.loads(data) if data else {}


def _start_server(port: int) -> subprocess.Popen:
    env = os.environ.copy()
    env["DATABASE_URL"] = os.environ["DATABASE_URL"]
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
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
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def _wait_until_ready(base_url: str, process: subprocess.Popen) -> None:
    deadline = time.time() + 20
    while time.time() < deadline:
        if process.poll() is not None:
            stderr = process.stderr.read() if process.stderr else ""
            raise RuntimeError(f"server exited early: {stderr}")
        try:
            status, _ = _request("GET", f"{base_url}/api/health")
            if status == 200:
                return
        except Exception:
            pass
        time.sleep(0.2)
    stderr = process.stderr.read() if process.stderr else ""
    stdout = process.stdout.read() if process.stdout else ""
    raise TimeoutError("server did not become ready\n" + (stderr or stdout)[-4000:])


def main() -> None:
    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    process = _start_server(port)
    created: dict | None = None
    try:
        _wait_until_ready(base_url, process)

        status, _ = _request(
            "POST",
            f"{base_url}/api/events/help",
            {"bay": "主街烧烤区", "description": "缺少定位的报警请求"},
        )
        assert status == 422

        status, payload = _request(
            "POST",
            f"{base_url}/api/events/help",
            {
                "bay": "主街烧烤区",
                "description": "HTTP 一键报警链路验证",
                "latitude": 28.6821,
                "longitude": 115.8588,
                "contact": "13800000000",
            },
        )
        assert status == 200, payload
        created = payload["event"]
        assert created["status"] == "已提交"
        assert created["meta"]["alarmLocation"]["source"] == "visitor_gps"

        status, payload = _request("GET", f"{base_url}/api/events/{created['id']}")
        assert status == 200, payload
        assert payload["event"]["id"] == created["id"]

        status, payload = _request("GET", f"{base_url}/api/events/alarm-pushes?event_id={created['id']}")
        assert status == 200, payload
        pushes = payload["items"]
        assert len(pushes) == 1
        assert pushes[0]["status"] == "待确认"

        staff = created["meta"]["assignment"]["staffName"]
        _, payload = _request("GET", f"{base_url}/api/events/staff-tasks?staff={urllib.parse.quote(staff)}")
        before_assign = payload["items"]
        assert all(item["id"] != created["id"] for item in before_assign)

        status, payload = _request(
            "PATCH",
            f"{base_url}/api/events/{created['id']}/assign",
            {"staff": staff, "operator": "指挥中心"},
        )
        assert status == 200, payload
        assigned = payload["event"]
        assert assigned["status"] == "已派单"
        assert assigned["meta"]["route"]["modeLabel"] in {"步行", "骑行", "驾车"}

        _, payload = _request("GET", f"{base_url}/api/events/staff-tasks?staff={urllib.parse.quote(staff)}")
        after_assign = payload["items"]
        assert any(item["id"] == created["id"] for item in after_assign)

        _, overview = _request("GET", f"{base_url}/api/events/overview")
        assert all(not item["id"].startswith("YS-260815-") for item in overview["events"])
        assert overview["stats"]["avg_response_minutes"] is None or overview["stats"]["avg_response_minutes"] >= 0
    finally:
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=8)

        if created:
            with DB_LOCK, SessionLocal() as session:
                session.execute(text("DELETE FROM alarm_pushes WHERE event_id = :event_id"), {"event_id": created["id"]})
                session.execute(delete(NotificationRecord).where(NotificationRecord.eventId == created["id"]))
                session.execute(delete(EventAuditLog).where(EventAuditLog.eventId == created["id"]))
                session.execute(delete(SafetyEvent).where(SafetyEvent.id == created["id"]))
                session.commit()

    print(f"http_alarm_api ok: {created['id']} -> {staff}")


if __name__ == "__main__":
    main()
