from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, BinaryIO

from app.services.security_detection import status_summary


DEFAULT_VIDEO_BASE_URL = "http://127.0.0.1:5000"


class SecurityVideoUnavailable(RuntimeError):
    pass


def configured_video_base_url() -> str:
    return os.getenv("SECURITY_VIDEO_BASE_URL", DEFAULT_VIDEO_BASE_URL).rstrip("/")


def _timeout() -> float:
    return float(os.getenv("SECURITY_VIDEO_TIMEOUT", "8"))


def _upstream_url(path: str) -> str:
    return f"{configured_video_base_url()}{path}"


def _read_json(path: str) -> dict[str, Any]:
    request = urllib.request.Request(_upstream_url(path), headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=_timeout()) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        raise SecurityVideoUnavailable(str(exc)) from exc


def _extract_camera_items(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "cameras"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        data = payload.get("data")
        if isinstance(data, (dict, list)):
            return _extract_camera_items(data)
    return []


def _normalize_camera(raw: Any, index: int) -> dict[str, Any]:
    if isinstance(raw, str):
        camera_id = raw
        name = raw
        online = True
    elif isinstance(raw, dict):
        camera_id = str(raw.get("id") or raw.get("cameraId") or raw.get("camera_id") or raw.get("cam") or index)
        name = str(raw.get("name") or raw.get("cameraName") or raw.get("camera_name") or f"视频源 {camera_id}")
        online = bool(raw.get("online", raw.get("enabled", True)))
    else:
        camera_id = str(index)
        name = f"视频源 {camera_id}"
        online = True
    return {
        "id": camera_id,
        "name": name,
        "online": online,
        "feedUrl": f"/api/security-video/feed?{urllib.parse.urlencode({'cam': camera_id})}",
        "source": configured_video_base_url(),
    }


def camera_items() -> list[dict[str, Any]]:
    payload = _read_json("/api/cameras")
    return [_normalize_camera(item, index) for index, item in enumerate(_extract_camera_items(payload))]


def fallback_camera_items() -> list[dict[str, Any]]:
    camera_id = os.getenv("SECURITY_VIDEO_DEFAULT_CAMERA", "0")
    return [
        {
            "id": camera_id,
            "name": "默认视频源",
            "online": False,
            "feedUrl": f"/api/security-video/feed?{urllib.parse.urlencode({'cam': camera_id})}",
            "source": configured_video_base_url(),
        }
    ]


def video_status() -> dict[str, Any]:
    try:
        stats = _read_json("/api/stats/summary")
        online = True
    except SecurityVideoUnavailable:
        stats = {}
        online = False

    try:
        cameras = camera_items()
    except SecurityVideoUnavailable:
        cameras = fallback_camera_items()

    return {
        "configured": bool(configured_video_base_url()),
        "online": online,
        "baseUrl": configured_video_base_url(),
        "stats": stats,
        "cameras": cameras,
        "defaultFeedUrl": cameras[0]["feedUrl"] if cameras else None,
        "detection": status_summary(refresh_from_files=False),
    }


def open_video_stream(cam: str) -> tuple[BinaryIO, str]:
    query = urllib.parse.urlencode({"cam": cam or os.getenv("SECURITY_VIDEO_DEFAULT_CAMERA", "0")})
    request = urllib.request.Request(_upstream_url(f"/video_feed?{query}"), headers={"Accept": "multipart/x-mixed-replace"})
    try:
        response = urllib.request.urlopen(request, timeout=_timeout())
    except (OSError, urllib.error.URLError, urllib.error.HTTPError) as exc:
        raise SecurityVideoUnavailable(str(exc)) from exc
    return response, response.headers.get("Content-Type", "multipart/x-mixed-replace; boundary=frame")
