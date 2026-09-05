from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
YOLO_FIXTURE = ROOT / ".codex" / "security-yolo-review-fixture"
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from verify_env import configure_verify_environment
configure_verify_environment()

from sqlalchemy import delete, select

from app.services.database import DB_LOCK, SessionLocal
from app.services.models import AlarmPush, EventAuditLog, NotificationRecord, SafetyEvent, SecurityDetection


def _cleanup_fixture_rows() -> None:
    with DB_LOCK, SessionLocal() as session:
        stale_rows = session.scalars(
            select(SecurityDetection).where(
                (SecurityDetection.sourceId == "DET_CAM_001_GATHERING")
                | SecurityDetection.sourceId.like("DET_POSTED_GATHERING_%")
            )
        ).all()
        stale_event_ids = [row.eventId for row in stale_rows if row.eventId]
        if stale_event_ids:
            session.execute(delete(NotificationRecord).where(NotificationRecord.eventId.in_(stale_event_ids)))
            session.execute(delete(AlarmPush).where(AlarmPush.eventId.in_(stale_event_ids)))
            session.execute(delete(EventAuditLog).where(EventAuditLog.eventId.in_(stale_event_ids)))
        session.execute(
            delete(SecurityDetection).where(
                (SecurityDetection.sourceId == "DET_CAM_001_GATHERING")
                | SecurityDetection.sourceId.like("DET_POSTED_GATHERING_%")
            )
        )
        if stale_event_ids:
            session.execute(delete(SafetyEvent).where(SafetyEvent.id.in_(stale_event_ids)))
        session.commit()


FAKE_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQL/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Af/EABQRAQAAAAAAAAAAAAAAAAAA"
    "AAD/2gAIAQIBAT8B/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EF//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EF//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EF//2Q=="
)


class FakeVideoHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path.startswith("/video_feed"):
            chunk = (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + FAKE_JPEG
                + b"\r\n--frame--\r\n"
            )
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Content-Length", str(len(chunk)))
            self.end_headers()
            self.wfile.write(chunk)
            return
        if self.path == "/api/cameras":
            self._json({"success": True, "data": {"cameras": ["cam-001"]}})
            return
        if self.path == "/api/stats/summary":
            self._json({"online": True, "fps": 18.5, "activeCameras": 1})
            return
        self.send_error(404)

    def _json(self, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:
        return


class FakeVlmHandler(BaseHTTPRequestHandler):
    seen_media_urls: list[str] = []

    def do_POST(self) -> None:
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        request_body = json.loads(self.rfile.read(length).decode("utf-8"))
        for message in request_body.get("messages", []):
            for item in message.get("content", []):
                if isinstance(item, dict) and item.get("type") == "image_url":
                    self.seen_media_urls.append(item.get("image_url", {}).get("url", ""))
        self._json(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "isGathering": True,
                                    "riskLevel": "medium",
                                    "peopleEstimate": 7,
                                    "sceneSummary": "摊位前多人停留，通道出现拥堵趋势",
                                    "suggestion": "建议网格员前往现场疏导。",
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ],
                "usage": {"total_tokens": 128},
            }
        )

    def _json(self, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:
        return


def _serve(server: ThreadingHTTPServer) -> threading.Thread:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread


def _wait_until_ready(base_url: str, process: subprocess.Popen) -> None:
    deadline = time.time() + 15
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError("FastAPI 服务提前退出")
        try:
            urllib.request.urlopen(f"{base_url}/api/health", timeout=1).read()
            return
        except Exception:
            time.sleep(0.25)
    raise TimeoutError("FastAPI 服务未在预期时间内就绪")


def _json_request(url: str, payload: dict | None = None, method: str = "GET") -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    _cleanup_fixture_rows()
    YOLO_FIXTURE.mkdir(parents=True, exist_ok=True)
    (YOLO_FIXTURE / "frame_cam-001.jpg").write_bytes(FAKE_JPEG)
    (YOLO_FIXTURE / "detection_cam-001.json").write_text(
        json.dumps(
            {
                "id": "DET_CAM_001_GATHERING",
                "timestamp": "2026-08-28 19:20:00",
                "actions": ["人员聚集"],
                "person_count": 7,
                "camera_name": "主街烧烤区",
                "camera_id": "cam-001",
                "image_filename": "frame_cam-001.jpg",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    video_server = ThreadingHTTPServer(("127.0.0.1", 5099), FakeVideoHandler)
    vlm_server = ThreadingHTTPServer(("127.0.0.1", 5101), FakeVlmHandler)
    _serve(video_server)
    _serve(vlm_server)

    env = os.environ.copy()
    env["SECURITY_VIDEO_BASE_URL"] = "http://127.0.0.1:5099"
    env["SECURITY_VLM_BASE_URL"] = "http://127.0.0.1:5101/v1"
    env["SECURITY_VLM_API_KEY"] = "fake-key"
    env["SECURITY_VLM_MODEL"] = "qwen-vl-plus"
    env["SECURITY_DETECTION_DATA_DIRS"] = str(YOLO_FIXTURE)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")

    base_url = "http://127.0.0.1:8015"
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
            "8015",
        ],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        _wait_until_ready(base_url, process)
        cameras = _json_request(f"{base_url}/api/security-video/cameras")
        assert cameras["items"][0]["id"] == "cam-001"
        assert cameras["items"][0]["feedUrl"] == "/api/security-video/feed?cam=cam-001"

        with urllib.request.urlopen(f"{base_url}/api/security-video/feed?cam=cam-001", timeout=8) as response:
            content_type = response.headers.get("Content-Type", "")
            body = response.read(128)
        assert content_type.startswith("multipart/x-mixed-replace")
        assert b"--frame" in body

        status = _json_request(f"{base_url}/api/security-ai/status")
        assert status["provider"] == "qwen-compatible"
        assert status["configured"] is True
        assert status["model"] == "qwen-vl-plus"

        judgement = _json_request(
            f"{base_url}/api/security-ai/judgements",
            {
                "cameraId": "cam-001",
                "cameraName": "主街烧烤区",
                "imageBase64": base64.b64encode(FAKE_JPEG).decode("ascii"),
                "detection": {"personCount": 7, "actions": ["人员聚集"]},
            },
            method="POST",
        )
        assert judgement["judgement"]["isGathering"] is True
        assert judgement["judgement"]["riskLevel"] == "medium"
        assert judgement["judgement"]["provider"] == "qwen-compatible"
        assert "疏导" in judgement["judgement"]["suggestion"]
        assert any(url.startswith("data:image/") for url in FakeVlmHandler.seen_media_urls)

        help_event = _json_request(
            f"{base_url}/api/events/help",
            {
                "bay": "主街烧烤区",
                "description": "画面复核对接事件",
                "latitude": 28.682,
                "longitude": 115.8585,
                "contact": "测试",
            },
            method="POST",
        )["event"]
        reviewed = _json_request(
            f"{base_url}/api/events/{help_event['id']}/vision-review",
            {"judgement": judgement["judgement"], "operator": "画面复核服务"},
            method="POST",
        )["event"]
        assert reviewed["meta"]["visionReview"]["isGathering"] is True
        assert reviewed["meta"]["visionReview"]["model"] == "qwen-vl-plus"
        assert reviewed["timeline"][-1]["action"] == "画面复核"

        yolo_review = _json_request(f"{base_url}/api/security-ai/yolo-reviews", method="POST")
        assert yolo_review["detection"]["sourceId"] == "DET_CAM_001_GATHERING"
        assert yolo_review["judgement"]["isGathering"] is True
        assert yolo_review["event"]["meta"]["visionReview"]["model"] == "qwen-vl-plus"
        assert yolo_review["event"]["meta"]["visionReviewStatus"] == "confirmed"

        posted_source_id = f"DET_POSTED_GATHERING_{int(time.time() * 1000)}"
        posted_review = _json_request(
            f"{base_url}/api/security-ai/yolo-reviews",
            {
                "sourceId": posted_source_id,
                "cameraId": "laptop-standalone-yolo",
                "cameraName": "笔记本摄像头",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "actions": ["人员聚集"],
                "personCount": 7,
                "imageMimeType": "image/jpeg",
                "imageBase64": base64.b64encode(FAKE_JPEG).decode("ascii"),
            },
            method="POST",
        )
        assert posted_review["detection"]["sourceId"] == posted_source_id
        assert posted_review["judgement"]["isGathering"] is True
        assert posted_review["event"]["kind"] == "ai_detection"
        assert posted_review["event"]["source"] == "视频提示", repr(posted_review["event"].get("source"))
        assert posted_review["event"]["meta"]["visionReview"]["model"] == "qwen-vl-plus"
        assert posted_review["event"]["meta"]["visionReviewStatus"] == "confirmed"
        assert any(url.startswith("data:image/") for url in FakeVlmHandler.seen_media_urls)
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        video_server.shutdown()
        vlm_server.shutdown()
        _cleanup_fixture_rows()

    print("security_video_ai_routes ok")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        sys.stderr.write(f"HTTP {exc.code}: {exc.read().decode('utf-8', errors='replace')}\n")
        raise
