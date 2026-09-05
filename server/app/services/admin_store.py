from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import (
    AdminAgent,
    AdminSkill,
    Device,
    EventAuditLog,
    Market,
    PatrolStaff,
    VoiceBroadcastSetting,
    Zone,
)


DEFAULT_AGENTS = [
    {
        "agentKey": "dispatch-agent",
        "name": "Dispatch Agent",
        "status": "active",
        "currentTask": "扫描未闭环风险并推荐处置力量",
        "latency": "实时",
        "config": {"maxConcurrent": 6, "autoAssign": True},
    },
    {
        "agentKey": "patrol-agent",
        "name": "Patrol Agent",
        "status": "active",
        "currentTask": "同步巡防组与商户端状态流转",
        "latency": "实时",
        "config": {"syncIntervalSeconds": 20},
    },
    {
        "agentKey": "audit-agent",
        "name": "Audit Agent",
        "status": "idle",
        "currentTask": "等待闭环事件生成复核记录",
        "latency": "待触发",
        "config": {"retainDays": 180},
    },
    {
        "agentKey": "vision-agent",
        "name": "Vision Agent",
        "status": "idle",
        "currentTask": "等待视频检测证据进行画面复核",
        "latency": "按需",
        "config": {"provider": "qwen-compatible"},
    },
]

DEFAULT_SKILLS = [
    {
        "skillKey": "risk-triage",
        "name": "风险研判 Skill",
        "status": "active",
        "trigger": "街霸滋扰、斗殴苗头自动置顶",
        "confidence": 92,
        "config": {"levels": ["高风险", "中风险"]},
    },
    {
        "skillKey": "dispatch-recommendation",
        "name": "派单建议 Skill",
        "status": "active",
        "trigger": "按网格、距离与警力负载推荐",
        "confidence": 88,
        "config": {"considerDistance": True, "considerLoad": True},
    },
    {
        "skillKey": "closure-audit",
        "name": "复盘归档 Skill",
        "status": "paused",
        "trigger": "闭环后生成审计摘要",
        "confidence": 76,
        "config": {"includeEvidence": True},
    },
    {
        "skillKey": "notification-delivery",
        "name": "通知触达 Skill",
        "status": "active",
        "trigger": "派单、到达、完成时同步相关人员",
        "confidence": 90,
        "config": {"channels": ["popup", "wechat"]},
    },
]

VOICE_BROADCAST_SETTING_KEY = "xiaoan-voice"
DEFAULT_VOICE_BROADCAST_SETTINGS: dict[str, Any] = {
    "enabled": True,
    "fightAlertEnabled": True,
    "dutyPlanEnabled": True,
    "volume": 80,
    "rate": 1.0,
    "pitch": 1.0,
    "repeatCount": 1,
    "lang": "zh-CN",
    "fightAlertTemplate": "小安提示：{location}检测到两人肢体冲突，请立即确认现场情况。",
    "dutyPlanTemplate": "小安提示：勤务预案已生成，请按预案完成岗前准备。",
}


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _voice_broadcast_settings_payload(config: dict[str, Any] | None) -> dict[str, Any]:
    values = {**DEFAULT_VOICE_BROADCAST_SETTINGS, **(config or {})}
    values["enabled"] = bool(values["enabled"])
    values["fightAlertEnabled"] = bool(values["fightAlertEnabled"])
    values["dutyPlanEnabled"] = bool(values["dutyPlanEnabled"])
    values["volume"] = max(0, min(100, int(values["volume"])))
    values["rate"] = max(0.5, min(2.0, float(values["rate"])))
    values["pitch"] = max(0, min(2.0, float(values["pitch"])))
    values["repeatCount"] = max(1, min(3, int(values["repeatCount"])))
    values["lang"] = "zh-CN" if values["lang"] != "zh-CN" else values["lang"]
    values["fightAlertTemplate"] = str(values["fightAlertTemplate"]).strip()[:280] or DEFAULT_VOICE_BROADCAST_SETTINGS["fightAlertTemplate"]
    values["dutyPlanTemplate"] = str(values["dutyPlanTemplate"]).strip()[:280] or DEFAULT_VOICE_BROADCAST_SETTINGS["dutyPlanTemplate"]
    return values


