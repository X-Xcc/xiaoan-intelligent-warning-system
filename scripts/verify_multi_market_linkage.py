from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
WORK_DIR = ROOT / ".codex" / "multi-market-linkage"
WORK_DIR.mkdir(parents=True, exist_ok=True)
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from verify_env import configure_verify_environment


configure_verify_environment()
os.environ["DATABASE_URL"] = f"sqlite:///{(WORK_DIR / 'multi-market-linkage.db').as_posix()}"
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"
db_path = WORK_DIR / "multi-market-linkage.db"
if db_path.exists():
    db_path.unlink()

from sqlalchemy import delete

from app.services import event_store, security_linkage
from app.services.database import DB_LOCK, SessionLocal
from app.services.models import AlarmPush, DroneTask, EventAuditLog, NotificationRecord, RiskRecord, SafetyEvent, SecurityDetection


def _remove_event(session, event_id: str) -> None:
    session.execute(delete(AlarmPush).where(AlarmPush.eventId == event_id))
    session.execute(delete(NotificationRecord).where(NotificationRecord.eventId == event_id))
    session.execute(delete(EventAuditLog).where(EventAuditLog.eventId == event_id))
    session.execute(delete(SafetyEvent).where(SafetyEvent.id == event_id))


def main() -> None:
    security_linkage.ensure_linkage_defaults()
    created_event_ids: list[str] = []
    created_risk_ids: list[str] = []
    created_task_ids: list[str] = []
    event_key = "verify-device-observation-20260903"

    try:
        merchant_alarm = event_store.create_help_event(
            bay="绳金塔主街客流相机",
            description="商户一键报警：入口发生纠纷，需要巡防到场。",
            latitude=28.6615,
            longitude=115.8972,
            contact="13800000000",
            market_id="NC-NM-001",
            zone_id="NC-NM-001-Z1",
            evidence=[{"kind": "image", "url": "https://example.test/merchant/alarm.jpg"}],
        )
        created_event_ids.append(merchant_alarm["id"])
        context = merchant_alarm["meta"]["context"]
        assert context["marketId"] == "NC-NM-001"
        assert context["zoneId"] == "NC-NM-001-Z1"
        assert context["evidence"][0]["kind"] == "image"

        related_alarm = event_store.create_report_event(
            "打架斗殴",
            "蛤蟆街北口",
            "同城相邻夜市出现相同滋扰线索。",
            market_id="NC-NM-002",
            zone_id="NC-NM-002-Z1",
        )
        created_event_ids.append(related_alarm["id"])
        risk = security_linkage.get_risk_for_event(related_alarm["id"])
        assert risk is not None
        created_risk_ids.append(risk["riskId"])
        assert risk["marketIds"] == ["NC-NM-001", "NC-NM-002"]
        assert risk["level"] == "高风险"
        assert merchant_alarm["id"] in risk["eventIds"]
        assert related_alarm["id"] in risk["eventIds"]

        observation = security_linkage.ingest_device_observation(
            {
                "eventKey": event_key,
                "deviceId": "robotdog-nc-001",
                "deviceType": "robot_dog",
                "cameraId": "robotdog-nc-001-cam",
                "marketId": "NC-NM-001",
                "zoneId": "NC-NM-001-Z1",
                "timestamp": "2026-09-03T21:10:00",
                "riskType": "打架",
                "behaviorScore": 92,
                "crowdScore": 76,
                "thermalScore": 0,
                "confidence": 0.91,
                "location": {"latitude": 28.6615, "longitude": 115.8972, "name": "绳金塔主街巡逻线"},
                "evidence": [{"kind": "image", "url": "https://example.test/robotdog/frame.jpg"}],
            }
        )
        device_event = observation["event"]
        created_event_ids.append(device_event["id"])
        assert device_event["meta"]["context"]["deviceType"] == "robot_dog"
        assert device_event["meta"]["context"]["behaviorScore"] == 92
        assert observation["risk"]["riskId"]

        task = security_linkage.create_drone_task(
            {
                "eventId": device_event["id"],
                "riskRecordId": observation["risk"]["riskId"],
                "marketId": "NC-NM-001",
                "zoneId": "NC-NM-001-Z1",
                "taskArea": "绳金塔主街巡逻线",
                "waypoints": [
                    {"latitude": 28.6615, "longitude": 115.8972},
                    {"latitude": 28.662, "longitude": 115.8978},
                ],
                "priority": "高",
                "broadcastText": "请保持安全距离，巡防力量正在到场。",
            }
        )
        created_task_ids.append(task["taskId"])
        assert task["status"] == "待执行"

        receipt = security_linkage.update_drone_task_receipt(
            task["taskId"],
            {
                "status": "执行中",
                "videoUrl": "https://example.test/drone/live.m3u8",
                "deviceStatus": "在线",
                "evidence": [{"kind": "video", "url": "https://example.test/drone/clip.mp4"}],
            },
        )
        assert receipt["status"] == "执行中"
        assert receipt["videoUrl"] == "https://example.test/drone/live.m3u8"

        overview = event_store.overview()
        device_types = {item["deviceType"] for item in overview["linkage"]["devices"]}
        assert {"camera", "robot_dog", "thermal", "drone"} <= device_types
        assert any(item["riskId"] == risk["riskId"] for item in overview["linkage"]["risks"])
        assert any(item["taskId"] == task["taskId"] for item in overview["linkage"]["droneTasks"])
        print(f"multi_market_linkage ok: {risk['riskId']} {task['taskId']}")
    finally:
        with DB_LOCK, SessionLocal() as session:
            if created_task_ids:
                session.execute(delete(DroneTask).where(DroneTask.taskId.in_(created_task_ids)))
            if created_risk_ids:
                session.execute(delete(RiskRecord).where(RiskRecord.riskId.in_(created_risk_ids)))
            session.execute(delete(SecurityDetection).where(SecurityDetection.eventKey == event_key))
            for event_id in created_event_ids:
                _remove_event(session, event_id)
            session.commit()


if __name__ == "__main__":
    main()
