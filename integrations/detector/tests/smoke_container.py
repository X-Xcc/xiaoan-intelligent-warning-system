"""Run inside a disposable container with --network none and no private volumes.

Boots only Java. Does not start inference, scan cameras, call AI, or load weights.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


def main():
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        env = dict(os.environ, ADMIN_USERNAME="deployment-test",
                   ADMIN_PASSWORD=secrets.token_hex(24), API_KEY=secrets.token_hex(32),
                   JWT_SECRET=secrets.token_hex(32), DATA_DIR=str(root / "data"),
                   CAMERAS_CONFIG_PATH=str(root / "runtime" / "cameras.json"),
                   RESULT_DIR=str(root / "results"), XDG_CACHE_HOME=str(root / "cache"),
                   TRAINING_RUNS_DIR=str(root / "runs"), DETECTOR_AUTOSTART="false",
                   GO2RTC_AUTOSTART="false", SNAPSHOT_ENABLED="false",
                   DETECTOR_RETENTION_DAYS="0", CICSIC_REVIEW_ENABLED="false")
        log = root / "java.log"
        with log.open("wb") as output:
            process = subprocess.Popen(["/usr/local/bin/detector-entrypoint"], env=env,
                                       stdout=output, stderr=subprocess.STDOUT)
            try:
                base = "http://127.0.0.1:5000"

                def request(path, data=None, token=None):
                    headers = {}
                    if data is not None:
                        headers["Content-Type"] = "application/json"
                    if token:
                        headers["Authorization"] = f"Bearer {token}"
                    req = urllib.request.Request(base + path, headers=headers,
                                                 data=json.dumps(data).encode() if data is not None else None)
                    with urllib.request.urlopen(req, timeout=5) as response:
                        return response.status, response.read()

                deadline = time.monotonic() + 90
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise AssertionError("Java exited before readiness; inspect disposable container locally")
                    try:
                        status, body = request("/api/detection/status")
                        assert status == 200 and json.loads(body)["data"]["running"] is False
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(1)
                else:
                    raise AssertionError("Java readiness timeout")
                for path in ("/", "/login", "/monitor", "/model-training", "/training"):
                    status, body = request(path)
                    assert status == 200 and b"<html" in body.lower(), path
                status, body = request("/api/login", {
                    "username": env["ADMIN_USERNAME"], "password": env["ADMIN_PASSWORD"]
                })
                payload = json.loads(body)
                token = payload.get("token") or payload.get("data", {}).get("token")
                assert status == 200 and token, "Environment credentials must authenticate"
                status, body = request("/api/detection/stop", {}, token)
                assert status == 200
                status, body = request("/api/camera_config", token=token)
                assert status == 200 and json.loads(body)["data"] == []
                assert (root / "data" / "db" / "cameras.mv.db").is_file()
                print("PASS: Java readiness, SPA routes, environment login, stop API, empty camera inventory, H2 creation")
            finally:
                process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    main()
