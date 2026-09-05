from __future__ import annotations

import base64
from datetime import datetime
import json
import logging
import os
from pathlib import Path
import re
import threading
import time
from typing import Any, Callable

try:
    import requests
except ImportError:  # pragma: no cover - optional runtime dependency
    requests = None


from app.services.security_detection import ACTION_TITLES


logger = logging.getLogger(__name__)
SUPPORTED_ACTIONS = set(ACTION_TITLES)
PostFunc = Callable[[str, dict[str, Any], dict[str, str], float], None]


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def build_review_payload(
    actions: list[str],
    person_count: int,
    fps: float,
    frame_count: int,
    timestamp: str,
    camera_name: str | None,
    camera_id: str | None,
    image_path: str | None,
) -> dict[str, Any] | None:
    """Build a CICSIC review payload from one detection result and one evidence frame."""
    normalized_actions = [str(action) for action in actions if str(action) in SUPPORTED_ACTIONS]
    if not normalized_actions:
        return None

    payload: dict[str, Any] = {
        "sourceId": "yolov8-security",
        "eventKey": f"yolo:{camera_id or 'unknown'}:{timestamp}",
        "cameraId": camera_id,
        "cameraName": camera_name,
        "timestamp": timestamp,
        "actions": normalized_actions,
        "personCount": int(person_count),
        "frameCount": int(frame_count),
        "fps": float(fps),
        "imageFilename": os.path.basename(image_path) if image_path else None,
    }
    if image_path and os.path.exists(image_path):
        with open(image_path, "rb") as image_file:
            payload["imageBase64"] = base64.b64encode(image_file.read()).decode("ascii")
        payload["imageMimeType"] = "image/jpeg"
    return payload


