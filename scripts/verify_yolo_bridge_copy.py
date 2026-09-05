from __future__ import annotations

import base64
import json
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from app.services.yolo_bridge import CicsicReviewNotifier, build_review_payload


FAKE_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQL/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Af/EABQRAQAAAAAAAAAAAAAAAAAA"
    "AAD/2gAIAQIBAT8A/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EF//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EF//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EF//2Q=="
)


class BridgeHandler(BaseHTTPRequestHandler):
    received: list[dict] = []

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        self.received.append({"path": self.path, "body": body, "headers": dict(self.headers)})
        payload = json.dumps({"ok": True}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args) -> None:
        return


def _serve(server: ThreadingHTTPServer) -> threading.Thread:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 5110), BridgeHandler)
    _serve(server)
    try:
        image_path = ROOT / ".codex" / "bridge-copy-fixture.jpg"
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(FAKE_JPEG)

        payload = build_review_payload(
            ["打架", "人员聚集"],
            person_count=9,
            fps=23.5,
            frame_count=48,
            timestamp="2026-08-30T10:12:13",
            camera_name="主街烧烤区",
            camera_id="cam-001",
            image_path=str(image_path),
        )
        assert payload is not None
        assert payload["actions"] == ["打架", "人员聚集"]
        assert payload["imageMimeType"] == "image/jpeg"

        def post_func(url: str, payload: dict, headers: dict[str, str], timeout: float) -> None:
            request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
            request.add_header("Content-Type", "application/json")
            for key, value in headers.items():
                request.add_header(key, value)
            with urllib.request.urlopen(request, timeout=timeout):
                pass

        notifier = CicsicReviewNotifier(
            url="http://127.0.0.1:5110/api/security-ai/yolo-reviews",
            enabled=True,
            timeout=2.0,
            post_func=post_func,
        )
        accepted = notifier.notify(
            ["打架", "人员聚集"],
            person_count=9,
            fps=23.5,
            frame_count=48,
            timestamp="2026-08-30T10:12:13",
            camera_name="主街烧烤区",
            camera_id="cam-001",
            image_path=str(image_path),
        )
        assert accepted is True

        for _ in range(20):
            if BridgeHandler.received:
                break
            threading.Event().wait(0.1)
        assert BridgeHandler.received, "通知应写入本地假接口"
        body = BridgeHandler.received[0]["body"]
        assert body["actions"][0] == "打架"
        assert body["cameraId"] == "cam-001"
        assert body["imageFilename"] == "bridge-copy-fixture.jpg"

        attempts = 0

        def flaky_post(url: str, payload: dict, headers: dict[str, str], timeout: float) -> None:
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise ConnectionError("temporary review endpoint interruption")
            post_func(url, payload, headers, timeout)

        retrying_notifier = CicsicReviewNotifier(
            url="http://127.0.0.1:5110/api/security-ai/yolo-reviews",
            enabled=True,
            timeout=2.0,
            max_attempts=3,
            retry_delay=0.01,
            post_func=flaky_post,
        )
        assert retrying_notifier.notify(
            ["人员聚集"],
            person_count=7,
            fps=24.0,
            frame_count=48,
            timestamp="2026-08-30T10:12:14",
            camera_name="主街烧烤区",
            camera_id="cam-001",
            image_path=str(image_path),
        ) is True
        for _ in range(30):
            if attempts == 3:
                break
            threading.Event().wait(0.05)
        assert attempts == 3, "短暂网络中断后应在限定次数内重试"

        outbox_dir = ROOT / ".codex" / "bridge-review-outbox"
        if outbox_dir.exists():
            for item in outbox_dir.glob("*.json"):
                item.unlink()

        def unavailable_post(url: str, payload: dict, headers: dict[str, str], timeout: float) -> None:
            raise ConnectionError("review endpoint unavailable")

        retained_notifier = CicsicReviewNotifier(
            url="http://127.0.0.1:5110/api/security-ai/yolo-reviews",
            enabled=True,
            timeout=2.0,
            max_attempts=2,
            retry_delay=0.01,
            outbox_dir=str(outbox_dir),
            post_func=unavailable_post,
        )
        assert retained_notifier.notify(
            ["人员聚集"],
            person_count=6,
            fps=24.0,
            frame_count=48,
            timestamp="2026-08-30T10:12:15",
            camera_name="主街烧烤区",
            camera_id="cam-001",
            image_path=str(image_path),
        ) is True
        for _ in range(30):
            retained = list(outbox_dir.glob("*.json"))
            if retained:
                break
            threading.Event().wait(0.05)
        assert retained, "超过重试次数的检测应保留为本地复核待办"
        saved = json.loads(retained[0].read_text(encoding="utf-8"))
        assert saved["payload"]["eventKey"].endswith("2026-08-30T10:12:15")
        outbox_status = retained_notifier.outbox_status()
        assert outbox_status["pendingCount"] == 1
        assert outbox_status["latestRecordedAt"]

        recovery_notifier = CicsicReviewNotifier(
            url="http://127.0.0.1:5110/api/security-ai/yolo-reviews",
            enabled=True,
            timeout=2.0,
            max_attempts=1,
            outbox_dir=str(outbox_dir),
            post_func=post_func,
        )
        assert recovery_notifier.notify(
            ["人员聚集"],
            person_count=5,
            fps=24.0,
            frame_count=48,
            timestamp="2026-08-30T10:12:16",
            camera_name="主街烧烤区",
            camera_id="cam-001",
            image_path=str(image_path),
        ) is True
        for _ in range(30):
            if not list(outbox_dir.glob("*.json")):
                break
            threading.Event().wait(0.05)
        assert not list(outbox_dir.glob("*.json")), "新检测到达时应补发并清理本地复核待办"
        print("yolo_bridge_copy ok")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
