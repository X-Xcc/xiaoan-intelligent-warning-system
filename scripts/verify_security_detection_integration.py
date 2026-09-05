from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import delete, select, text


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from verify_env import configure_verify_environment

configure_verify_environment()

WORK_DIR = ROOT / ".codex" / "security-detection-fixture"
DATA_DIR = WORK_DIR / "data" / "人员聚集"
MODEL_DIR = WORK_DIR / "models"
MODEL_PATH = MODEL_DIR / "yolov8n-pose.pt"

os.environ["SECURITY_DETECTION_DATA_DIRS"] = str(WORK_DIR / "data")
os.environ["SECURITY_MODEL_PATH"] = str(MODEL_PATH)

from app.services import event_store
from app.services.database import DB_LOCK, SessionLocal
from app.services.models import AlarmPush, EventAuditLog, NotificationRecord, SafetyEvent, SecurityDetection


def main() -> None:
    if WORK_DIR.exists():
        shutil.rmtree(WORK_DIR)
    DATA_DIR.mkdir(parents=True)
    MODEL_DIR.mkdir(parents=True)
    MODEL_PATH.write_bytes(b"fixture model")

    source_id = "DET-CICSIC-GATHER-001"
    detection = {
        "id": source_id,
        "timestamp": "2026-08-28 21:12:31",
        "person_count": 7,
        "actions": ["人员聚集"],
        "frame_count": 128,
        "fps": 26.4,
        "image_filename": "frame_20260828211231.jpg",
        "camera_name": "绳金塔主街客流相机",
        "camera_id": "cam-shengjinta-main",
    }
    (DATA_DIR / "detection_20260828211231.json").write_text(json.dumps(detection, ensure_ascii=False), encoding="utf-8")

    with DB_LOCK, SessionLocal() as session:
        stale_rows = session.scalars(select(SecurityDetection).where(SecurityDetection.sourceId == source_id)).all()
        stale_event_ids = [row.eventId for row in stale_rows if row.eventId]
        if stale_event_ids:
            session.execute(delete(NotificationRecord).where(NotificationRecord.eventId.in_(stale_event_ids)))
            session.execute(delete(AlarmPush).where(AlarmPush.eventId.in_(stale_event_ids)))
            session.execute(delete(EventAuditLog).where(EventAuditLog.eventId.in_(stale_event_ids)))
        session.execute(delete(SecurityDetection).where(SecurityDetection.sourceId == source_id))
        if stale_event_ids:
            session.execute(delete(SafetyEvent).where(SafetyEvent.id.in_(stale_event_ids)))
        session.commit()

    created = event_store.sync_security_detections()
    assert len(created) == 1
    event = created[0]
    assert event["kind"] == "ai_detection"
    assert event["title"] == "人员聚集提示"
    assert event["level"] == "高风险"
    assert event["source"] == "视频提示"
    assert event["bay"] == "绳金塔主街客流相机"
    assert event["meta"]["securityDetection"]["sourceId"] == source_id
    assert event["meta"]["securityDetection"]["personCount"] == 7
    assert event["meta"]["route"]["destination"]["name"] == "绳金塔主街客流相机"

    second_sync = event_store.sync_security_detections()
    assert second_sync == [], "同一条检测结果不应重复生成工单"

    overview = event_store.overview()
    assert any(item["id"] == event["id"] for item in overview["events"])
    assert any(item["eventId"] == event["id"] for item in overview["alarm_pushes"])
    security_model = overview["security_model"]
    assert security_model["configured"] is True
    assert security_model["model"]["exists"] is True
    assert security_model["detections"]["total"] >= 1
    assert security_model["detections"]["gathering"] >= 1
    assert any(agent["name"] == "视频行为检测" for agent in overview["ai_copilot"]["agents"])

    with DB_LOCK, SessionLocal() as session:
        detection_row = session.scalars(select(SecurityDetection).where(SecurityDetection.sourceId == source_id)).first()
        assert detection_row is not None
        assert detection_row.eventId == event["id"]
        assert detection_row.primaryAction == "人员聚集"

    with DB_LOCK, SessionLocal() as session:
        session.execute(text("DELETE FROM alarm_pushes WHERE event_id = :event_id"), {"event_id": event["id"]})
        session.execute(delete(NotificationRecord).where(NotificationRecord.eventId == event["id"]))
        session.execute(delete(EventAuditLog).where(EventAuditLog.eventId == event["id"]))
        session.execute(delete(SecurityDetection).where(SecurityDetection.sourceId == source_id))
        session.execute(delete(SafetyEvent).where(SafetyEvent.id == event["id"]))
        session.commit()

    shutil.rmtree(WORK_DIR)
    print(f"security_detection_integration ok: {event['id']} {event['title']}")


if __name__ == "__main__":
    main()
