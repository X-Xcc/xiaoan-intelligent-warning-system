from __future__ import annotations

import hashlib
import json
import os
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import SecurityDetection


SERVER_DIR = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT_DATA_DIR = SERVER_DIR / "security-data"
DEFAULT_PROJECT_MODEL_PATH = SERVER_DIR / "models" / "yolov8n-pose.pt"

ACTION_TITLES = {
    "人员聚集": "人员聚集提示",
    "异常聚集": "人员聚集提示",
    "打架": "打架斗殴提示",
    "跌倒": "人员跌倒提示",
    "离岗": "值守离岗提醒",
    "越界": "越界风险提示",
}

ACTION_LEVELS = {
    "人员聚集": "高风险",
    "异常聚集": "高风险",
    "打架": "高风险",
    "跌倒": "中风险",
    "离岗": "中风险",
    "越界": "中风险",
}
GATHERING_ACTIONS = {"人员聚集", "异常聚集"}


def _timestamp_iso(value: Any) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat(timespec="seconds")
    if value is None:
        return datetime.now().isoformat(timespec="seconds")
    return str(value)


def _serialize_detection_payload(detection: dict[str, Any]) -> dict[str, Any]:
    payload = dict(detection)
    payload["timestamp"] = _timestamp_iso(payload.get("timestamp"))
    return payload


def _row_to_detection(row: SecurityDetection) -> dict[str, Any]:
    timestamp_text = row.timestamp or row.updatedAt
    try:
        timestamp = datetime.fromisoformat(timestamp_text)
    except ValueError:
        timestamp = datetime.now()
    payload = dict(row.payload_json or {})
    return {
        "sourceId": row.sourceId,
        "eventKey": row.eventKey,
        "actions": list(row.actions_json or [row.primaryAction]),
        "primaryAction": row.primaryAction,
        "timestamp": timestamp,
        "personCount": row.personCount,
        "frameCount": row.frameCount,
        "fps": row.fps,
        "imageFilename": row.imageFilename,
        "cameraName": row.cameraName,
        "cameraId": row.cameraId,
        "path": row.sourcePath,
        "eventId": row.eventId,
        "payload": payload,
    }


def _parse_detection_row(session: Session, detection: dict[str, Any]) -> SecurityDetection:
    event_key = str(detection["eventKey"])
    row = session.get(SecurityDetection, event_key)
    now_iso = datetime.now().isoformat(timespec="seconds")
    payload = _serialize_detection_payload(detection)
    actions = [str(action) for action in detection.get("actions", []) if str(action) in ACTION_TITLES]
    if not actions:
        actions = [str(detection.get("primaryAction") or "")]
    timestamp = _timestamp_iso(detection.get("timestamp"))
    if row:
        row.eventId = detection.get("eventId") or row.eventId
        row.sourceId = str(detection.get("sourceId") or row.sourceId)
        row.cameraId = detection.get("cameraId")
        row.cameraName = detection.get("cameraName")
        row.timestamp = timestamp
        row.primaryAction = str(detection.get("primaryAction") or actions[0] or row.primaryAction)
        row.personCount = int(detection.get("personCount") or 0)
        row.frameCount = int(detection.get("frameCount") or 0)
        row.fps = float(detection.get("fps") or 0)
        row.imageFilename = detection.get("imageFilename")
        row.sourcePath = detection.get("path")
        row.actions_json = actions
        row.payload_json = payload
        row.updatedAt = now_iso
    else:
        row = SecurityDetection(
            eventKey=event_key,
            eventId=detection.get("eventId"),
            sourceId=str(detection.get("sourceId") or event_key),
            cameraId=detection.get("cameraId"),
            cameraName=detection.get("cameraName"),
            timestamp=timestamp,
            primaryAction=str(detection.get("primaryAction") or actions[0]),
            personCount=int(detection.get("personCount") or 0),
            frameCount=int(detection.get("frameCount") or 0),
            fps=float(detection.get("fps") or 0),
            imageFilename=detection.get("imageFilename"),
            sourcePath=detection.get("path"),
            actions_json=actions,
            payload_json=payload,
            createdAt=now_iso,
            updatedAt=now_iso,
        )
        session.add(row)
    session.flush()
    return row