def _ensure_defaults() -> None:
    init_database()
    now = _now()
    with DB_LOCK, SessionLocal() as session:
        for item in DEFAULT_AGENTS:
            if session.get(AdminAgent, item["agentKey"]) is None:
                session.add(AdminAgent(
                    agentKey=item["agentKey"],
                    name=item["name"],
                    status=item["status"],
                    currentTask=item["currentTask"],
                    latency=item["latency"],
                    config_json=item["config"],
                    updatedAt=now,
                ))
        for item in DEFAULT_SKILLS:
            if session.get(AdminSkill, item["skillKey"]) is None:
                session.add(AdminSkill(
                    skillKey=item["skillKey"],
                    name=item["name"],
                    status=item["status"],
                    trigger=item["trigger"],
                    confidence=item["confidence"] / 100,
                    config_json=item["config"],
                    updatedAt=now,
                ))
        if session.get(VoiceBroadcastSetting, VOICE_BROADCAST_SETTING_KEY) is None:
            session.add(VoiceBroadcastSetting(
                settingKey=VOICE_BROADCAST_SETTING_KEY,
                config_json=DEFAULT_VOICE_BROADCAST_SETTINGS,
                updatedAt=now,
            ))
        session.commit()


def get_voice_broadcast_settings() -> dict[str, Any]:
    _ensure_defaults()
    with SessionLocal() as session:
        row = session.get(VoiceBroadcastSetting, VOICE_BROADCAST_SETTING_KEY)
        return _voice_broadcast_settings_payload(row.config_json if row else None)


def save_voice_broadcast_settings(config: dict[str, Any]) -> dict[str, Any]:
    _ensure_defaults()
    settings = _voice_broadcast_settings_payload(config)
    with DB_LOCK, SessionLocal() as session:
        row = session.get(VoiceBroadcastSetting, VOICE_BROADCAST_SETTING_KEY)
        if row is None:
            row = VoiceBroadcastSetting(settingKey=VOICE_BROADCAST_SETTING_KEY, config_json=settings, updatedAt=_now())
            session.add(row)
        else:
            row.config_json = settings
            row.updatedAt = _now()
        session.commit()
        return _voice_broadcast_settings_payload(row.config_json)


def ensure_market_defaults() -> None:
    from app.services.security_linkage import ensure_linkage_defaults

    ensure_linkage_defaults()


def _agent_payload(row: AdminAgent) -> dict[str, Any]:
    return {
        "agentKey": row.agentKey,
        "name": row.name,
        "status": row.status,
        "currentTask": row.currentTask,
        "latency": row.latency,
        "config": dict(row.config_json or {}),
        "updatedAt": row.updatedAt,
    }


def _skill_payload(row: AdminSkill) -> dict[str, Any]:
    return {
        "skillKey": row.skillKey,
        "name": row.name,
        "status": row.status,
        "trigger": row.trigger,
        "confidence": round(row.confidence * 100) if row.confidence <= 1 else round(row.confidence),
        "config": dict(row.config_json or {}),
        "updatedAt": row.updatedAt,
    }


def list_agents() -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(AdminAgent).order_by(AdminAgent.agentKey.asc())).all()
        return [_agent_payload(row) for row in rows]


def update_agent(
    agent_key: str,
    *,
    status: str | None = None,
    current_task: str | None = None,
    latency: str | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _ensure_defaults()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(AdminAgent, agent_key)
        if row is None:
            raise KeyError(agent_key)
        if status is not None:
            row.status = status
        if current_task is not None:
            row.currentTask = current_task
        if latency is not None:
            row.latency = latency
        if config is not None:
            row.config_json = config
        row.updatedAt = _now()
        session.commit()
        return _agent_payload(row)


def list_skills() -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(AdminSkill).order_by(AdminSkill.skillKey.asc())).all()
        return [_skill_payload(row) for row in rows]


