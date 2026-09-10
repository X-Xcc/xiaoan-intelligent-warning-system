"""Optional bridge from the standalone YOLO service to CICSIC."""

import base64
import logging
import os
import threading
from typing import Any, Callable

try:
    import requests
except ImportError:  # pragma: no cover - handled by the runtime configuration
    requests = None


logger = logging.getLogger(__name__)
GATHERING_ACTIONS = {"人员聚集", "异常聚集"}
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
    """Build a CICSIC review request from one YOLO result and one evidence frame."""
    if not any(action in GATHERING_ACTIONS for action in actions):
        return None

    payload: dict[str, Any] = {
        "sourceId": "yolov8-security",
        "eventKey": f"yolo:{camera_id or 'unknown'}:{timestamp}",
        "cameraId": camera_id,
        "cameraName": camera_name,
        "timestamp": timestamp,
        "actions": actions,
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
    """Send YOLO gathering evidence to CICSIC without carrying the video stream."""

    def __init__(
        self,
        url: str | None = None,
        enabled: bool | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
        post_func: PostFunc | None = None,
    ):
        self.url = (url or os.environ.get("CICSIC_REVIEW_URL", "")).strip()
        self.enabled = _env_bool("CICSIC_REVIEW_ENABLED") if enabled is None else enabled
        self.api_key = api_key if api_key is not None else os.environ.get("CICSIC_REVIEW_API_KEY", "")
        self.timeout = timeout if timeout is not None else float(os.environ.get("CICSIC_REVIEW_TIMEOUT", "2.5"))
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
        threading.Thread(target=self._send, args=(payload,), daemon=True).start()
        return True

    def _send(self, payload: dict[str, Any]) -> None:
        try:
            headers = {"X-Service-Key": self.api_key} if self.api_key else {}
            self._post_func(self.url, payload, headers, self.timeout)
            logger.info("YOLO 聚集结果已上报 CICSIC: %s", self.url)
        except Exception as exc:
            logger.warning("YOLO 聚集结果上报失败，不影响本地检测: %s", exc)
        finally:
            with self._state_lock:
                self._inflight = False

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