class CicsicReviewNotifier:
    """Send YOLO-style detection evidence into CICSIC without carrying the video stream."""

    def __init__(
        self,
        url: str | None = None,
        enabled: bool | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
        max_attempts: int | None = None,
        retry_delay: float | None = None,
        outbox_dir: str | None = None,
        post_func: PostFunc | None = None,
    ):
        self.url = (url or os.environ.get("CICSIC_REVIEW_URL", "http://127.0.0.1:8010/api/security-ai/yolo-reviews")).strip()
        self.enabled = _env_bool("CICSIC_REVIEW_ENABLED") if enabled is None else enabled
        self.api_key = api_key if api_key is not None else os.environ.get("CICSIC_REVIEW_API_KEY", "")
        self.timeout = timeout if timeout is not None else float(os.environ.get("CICSIC_REVIEW_TIMEOUT", "2.5"))
        self.max_attempts = max(1, max_attempts if max_attempts is not None else int(os.environ.get("CICSIC_REVIEW_MAX_ATTEMPTS", "3")))
        self.retry_delay = max(0.0, retry_delay if retry_delay is not None else float(os.environ.get("CICSIC_REVIEW_RETRY_DELAY", "0.5")))
        default_outbox = Path(__file__).resolve().parents[2] / "security-data" / "review-outbox"
        self.outbox_dir = Path(outbox_dir or os.environ.get("CICSIC_REVIEW_OUTBOX_DIR") or default_outbox)
        self._post_func = post_func or self._post_with_requests
        self._state_lock = threading.Lock()
        self._inflight = False

    def notify(
        self,
        actions: list[str],
        person_count: int,
        fps: float,
        frame_count: int,
        timestamp: str,
        camera_name: str | None,
        camera_id: str | None,
        image_path: str | None,
    ) -> bool:
        if not self.enabled or not self.url:
            return False
        payload = build_review_payload(
            actions,
            person_count,
            fps,
            frame_count,
            timestamp,
            camera_name,
            camera_id,
            image_path,
        )
        if payload is None:
            return False
        with self._state_lock:
            if self._inflight:
                return False
            self._inflight = True
        threading.Thread(target=self._send_with_recovery, args=(payload,), daemon=True).start()
        return True

    def retry_retained(self, limit: int = 20) -> bool:
        if not self.enabled or not self.url:
            return False
        with self._state_lock:
            if self._inflight:
                return False
            self._inflight = True
        threading.Thread(target=self._retry_retained, args=(max(1, int(limit)),), daemon=True).start()
        return True

    def outbox_status(self) -> dict[str, Any]:
        records = list(self.outbox_dir.glob("*.json")) if self.outbox_dir.exists() else []
        latest_recorded_at: str | None = None
        for record_path in records:
            try:
                record = json.loads(record_path.read_text(encoding="utf-8"))
                recorded_at = record.get("recordedAt") if isinstance(record, dict) else None
                if isinstance(recorded_at, str) and (latest_recorded_at is None or recorded_at > latest_recorded_at):
                    latest_recorded_at = recorded_at
            except (OSError, json.JSONDecodeError):
                continue
        return {
            "outboxDir": str(self.outbox_dir),
            "pendingCount": len(records),
            "latestRecordedAt": latest_recorded_at,
        }

    def _send_with_recovery(self, payload: dict[str, Any]) -> None:
        try:
            self._retry_retained_records(limit=5)
            self._post_payload(payload)
        finally:
            with self._state_lock:
                self._inflight = False

    def _retry_retained(self, limit: int) -> None:
        try:
            self._retry_retained_records(limit)
        finally:
            with self._state_lock:
                self._inflight = False

    def _retry_retained_records(self, limit: int) -> None:
        if not self.outbox_dir.exists():
            return
        for record_path in sorted(self.outbox_dir.glob("*.json"))[:limit]:
            try:
                record = json.loads(record_path.read_text(encoding="utf-8"))
                payload = record.get("payload") if isinstance(record, dict) else None
                if not isinstance(payload, dict):
                    continue
                if self._post_payload(payload):
                    record_path.unlink()
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning("YOLO 本地复核待办读取失败: %s", exc)

    def _post_payload(self, payload: dict[str, Any]) -> bool:
        headers = {"X-API-Key": self.api_key} if self.api_key else {}
        for attempt in range(1, self.max_attempts + 1):
            try:
                self._post_func(self.url, payload, headers, self.timeout)
                logger.info("YOLO 检测结果已上报 CICSIC: %s", self.url)
                return True
            except Exception as exc:
                if attempt == self.max_attempts:
                    self._retain_for_manual_review(payload, exc)
                    logger.warning("YOLO 检测结果上报失败，不影响本地检测: %s", exc)
                    return False
                logger.info("YOLO 检测结果上报第 %s 次重试", attempt + 1)
                time.sleep(self.retry_delay)
        return False

    def _retain_for_manual_review(self, payload: dict[str, Any], error: Exception) -> None:
        try:
            self.outbox_dir.mkdir(parents=True, exist_ok=True)
            event_key = str(payload.get("eventKey") or datetime.now().isoformat(timespec="seconds"))
            safe_event_key = re.sub(r"[^A-Za-z0-9._-]+", "_", event_key).strip("._") or "review"
            record = {
                "status": "manual_confirmation",
                "recordedAt": datetime.now().isoformat(timespec="seconds"),
                "lastError": str(error),
                "payload": payload,
            }
            target = self.outbox_dir / f"{safe_event_key}.json"
            temporary = target.with_suffix(".tmp")
            temporary.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
            temporary.replace(target)
        except OSError as retain_error:
            logger.warning("YOLO 检测结果本地留存失败: %s", retain_error)

    def _post_with_requests(
        self,
        url: str,
        payload: dict[str, Any],
        headers: dict[str, str],
        timeout: float,
    ) -> None:
        if requests is None:
            raise RuntimeError("未安装 requests，无法上报 CICSIC")
        response = requests.post(url, json=payload, headers=headers, timeout=timeout)
        response.raise_for_status()