def update_skill(
    skill_key: str,
    *,
    status: str | None = None,
    trigger: str | None = None,
    confidence: float | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _ensure_defaults()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(AdminSkill, skill_key)
        if row is None:
            raise KeyError(skill_key)
        if status is not None:
            row.status = status
        if trigger is not None:
            row.trigger = trigger
        if confidence is not None:
            row.confidence = max(0, min(100, confidence)) / 100 if confidence > 1 else max(0, confidence)
        if config is not None:
            row.config_json = config
        row.updatedAt = _now()
        session.commit()
        return _skill_payload(row)


def _market_payload(row: Market) -> dict[str, Any]:
    meta = dict(row.meta_json or {})
    return {
        "id": row.marketId,
        "name": row.name,
        "district": row.district or "",
        "address": row.address or "",
        "latitude": row.latitude,
        "longitude": row.longitude,
        "status": row.status,
        "tone": meta.get("tone", "safe"),
        "summary": meta.get("summary", ""),
        "updatedAt": row.updatedAt,
    }


def list_markets() -> list[dict[str, Any]]:
    ensure_market_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(Market).order_by(Market.name.asc())).all()
        return [_market_payload(row) for row in rows]


def upsert_market(
    market_id: str | None,
    name: str,
    district: str | None,
    address: str | None,
    latitude: float | None,
    longitude: float | None,
    status: str,
    tone: str,
    summary: str,
) -> dict[str, Any]:
    ensure_market_defaults()
    market_key = market_id or f"NC-NM-{uuid4().hex[:6].upper()}"
    now = _now()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(Market, market_key)
        if row is None:
            row = Market(
                marketId=market_key,
                name=name,
                district=district,
                address=address,
                latitude=latitude,
                longitude=longitude,
                status=status,
                meta_json={"tone": tone, "summary": summary},
                createdAt=now,
                updatedAt=now,
            )
            session.add(row)
            session.add(
                Zone(
                    zoneId=f"{market_key}-Z1",
                    marketId=market_key,
                    name=f"{name}核心巡查区",
                    latitude=latitude,
                    longitude=longitude,
                    boundary_json={"aliases": [name]},
                    createdAt=now,
                    updatedAt=now,
                )
            )
        else:
            row.name = name
            row.district = district
            row.address = address
            row.latitude = latitude
            row.longitude = longitude
            row.status = status
            row.meta_json = {"tone": tone, "summary": summary}
            row.updatedAt = now
        session.commit()
        return _market_payload(row)


def _device_payload(row: Device) -> dict[str, Any]:
    return {
        "deviceId": row.deviceId,
        "marketId": row.marketId,
        "zoneId": row.zoneId,
        "deviceType": row.deviceType,
        "name": row.name,
        "status": row.status,
        "capabilities": list(row.capabilities_json or []),
        "config": dict(row.config_json or {}),
        "lastSeenAt": row.lastSeenAt,
        "updatedAt": row.updatedAt,
    }


def list_devices() -> list[dict[str, Any]]:
    ensure_market_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(Device).order_by(Device.name.asc())).all()
        return [_device_payload(row) for row in rows]


def _staff_payload(row: PatrolStaff) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "role": row.role,
        "location": {
            "latitude": round(row.latitude, 6),
            "longitude": round(row.longitude, 6),
            "name": row.name,
            "source": "staff_gps" if row.updatedAt != "系统初始" else "staff_default",
        },
        "modes": list(row.modes or []),
        "online": row.online,
        "accuracy": row.accuracy,
        "updatedAt": row.updatedAt,
    }


def list_staff() -> list[dict[str, Any]]:
    from app.services import event_store

    event_store.init_db()
    with SessionLocal() as session:
        rows = session.scalars(select(PatrolStaff).order_by(PatrolStaff.name.asc())).all()
        return [_staff_payload(row) for row in rows]


