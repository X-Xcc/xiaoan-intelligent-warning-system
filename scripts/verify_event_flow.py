from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from sqlalchemy import delete

from app.services import event_store
from app.services.database import DB_LOCK, SessionLocal
from app.services.models import EventAuditLog, SafetyEvent


def main() -> None:
    created = event_store.create_help_event("主街烧烤区", "指挥中心联调测试夜市事件")
    dispatched = event_store.update_event(created["id"], "已派单", "李敏", operator="指挥中心")
    accepted = event_store.update_event(created["id"], "已接收", "李敏")
    closed = event_store.update_event(created["id"], "已完成", "李敏", "联调闭环完成。", "指挥中心")

    if dispatched is None or accepted is None or closed is None:
        raise RuntimeError("event flow returned an empty event")

    assert created["status"] == "已派单"
    assert dispatched["owner"] == "李敏"
    assert dispatched["timeline"][-1]["operator"] == "指挥中心"
    assert accepted["timeline"][-1]["operator"] == "巡防人员端"
    assert closed["status"] == "已完成"
    assert closed["result"] == "联调闭环完成。"
    assert len(closed["timeline"]) >= 4

    with DB_LOCK, SessionLocal() as session:
        session.execute(delete(EventAuditLog).where(EventAuditLog.eventId == closed["id"]))
        session.execute(delete(SafetyEvent).where(SafetyEvent.id == closed["id"]))
        session.commit()

    print(f"event_flow ok: {closed['id']} {closed['status']} timeline={len(closed['timeline'])}")


if __name__ == "__main__":
    main()
