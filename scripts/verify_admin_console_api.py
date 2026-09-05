from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import event

ROOT = Path(__file__).resolve().parents[1]
VERIFY_DIR = ROOT / ".codex" / "admin-console-verify"
VERIFY_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = VERIFY_DIR / "admin-console.db"
if DB_PATH.exists():
    DB_PATH.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"
os.environ["APP_ENV"] = "development"
sys.path.insert(0, str(ROOT / "server"))

from app.services import admin_store, event_store, security_linkage  # noqa: E402
from app.services.database import DB_LOCK, SessionLocal, engine, init_database  # noqa: E402
from app.services.models import Device, Market, Zone  # noqa: E402


@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(connection, _record) -> None:
    connection.execute("PRAGMA foreign_keys = ON")


def main() -> None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        session.add(Market(
            marketId="NC-NM-CUSTOM",
            name="自定义夜市",
            district="西湖区",
            address="测试路 1 号",
            latitude=28.68,
            longitude=115.89,
            status="运行中",
            meta_json={},
            createdAt="2026-09-03T21:10:00",
            updatedAt="2026-09-03T21:10:00",
        ))
        session.commit()
    security_linkage.ensure_linkage_defaults()
    with SessionLocal() as session:
        assert session.get(Market, "NC-NM-001") is not None

    overview = admin_store.overview()
    assert overview["counts"]["events"] >= 0
    assert overview["agents"]
    assert overview["skills"]
    assert "auditLogs" in overview

    voice_settings = admin_store.get_voice_broadcast_settings()
    assert voice_settings["enabled"] is True
    assert voice_settings["fightAlertEnabled"] is True
    saved_voice_settings = admin_store.save_voice_broadcast_settings(
        {
            "enabled": True,
            "fightAlertEnabled": True,
            "dutyPlanEnabled": False,
            "volume": 72,
            "rate": 1.15,
            "pitch": 1,
            "repeatCount": 2,
            "fightAlertTemplate": "小安提示：{location}检测到两人肢体冲突，请立即确认现场。",
            "dutyPlanTemplate": "小安提示：勤务预案已生成。",
        }
    )
    assert saved_voice_settings["volume"] == 72
    assert saved_voice_settings["repeatCount"] == 2
    assert admin_store.get_voice_broadcast_settings()["dutyPlanEnabled"] is False

    agent = admin_store.update_agent(
        "dispatch-agent",
        status="paused",
        current_task="人工接管派单",
        config={"maxConcurrent": 4},
    )
    assert agent["status"] == "paused"
    assert agent["config"]["maxConcurrent"] == 4
    event_overview = event_store.overview()
    overview_agent = next(item for item in event_overview["ai_copilot"]["agents"] if item["name"] == "Dispatch Agent")
    assert overview_agent["status"] == "paused"

    skill = admin_store.update_skill(
        "closure-audit",
        status="active",
        confidence=0.97,
        trigger="事件完成后自动生成审计摘要",
    )
    assert skill["status"] == "active"
    assert skill["confidence"] == 97

    market = admin_store.upsert_market(
        "NC-NM-TEST",
        "测试夜市",
        "东湖区",
        "测试街 1 号",
        28.69,
        115.88,
        "运行中",
        "safe",
        "后台创建的夜市",
    )
    assert market["id"] == "NC-NM-TEST"
    assert any(item["id"] == "NC-NM-TEST" for item in admin_store.list_markets())

    device = admin_store.upsert_device(
        "camera-test-001",
        "NC-NM-TEST",
        "NC-NM-TEST-Z1",
        "camera",
        "测试摄像头",
        "在线",
        ["video", "snapshot"],
        {"stream": "http://127.0.0.1/test"},
    )
    assert device["deviceId"] == "camera-test-001"
    assert any(item["deviceId"] == "camera-test-001" for item in admin_store.list_devices())

    staff = admin_store.upsert_staff(
        "staff-test-001",
        "测试巡防员",
        "夜市巡防组",
        28.6901,
        115.8802,
        ["walk", "bike"],
        True,
        8,
    )
    assert staff["id"] == "staff-test-001"
    assert staff["online"] is True
    assert any(item["id"] == "staff-test-001" for item in admin_store.list_staff())

    with DB_LOCK, SessionLocal() as session:
        session.query(Device).delete()
        session.query(Zone).delete()
        session.query(Market).delete()
        session.commit()
    assert event_store.list_night_markets() == []
    admin_store.ensure_market_defaults()
    assert admin_store.list_markets()

    event = event_store.create_help_event("主街烧烤区", "管理台闭环测试", 28.6821, 115.8588)
    assigned = event_store.assign_event(event["id"], "staff-test-001", operator="管理台")
    accepted = event_store.update_event(event["id"], "已接收", "王队", operator="管理台")
    arrived = event_store.update_event(event["id"], "已到达", "王队", operator="管理台")
    processing = event_store.update_event(event["id"], "处理中", "王队", operator="管理台")
    completed = event_store.update_event(event["id"], "已完成", "王队", "已完成现场处置", "管理台")
    assert assigned and assigned["status"] == "已派单"
    assert (assigned.get("meta") or {}).get("assignment", {}).get("staffId") == "staff-test-001"
    assert accepted and accepted["status"] == "已接收"
    assert arrived and arrived["status"] == "已到达"
    assert processing and processing["status"] == "处理中"
    assert completed and completed["status"] == "已完成"
    assert len(admin_store.list_audit_logs(event["id"])) >= 5

    print("admin_console_api ok")


if __name__ == "__main__":
    main()
