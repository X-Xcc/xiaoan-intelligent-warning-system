"""Smoke verification for the readiness-training pilot API.

The script starts the real FastAPI application on a temporary SQLite database.
It deliberately uses desensitized sample records only, so it verifies the
pilot contract without implying a live-policing or live-motion-capture feed.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
VERIFY_DIR = ROOT / ".verify"
DATABASE_FILE = VERIFY_DIR / "readiness_training_pilot.sqlite3"


def request_json(base_url: str, path: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method=method,
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

        status, readiness = request_json(base_url, "/api/training/readiness")
        assert status == 200, readiness
        assert readiness["dataMode"] == "desensitized_sample", readiness
        assert readiness["ruleVersion"].startswith("READINESS-RULE-"), readiness
        assert len(readiness["recommendations"]) == 3, readiness

        status, tasks = request_json(base_url, "/api/training/tasks")
        assert status == 200 and len(tasks["items"]) == 3, tasks
        task = tasks["items"][0]
        assert task["status"] == "待训练", task

        status, started = request_json(base_url, f"/api/training/tasks/{task['taskId']}/start", "POST")
        assert status == 200 and started["task"]["status"] == "训练中", started
        status, completed = request_json(base_url, f"/api/training/tasks/{task['taskId']}/complete", "POST", {"elapsedSeconds": 28})
        assert status == 200 and completed["task"]["status"] == "待复核", completed

        status, exception = request_json(
            base_url,
            f"/api/training/tasks/{task['taskId']}/exception",
            "POST",
            {"reason": "对讲机电量不足，切换备用设备", "reportedBy": "INSTRUCTOR-001"},
        )
        assert status == 200 and exception["task"]["exception"]["reason"], exception

        status, assessment = request_json(base_url, f"/api/training/tasks/{task['taskId']}/assessment", "POST")
        assert status == 200, assessment
        result = assessment["assessment"]
        assert result["humanReviewRequired"] is True, result
        assert result["reviewStatus"] == "pending", result
        assert result["score"]["total"] >= 0, result

        status, retry = request_json(base_url, f"/api/training/tasks/{task['taskId']}/retry", "POST")
        assert status == 200 and retry["task"]["status"] == "待训练", retry
        assert retry["task"]["taskId"] != task["taskId"], retry
        assert any(item.startswith("复测来源") for item in retry["task"]["basis"]), retry

        status, reviewed = request_json(
            base_url,
            f"/api/training/assessments/{result['assessmentId']}/review",
            "POST",
            {"decision": "confirmed", "reason": "教官抽检确认", "reviewerId": "INSTRUCTOR-001"},
        )
        assert status == 200 and reviewed["assessment"]["reviewStatus"] == "confirmed", reviewed

        status, archives = request_json(base_url, "/api/training/archives")
        assert status == 200 and len(archives["items"]) == 1, archives
        assert archives["items"][0]["retrainingRecommendation"], archives

        record_id = archives["items"][0]["recordId"]
        status, retraining = request_json(base_url, f"/api/training/archives/{record_id}/retraining", "POST")
        assert status == 200 and retraining["task"]["status"] == "待训练", retraining
        assert retraining["task"]["basis"][-1].startswith("来源档案"), retraining
        print("Readiness-training pilot verification passed")
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
