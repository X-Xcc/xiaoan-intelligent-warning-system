from __future__ import annotations

import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import delete, text

ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from verify_env import configure_verify_environment

configure_verify_environment()

from app.services import event_store
from app.services.database import DB_LOCK, SessionLocal
from app.services.models import EventAuditLog, NotificationRecord, SafetyEvent


def main() -> None:
    created = event_store.create_help_event(
        "主街烧烤区",
        "指挥中心报警推送测试",
        28.6821,
        115.8588,
        "13800000000",
    )

    alarm_pushes = event_store.list_alarm_pushes()
    matching_pushes = [item for item in alarm_pushes if item["eventId"] == created["id"]]
    assert matching_pushes, "报警创建后应自动生成指挥中心推送记录"

    push = matching_pushes[0]
    assert push["channel"] == "command_center"
    assert push["status"] == "待确认"
    assert push["route"]["modeLabel"] in {"步行", "骑行", "驾车"}
    assert push["alarmLocation"]["name"] == "主街烧烤区"

    overview = event_store.overview()
    assert any(item["eventId"] == created["id"] for item in overview["alarm_pushes"])

    assert created["meta"]["route"]["destination"]["name"] == "主街烧烤区"
    assert created["meta"]["assignment"]["staffName"]

    recommended_staff = created["meta"]["assignment"]["staffName"]
    staff_tasks_before_assign = event_store.list_staff_tasks(recommended_staff)
    assert all(item["id"] != created["id"] for item in staff_tasks_before_assign), "指挥中心派单前工作人员端不应收到工单"

    assigned = event_store.assign_event(created["id"], recommended_staff, operator="指挥中心")
    assert assigned is not None
    staff_tasks_after_assign = event_store.list_staff_tasks(recommended_staff)
    matching_tasks = [item for item in staff_tasks_after_assign if item["id"] == created["id"]]
    assert matching_tasks, "指挥中心派单后工作人员端应收到工单"
    task = matching_tasks[0]
    assert task["meta"]["alarmLocation"]["name"] == "主街烧烤区"
    assert task["meta"]["route"]["modeLabel"] in {"步行", "骑行", "驾车"}

    with DB_LOCK, SessionLocal() as session:
        session.execute(text("DELETE FROM alarm_pushes WHERE event_id = :event_id"), {"event_id": created["id"]})
        session.execute(delete(NotificationRecord).where(NotificationRecord.eventId == created["id"]))
        session.execute(delete(EventAuditLog).where(EventAuditLog.eventId == created["id"]))
        session.execute(delete(SafetyEvent).where(SafetyEvent.id == created["id"]))
        session.commit()

    print(f"alarm_push_flow ok: {created['id']} {push['status']} {push['route']['modeLabel']}")


if __name__ == "__main__":
    main()