def upsert_staff(
    staff_id: str,
    name: str,
    role: str,
    latitude: float,
    longitude: float,
    modes: list[str],
    online: bool,
    accuracy: float | None = None,
) -> dict[str, Any]:
    from app.services import event_store

    event_store.init_db()
    now = _now()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(PatrolStaff, staff_id)
        if row is None:
            row = PatrolStaff(
                id=staff_id,
                name=name,
                role=role,
                latitude=latitude,
                longitude=longitude,
                modes=modes,
                online=online,
                accuracy=accuracy,
                updatedAt=now,
            )
            session.add(row)
        else:
            row.name = name
            row.role = role
            row.latitude = latitude
            row.longitude = longitude
            row.modes = modes
            row.online = online
            row.accuracy = accuracy
            row.updatedAt = now
        session.commit()
        return _staff_payload(row)


def upsert_device(
    device_id: str,
    market_id: str | None,
    zone_id: str | None,
    device_type: str,
    name: str,
    status: str,
    capabilities: list[str],
    config: dict[str, Any],
) -> dict[str, Any]:
    ensure_market_defaults()
    now = _now()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(Device, device_id)
        if row is None:
            row = Device(
                deviceId=device_id,
                marketId=market_id,
                zoneId=zone_id,
                deviceType=device_type,
                name=name,
                status=status,
                capabilities_json=capabilities,
                config_json=config,
                lastSeenAt=now if status in {"在线", "模拟在线"} else None,
                createdAt=now,
                updatedAt=now,
            )
            session.add(row)
        else:
            row.marketId = market_id
            row.zoneId = zone_id
            row.deviceType = device_type
            row.name = name
            row.status = status
            row.capabilities_json = capabilities
            row.config_json = config
            row.lastSeenAt = now if status in {"在线", "模拟在线"} else row.lastSeenAt
            row.updatedAt = now
        session.commit()
        return _device_payload(row)


def list_audit_logs(event_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    init_database()
    with SessionLocal() as session:
        statement = select(EventAuditLog).order_by(EventAuditLog.createdAt.desc(), EventAuditLog.id.desc())
        if event_id:
            statement = statement.where(EventAuditLog.eventId == event_id)
        rows = session.scalars(statement).all()
        return [
            {
                "id": row.id,
                "eventId": row.eventId,
                "action": row.action,
                "operator": row.operator,
                "status": row.status,
                "owner": row.owner,
                "note": row.note or "",
                "time": row.time,
                "createdAt": row.createdAt,
            }
            for row in rows[:limit]
        ]


def overview() -> dict[str, Any]:
    from app.services import event_store, security_ops
    from app.services.security_linkage import overview as linkage_overview

    _ensure_defaults()
    events = event_store.list_events()
    staff = list_staff()
    markets = list_markets()
    devices = list_devices()
    roles = security_ops.list_roles()
    dispatch_rules = security_ops.list_dispatch_rules()
    feeds = security_ops.list_data_feeds()
    notifications = security_ops.list_notifications()
    duty_plans = security_ops.list_duty_plans()
    return {
        "counts": {
            "events": len(events),
            "openEvents": len([item for item in events if item["status"] != "已完成"]),
            "completedEvents": len([item for item in events if item["status"] == "已完成"]),
            "staff": len(staff),
            "onlineStaff": len([item for item in staff if item.get("online")]),
            "markets": len(markets),
            "devices": len(devices),
            "onlineDevices": len([item for item in devices if item["status"] in {"在线", "模拟在线"}]),
            "roles": len(roles),
            "dispatchRules": len(dispatch_rules),
            "feeds": len(feeds),
            "notifications": len(notifications),
            "dutyPlans": len(duty_plans),
        },
        "events": events[:80],
        "staff": staff,
        "markets": markets,
        "devices": devices,
        "roles": roles,
        "dispatchRules": dispatch_rules,
        "feeds": feeds,
        "notifications": notifications[:80],
        "dutyPlans": duty_plans[:20],
        "auditLogs": list_audit_logs(limit=100),
        "agents": list_agents(),
        "skills": list_skills(),
        "linkage": linkage_overview(),
    }
