from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any


DB_PATH = Path(__file__).resolve().parents[2] / "data" / "jiangtan.db"
_LOCK = Lock()

STATUS_FLOW = ["已提交", "已派单", "已接收", "已到达", "处理中", "已完成"]

SEED_EVENTS = [
    {
        "id": "JT-260802-001",
        "kind": "report",
        "title": "救生圈箱门松动",
        "bay": "万紫滩",
        "level": "中风险",
        "source": "游客反馈",
        "status": "已接收",
        "owner": "李敏",
        "distance": "1.1km",
        "time": "15:08",
        "updatedAt": "15:18",
        "description": "救生圈箱门无法完全闭合，可能影响取用。",
        "result": None,
        "anonymous": False,
    },
    {
        "id": "JT-260802-002",
        "kind": "help",
        "title": "儿童靠近水边",
        "bay": "摩天湾",
        "level": "高风险",
        "source": "现场协同求助",
        "status": "已到达",
        "owner": "王队",
        "distance": "420m",
        "time": "15:22",
        "updatedAt": "15:26",
        "description": "亲水平台附近儿童独自靠近水边。",
        "result": None,
        "anonymous": False,
    },
    {
        "id": "JT-260802-003",
        "kind": "lost",
        "title": "黑色双肩包遗失",
        "bay": "龙沙湾",
        "level": "低风险",
        "source": "失物招领",
        "status": "已完成",
        "owner": "服务台",
        "distance": "服务点",
        "time": "14:48",
        "updatedAt": "15:02",
        "description": "游客已在服务台取回。",
        "result": "已核验失主信息并完成领取登记。",
        "anonymous": False,
    },
]


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _now_label() -> str:
    return datetime.now().strftime("%H:%M")


def _new_id(prefix: str = "JT") -> str:
    return f"{prefix}-{datetime.now().strftime('%y%m%d-%H%M%S')}"


def _row_to_event(row: sqlite3.Row) -> dict[str, Any]:
    event = dict(row)
    event["anonymous"] = bool(event["anonymous"])
    event["meta"] = json.loads(event["meta"] or "{}")
    return event