def configured_data_dirs() -> list[Path]:
    raw = os.getenv("SECURITY_DETECTION_DATA_DIRS")
    if raw:
        return [Path(item).expanduser() for item in raw.split(os.pathsep) if item.strip()]
    return [DEFAULT_PROJECT_DATA_DIR]


def configured_model_path() -> Path:
    raw = os.getenv("SECURITY_MODEL_PATH")
    if raw:
        return Path(raw).expanduser()
    return DEFAULT_PROJECT_MODEL_PATH


def _parse_timestamp(value: str | None, fallback: float) -> datetime:
    if value:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.fromtimestamp(fallback)


def _read_detection(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None

    actions = payload.get("actions")
    if not isinstance(actions, list):
        return None
    normalized_actions = [str(action) for action in actions if str(action) in ACTION_TITLES]
    if not normalized_actions:
        return None

    stat = path.stat()
    timestamp = _parse_timestamp(payload.get("timestamp"), stat.st_mtime)
    source_id = str(payload.get("id") or path.stem)
    return {
        "sourceId": source_id,
        "eventKey": hashlib.sha1(f"{path.resolve()}:{source_id}:{','.join(normalized_actions)}".encode("utf-8")).hexdigest()[:16],
        "actions": normalized_actions,
        "primaryAction": normalized_actions[0],
        "timestamp": timestamp,
        "personCount": int(payload.get("person_count") or payload.get("personCount") or 0),
        "frameCount": int(payload.get("frame_count") or payload.get("frameCount") or 0),
        "fps": float(payload.get("fps") or 0),
        "imageFilename": payload.get("image_filename") or payload.get("imageFilename"),
        "cameraName": payload.get("camera_name") or payload.get("cameraName"),
        "cameraId": payload.get("camera_id") or payload.get("cameraId"),
        "path": str(path),
    }


def scan_detections(limit: int = 200) -> list[dict[str, Any]]:
    detections: list[dict[str, Any]] = []
    for data_dir in configured_data_dirs():
        if not data_dir.exists():
            continue
        for path in data_dir.rglob("detection_*.json"):
            if path.is_file():
                detection = _read_detection(path)
                if detection:
                    detections.append(detection)
    detections.sort(key=lambda item: item["timestamp"], reverse=True)
    return detections[:limit]


def import_security_detections_from_files(limit: int = 200) -> list[dict[str, Any]]:
    init_database()
    detections = scan_detections(limit=limit)
    if not detections:
        return []

    with DB_LOCK, SessionLocal() as session:
        rows = [_parse_detection_row(session, detection) for detection in detections]
        session.commit()
        return [_row_to_detection(row) for row in rows]


def upsert_security_detection(detection: dict[str, Any]) -> dict[str, Any]:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        row = _parse_detection_row(session, detection)
        session.commit()
        return _row_to_detection(row)


def list_security_detections(limit: int = 200) -> list[dict[str, Any]]:
    init_database()
    with SessionLocal() as session:
        rows = session.scalars(
            select(SecurityDetection).order_by(SecurityDetection.timestamp.desc(), SecurityDetection.updatedAt.desc())
        ).all()
        return [_row_to_detection(row) for row in rows[:limit]]


def status_summary(refresh_from_files: bool = False) -> dict[str, Any]:
    if refresh_from_files:
        import_security_detections_from_files()

    detections = list_security_detections()
    counts = Counter()
    for detection in detections:
        counts.update(detection["actions"])
    latest_gathering = next(
        (detection for detection in detections if any(action in GATHERING_ACTIONS for action in detection["actions"])),
        None,
    )

    model_path = configured_model_path()
    model_exists = model_path.exists()
    model_size_mb = round(model_path.stat().st_size / 1024 / 1024, 1) if model_exists else 0
    return {
        "configured": bool(detections) or model_exists or any(path.exists() for path in configured_data_dirs()),
        "dataDirs": [str(path) for path in configured_data_dirs()],
        "model": {
            "path": str(model_path),
            "exists": model_exists,
            "sizeMb": model_size_mb,
        },
        "detections": {
            "total": len(detections),
            "gathering": counts["人员聚集"] + counts["异常聚集"],
            "fight": counts["打架"],
            "fall": counts["跌倒"],
            "absence": counts["离岗"],
        },
        "latest": detections[0] if detections else None,
        "latestGathering": latest_gathering,
    }
