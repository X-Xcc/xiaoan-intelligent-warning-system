from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
EMPTY_FIXTURE = ROOT / ".codex" / "security-detection-fixture-empty"
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from verify_env import configure_verify_environment


def _wait_until_ready(base_url: str, process: subprocess.Popen) -> None:
    deadline = time.time() + 12
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError("FastAPI 服务提前退出")
        try:
            urllib.request.urlopen(f"{base_url}/api/health", timeout=1).read()
            return
        except Exception:
            time.sleep(0.25)
    raise TimeoutError("FastAPI 服务未在预期时间内就绪")


def main() -> None:
    configure_verify_environment()
    EMPTY_FIXTURE.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["SECURITY_DETECTION_DATA_DIRS"] = str(EMPTY_FIXTURE)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")

    base_url = "http://127.0.0.1:8013"
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
            "8013",
        ],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        _wait_until_ready(base_url, process)
        request = urllib.request.Request(f"{base_url}/api/events/security-detections/sync", method="POST")
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
        assert "count" in payload
        assert "items" in payload
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    print(f"security_detection_http_api ok: {payload['count']}")


if __name__ == "__main__":
    main()
