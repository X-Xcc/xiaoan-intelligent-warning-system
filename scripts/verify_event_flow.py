from __future__ import annotations

import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from verify_env import configure_verify_environment

configure_verify_environment()

from sqlalchemy import delete, text

from app.services import event_store
from app.services.database import DB_LOCK, SessionLocal
from app.services.models import EventAuditLog, NotificationRecord, SafetyEvent


def main() -> None:
    created = event_store.create_help_event("主街烧烤区", "指挥中心测试夜市事件", 28.6821, 115.8588)
    dispatched = event_store.assign_event(created["id"], "李敏", operator="指挥中心")
    accepted = event_store.update_event(created["id"], "已接收", "李敏")
    closed = event_store.update_event(created["id"], "已完成", "李敏", "测试处理完成。", "指挥中心")

    if dispatched is None or accepted is None or closed is None:
        raise RuntimeError("event flow returned an empty event")

    assert created["status"] == "已提交"
    assert dispatched["owner"] == "李敏"
    assert dispatched["status"] == "已派单"
    assert dispatched["timeline"][-1]["operator"] == "指挥中心"
    assert accepted["timeline"][-1]["operator"] == "巡防人员端"
    assert closed["status"] == "已完成"
    assert closed["result"] == "测试处理完成。"
    assert len(closed["timeline"]) >= 4

    with DB_LOCK, SessionLocal() as session:
        session.execute(text("DELETE FROM alarm_pushes WHERE event_id = :event_id"), {"event_id": closed["id"]})
        session.execute(delete(NotificationRecord).where(NotificationRecord.eventId == closed["id"]))
        session.execute(delete(EventAuditLog).where(EventAuditLog.eventId == closed["id"]))
        session.execute(delete(SafetyEvent).where(SafetyEvent.id == closed["id"]))
        session.commit()

    print(f"event_flow ok: {closed['id']} {closed['status']} timeline={len(closed['timeline'])}")


if __name__ == "__main__":
    main()
