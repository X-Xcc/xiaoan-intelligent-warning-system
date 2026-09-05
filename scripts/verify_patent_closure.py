from __future__ import annotations

import sys
import os
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
TEST_DATABASE = ROOT / ".codex" / "verify_patent_closure.sqlite3"
TEST_DATABASE.parent.mkdir(parents=True, exist_ok=True)
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DATABASE.as_posix()}"
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from verify_env import configure_verify_environment

configure_verify_environment()

from sqlalchemy import delete, select

from app.services import event_store
from app.services.database import DB_LOCK, SessionLocal
from app.services.models import AlarmPush, EventAuditLog, NotificationRecord, SafetyEvent, SecurityDetection


def _cleanup(event_ids: list[str], event_keys: list[str]) -> None:
    with DB_LOCK, SessionLocal() as session:
        if event_ids:
            session.execute(delete(NotificationRecord).where(NotificationRecord.eventId.in_(event_ids)))
            session.execute(delete(AlarmPush).where(AlarmPush.eventId.in_(event_ids)))
            session.execute(delete(EventAuditLog).where(EventAuditLog.eventId.in_(event_ids)))
            session.execute(delete(SafetyEvent).where(SafetyEvent.id.in_(event_ids)))
        if event_keys:
            session.execute(delete(SecurityDetection).where(SecurityDetection.eventKey.in_(event_keys)))
        session.commit()


def main() -> None:
    marker = datetime.now().strftime("%Y%m%d%H%M%S%f")
    event_key = f"verify-patent-{marker}"
    event_ids = [f"VIDET-{event_key}"]
    event_store.init_db()
    _cleanup(event_ids, [event_key])

    try:
        event_store.update_staff_location("wang", 28.6821, 115.8586)
        event_store.update_staff_location("li", 28.6822, 115.8587)

        detection = {
            "sourceId": f"DET-PATENT-{marker}",
            "eventKey": event_key,
            "actions": ["人员聚集"],
            "primaryAction": "人员聚集",
            "timestamp": datetime.now(),
            "personCount": 8,
            "frameCount": 96,
            "fps": 24.0,
            "imageFilename": "evidence-frame.jpg",
            "cameraName": "主街烧烤区",
            "cameraId": "cam-patent-001",
            "path": str(ROOT / ".codex" / "patent-evidence" / "detection.json"),
        }
        event = event_store.ingest_security_detection(detection)
        assert event is not None
        assert event["meta"]["securityDetection"]["imageFilename"] == "evidence-frame.jpg"
        assert event["meta"]["securityDetection"]["eventKey"] == event_key

        repeated = event_store.ingest_security_detection(detection)
        assert repeated is not None
        assert repeated["id"] == event["id"], "同一 eventKey 应归并到同一事件"

        reviewed = event_store.attach_vision_review(
            event["id"],
            {
                "isGathering": False,
                "riskLevel": "low",
                "peopleEstimate": 2,
                "sceneSummary": "现场人数已下降，通道可通行。",
                "suggestion": "保持人工观察。",
            },
            "专利闭环验收",
        )
        assert reviewed is not None
        assert reviewed["level"] == "低风险"
        assert reviewed["meta"]["dispatchPriority"] == "低"
        assert reviewed["meta"]["visionReviewStatus"] == "cleared"

        assigned = event_store.assign_event(event["id"], "王队", operator="专利闭环验收")
        assert assigned is not None
        candidates = assigned["meta"]["assignment"]["candidates"]
        assert all(item["online"] for item in candidates)
        assert all("load" in item and "responsibilityMatched" in item for item in candidates)
        assert assigned["meta"]["assignment"]["staffId"] == "wang"

        completed = event_store.update_event(
            event["id"],
            "已完成",
            "王队",
            "现场确认完成",
            "专利闭环验收",
        )
        assert completed is not None
        completion_log = completed["timeline"][-1]
        assert completion_log["details"]["previousStatus"] == "已派单"
        assert completion_log["details"]["nextStatus"] == "已完成"
        assert completion_log["details"]["evidenceIndex"]["eventKey"] == event_key
        assert completion_log["details"]["operationLocation"]["name"] == "主街烧烤区"
    finally:
        _cleanup(event_ids, [event_key])

    print("patent_closure ok")


if __name__ == "__main__":
    main()