def init_db() -> None:
    with _LOCK, _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS safety_events (
              id TEXT PRIMARY KEY,
              kind TEXT NOT NULL,
              title TEXT NOT NULL,
              bay TEXT NOT NULL,
              level TEXT NOT NULL,
              source TEXT NOT NULL,
              status TEXT NOT NULL,
              owner TEXT NOT NULL,
              distance TEXT NOT NULL,
              time TEXT NOT NULL,
              updatedAt TEXT NOT NULL,
              description TEXT NOT NULL,
              result TEXT,
              anonymous INTEGER NOT NULL DEFAULT 0,
              meta TEXT NOT NULL DEFAULT '{}',
              createdAt TEXT NOT NULL,
              updatedAtIso TEXT NOT NULL
            )
            """
        )
        count = conn.execute("SELECT COUNT(*) AS count FROM safety_events").fetchone()["count"]
        if count == 0:
            for item in SEED_EVENTS:
                insert_event(conn, item)


def insert_event(conn: sqlite3.Connection, event: dict[str, Any]) -> dict[str, Any]:
    now_iso = datetime.now().isoformat(timespec="seconds")
    payload = {
        **event,
        "meta": json.dumps(event.get("meta", {}), ensure_ascii=False),
        "createdAt": event.get("createdAt", now_iso),
        "updatedAtIso": event.get("updatedAtIso", now_iso),
    }
    conn.execute(
        """
        INSERT INTO safety_events
        (id, kind, title, bay, level, source, status, owner, distance, time, updatedAt, description, result, anonymous, meta, createdAt, updatedAtIso)
        VALUES
        (:id, :kind, :title, :bay, :level, :source, :status, :owner, :distance, :time, :updatedAt, :description, :result, :anonymous, :meta, :createdAt, :updatedAtIso)
        """,
        payload,
    )
    return payload


def list_events(kind: str | None = None) -> list[dict[str, Any]]:
    init_db()
    with _connect() as conn:
        if kind:
            rows = conn.execute(
                "SELECT * FROM safety_events WHERE kind = ? ORDER BY createdAt DESC",
                (kind,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM safety_events ORDER BY createdAt DESC").fetchall()
    return [_row_to_event(row) for row in rows]


def get_event(event_id: str) -> dict[str, Any] | None:
    init_db()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM safety_events WHERE id = ?", (event_id,)).fetchone()
    return _row_to_event(row) if row else None


def create_help_event(bay: str, description: str | None = None, latitude: float | None = None, longitude: float | None = None, contact: str | None = None) -> dict[str, Any]:
    init_db()
    label = _now_label()
    event = {
        "id": _new_id("HELP"),
        "kind": "help",
        "title": "游客现场协同求助",
        "bay": bay,
        "level": "高风险",
        "source": "现场协同求助",
        "status": "已派单",
        "owner": "最近巡防员",
        "distance": "待定位",
        "time": label,
        "updatedAt": label,
        "description": description or "游客已同步当前位置，请工作人员尽快联系并前往核实。",
        "result": None,
        "anonymous": False,
        "meta": {"latitude": latitude, "longitude": longitude, "contact": contact},
    }
    with _LOCK, _connect() as conn:
        insert_event(conn, event)
    return get_event(event["id"]) or event


def create_report_event(category: str, bay: str, description: str, anonymous: bool = False, contact: str | None = None, photo_count: int = 0) -> dict[str, Any]:
    init_db()
    label = _now_label()
    high_risk = category in {"违规野泳", "儿童独自涉水"}
    event = {
        "id": _new_id("RPT"),
        "kind": "report",
        "title": category,
        "bay": bay,
        "level": "高风险" if high_risk else "中风险",
        "source": "匿名反馈" if anonymous else "游客反馈",
        "status": "已提交",
        "owner": "待分配",
        "distance": "待核实",
        "time": label,
        "updatedAt": label,
        "description": description or f"游客提交了现场问题，随附 {photo_count} 张照片，请工作人员核实。",
        "result": None,
        "anonymous": anonymous,
        "meta": {"contact": None if anonymous else contact, "photoCount": photo_count},
    }
    with _LOCK, _connect() as conn:
        insert_event(conn, event)
    return get_event(event["id"]) or event


def create_lost_event(item_name: str, bay: str = "凤凰湾", contact: str | None = None) -> dict[str, Any]:
    init_db()
    label = _now_label()
    event = {
        "id": _new_id("LOST"),
        "kind": "lost",
        "title": f"{item_name}认领",
        "bay": bay,
        "level": "低风险",
        "source": "失物招领",
        "status": "已提交",
        "owner": "服务台",
        "distance": "岗亭",
        "time": label,
        "updatedAt": label,
        "description": "游客提交失物认领登记，等待服务台核验。",
        "result": None,
        "anonymous": False,
        "meta": {"contact": contact},
    }
    with _LOCK, _connect() as conn:
        insert_event(conn, event)
    return get_event(event["id"]) or event


def update_event(event_id: str, status: str, owner: str | None = None, result: str | None = None) -> dict[str, Any] | None:
    init_db()
    if status not in STATUS_FLOW:
        raise ValueError(f"Unsupported status: {status}")

    label = _now_label()
    with _LOCK, _connect() as conn:
        current = conn.execute("SELECT * FROM safety_events WHERE id = ?", (event_id,)).fetchone()
        if not current:
            return None
        conn.execute(
            """
            UPDATE safety_events
            SET status = ?, owner = ?, result = ?, updatedAt = ?, updatedAtIso = ?
            WHERE id = ?
            """,
            (
                status,
                owner or current["owner"],
                result if result is not None else current["result"],
                label,
                datetime.now().isoformat(timespec="seconds"),
                event_id,
            ),
        )
    return get_event(event_id)


def supplement_event(event_id: str, text: str) -> dict[str, Any] | None:
    init_db()
    label = _now_label()
    with _LOCK, _connect() as conn:
        current = conn.execute("SELECT * FROM safety_events WHERE id = ?", (event_id,)).fetchone()
        if not current:
            return None
        description = f"{current['description']} 补充：{text}"
        conn.execute(
            """
            UPDATE safety_events
            SET description = ?, updatedAt = ?, updatedAtIso = ?
            WHERE id = ?
            """,
            (description, label, datetime.now().isoformat(timespec="seconds"), event_id),
        )
    return get_event(event_id)


def overview() -> dict[str, Any]:
    events = list_events()
    open_events = [event for event in events if event["status"] != "已完成"]
    urgent = [event for event in events if event["level"] == "高风险"]
    closed = [event for event in events if event["status"] == "已完成"]
    return {
        "project": "江滩智防",
        "subtitle": "两滩七湾安全指挥舱",
        "stats": {
            "today_events": len(events),
            "pending_orders": len(open_events),
            "online_staff": 12,
            "avg_response_minutes": 2.6,
            "completion_rate": round((len(closed) / len(events)) * 100) if events else 0,
            "urgent_events": len(urgent),
        },
        "events": events,
        "patrol_staff": ["王队", "李敏", "陈安"],
    }
