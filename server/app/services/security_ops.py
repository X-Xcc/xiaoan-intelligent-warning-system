from __future__ import annotations

import hashlib
import base64
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, func

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import (
    AnalysisReport,
    EventAuditLog,
    ContainmentPlan,
    DataFeed,
    DispatchRule,
    DutyPlan,
    IdentityProfile,
    NotificationRecord,
    TargetLock,
    TrackRecord,
    UserRole,
    VoiceIntake,
    WechatUser,
)


DEFAULT_DISPATCH_RULES: list[dict[str, Any]] = [
    {
        "ruleKey": "rule-high-risk-fight",
        "name": "高风险斗殴优先快反",
        "triggerType": "keyword",
        "conditions": {"keywords": ["打架", "斗殴", "滋事", "冲突"]},
        "action": {"autoAssign": True, "channel": ["popup", "wechat", "sms"], "staff": ["wang", "li"]},
        "targetRole": "指挥员",
        "enabled": True,
    },
    {
        "ruleKey": "rule-gathering",
        "name": "异常聚集联动巡防",
        "triggerType": "keyword",
        "conditions": {"keywords": ["聚集", "拥堵", "围观"]},
        "action": {"autoAssign": True, "channel": ["popup", "wechat"], "staff": ["li", "chen"]},
        "targetRole": "巡防",
        "enabled": True,
    },
    {
        "ruleKey": "rule-lost-found",
        "name": "失物线索转巡查",
        "triggerType": "keyword",
        "conditions": {"keywords": ["钱包", "手机", "遗失", "失物", "找不到"]},
        "action": {"autoAssign": False, "channel": ["popup"], "staff": ["chen"]},
        "targetRole": "巡防",
        "enabled": True,
    },
]

DEFAULT_DATA_FEEDS: list[dict[str, Any]] = [
    {
        "sourceKey": "camera-realtime",
        "kind": "camera",
        "name": "真实摄像头接入",
        "endpoint": "",
        "status": "待接入",
        "payload": {"hint": "接入 RTSP / HTTP snapshot / go2rtc"},
    },
    {
        "sourceKey": "crowd-flow",
        "kind": "crowd",
        "name": "真实客流",
        "endpoint": "",
        "status": "待接入",
        "payload": {"hint": "第三方客流或热力接口"},
    },
    {
        "sourceKey": "police-events",
        "kind": "police",
        "name": "真实警情",
        "endpoint": "",
        "status": "待接入",
        "payload": {"hint": "接入历史警情或警务接口"},
    },
    {
        "sourceKey": "activity-info",
        "kind": "activity",
        "name": "活动信息",
        "endpoint": "",
        "status": "待接入",
        "payload": {"hint": "活动日程与演出排期"},
    },
    {
        "sourceKey": "map-service",
        "kind": "map",
        "name": "第三方地图数据",
        "endpoint": "",
        "status": "待接入",
        "payload": {"hint": "地理编码、导航与热区分析"},
    },
]

ROLE_DEFAULTS: dict[str, dict[str, Any]] = {
    "群众": {"permissions": ["help", "report", "view_progress"], "displayName": "群众"},
    "商户": {"permissions": ["help", "report", "view_progress", "notification_ack"], "displayName": "商户"},
    "巡防": {"permissions": ["dispatch", "review", "track", "view_progress"], "displayName": "巡防"},
    "指挥员": {"permissions": ["dispatch", "review", "track", "plan", "notify", "analyze"], "displayName": "指挥员"},
    "管理员": {"permissions": ["admin", "dispatch", "review", "track", "plan", "notify", "analyze", "configure"], "displayName": "管理员"},
}


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _uuid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _slug(value: str) -> str:
    text = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "-", value).strip("-")
    return text[:24] if text else "item"


def _ensure_defaults() -> None:
    init_database()
    now = _now_iso()
    with DB_LOCK, SessionLocal() as session:
        for rule in DEFAULT_DISPATCH_RULES:
            current = session.get(DispatchRule, rule["ruleKey"])
            if not current:
                session.add(
                    DispatchRule(
                        ruleKey=rule["ruleKey"],
                        name=rule["name"],
                        triggerType=rule["triggerType"],
                        conditions_json=rule["conditions"],
                        action_json=rule["action"],
                        targetRole=rule["targetRole"],
                        enabled=bool(rule["enabled"]),
                        createdAt=now,
                        updatedAt=now,
                    )
                )
        for feed in DEFAULT_DATA_FEEDS:
            current = session.get(DataFeed, feed["sourceKey"])
            if not current:
                session.add(
                    DataFeed(
                        sourceKey=feed["sourceKey"],
                        kind=feed["kind"],
                        name=feed["name"],
                        endpoint=feed.get("endpoint"),
                        enabled=True,
                        status=feed["status"],
                        lastSyncAt=None,
                        payload_json=feed["payload"],
                        createdAt=now,
                        updatedAt=now,
                    )
                )
        session.commit()


def _role_payload(row: UserRole) -> dict[str, Any]:
    return {
        "openid": row.openid,
        "role": row.role,
        "displayName": row.display_name or row.role,
        "permissions": list(row.permissions_json or []),
        "updatedAt": row.updatedAt,
    }


def list_roles() -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(UserRole).order_by(UserRole.updatedAt.desc())).all()
        return [_role_payload(row) for row in rows]


def upsert_role(openid: str, role: str, display_name: str | None = None, permissions: list[str] | None = None) -> dict[str, Any]:
    _ensure_defaults()
    now = _now_iso()
    with DB_LOCK, SessionLocal() as session:
        user_row = session.get(WechatUser, openid)
        if not user_row:
            session.add(
                WechatUser(
                    openid=openid,
                    unionid=None,
                    session_key=None,
                    token=uuid.uuid4().hex,
                    last_login_at=now,
                    created_at=now,
                )
            )
        row = session.get(UserRole, openid)
        if not row:
            row = UserRole(
                openid=openid,
                role=role,
                display_name=display_name or ROLE_DEFAULTS.get(role, {}).get("displayName", role),
                permissions_json=list(permissions or ROLE_DEFAULTS.get(role, {}).get("permissions", [])),
                createdAt=now,
                updatedAt=now,
            )
            session.add(row)
        else:
            row.role = role
            row.display_name = display_name or row.display_name or ROLE_DEFAULTS.get(role, {}).get("displayName", role)
            row.permissions_json = list(permissions or ROLE_DEFAULTS.get(role, {}).get("permissions", []))
            row.updatedAt = now
        session.commit()
        return _role_payload(row)


def _event_store():
    from app.services import event_store

    return event_store


def _parse_time_label(value: str | None) -> str:
    if not value:
        return "20:00"
    value = value.strip()
    if re.fullmatch(r"\d{1,2}:\d{2}", value):
        hour = max(0, min(23, int(value.split(":", 1)[0])))
        return f"{hour:02d}:{value.split(':', 1)[1]}"
    return "20:00"


def _event_time(event: dict[str, Any]) -> datetime:
    for key in ("createdAt", "updatedAt", "time"):
        raw = event.get(key)
        if not raw:
            continue
        try:
            return datetime.fromisoformat(str(raw))
        except ValueError:
            continue
    return datetime.now()


def _hotspot_rows(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts = Counter(event["bay"] for event in events)
    by_bay: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        by_bay[event["bay"]].append(event)

    rows: list[dict[str, Any]] = []
    for bay, count in counts.most_common():
        items = by_bay[bay]
        urgent = sum(1 for item in items if item.get("level") == "高风险")
        latest = max(items, key=_event_time)
        rows.append(
            {
                "bay": bay,
                "count": count,
                "urgentCount": urgent,
                "latestEventId": latest["id"],
                "latestAt": latest.get("updatedAt") or latest.get("createdAt") or latest.get("time"),
                "source": latest.get("source"),
            }
        )
    return rows


def generate_duty_plans(plan_date: str | None = None) -> list[dict[str, Any]]:
    _ensure_defaults()
    event_store = _event_store()
    now = _now_iso()
    day = plan_date or datetime.now().date().isoformat()
    events = event_store.list_events()
    staff = event_store.list_staff()
    night_markets = event_store.list_night_markets()
    hotspots = _hotspot_rows(events)
    if not hotspots:
        hotspots = [{"bay": item["name"], "count": 0, "urgentCount": 0, "latestEventId": None, "latestAt": now, "source": item["source"]} for item in night_markets[:4]]

    time_slots = [
        ("18:00-20:00", "晚高峰布防"),
        ("20:00-22:30", "夜宵高峰布防"),
        ("22:30-02:00", "收尾巡控"),
    ]
    plans: list[dict[str, Any]] = []
    with DB_LOCK, SessionLocal() as session:
        for index, (slot, title) in enumerate(time_slots):
            selected_hotspots = hotspots[index:index + 3] or hotspots[:3]
            selected_staff = [
                {
                    "staffId": item["id"],
                    "staffName": item["name"],
                    "role": item["role"],
                    "task": "重点夜市布防",
                }
                for item in staff[:3]
            ]
            summary = (
                f"{day} {slot} 重点覆盖 {', '.join(item['bay'] for item in selected_hotspots)}，"
                f"优先调度 {', '.join(item['staffName'] for item in selected_staff)}。"
            )
            plan_key = f"duty-{day}-{index + 1}"
            row = session.get(DutyPlan, plan_key)
            if not row:
                row = DutyPlan(
                    planKey=plan_key,
                    planDate=day,
                    timeSlot=slot,
                    area="夜市重点区域",
                    staff_json=selected_staff,
                    hotspots_json=selected_hotspots,
                    summary=summary,
                    createdAt=now,
                    updatedAt=now,
                )
                session.add(row)
            else:
                row.planDate = day
                row.timeSlot = slot
                row.area = "夜市重点区域"
                row.staff_json = selected_staff
                row.hotspots_json = selected_hotspots
                row.summary = summary
                row.updatedAt = now
            plans.append(_duty_plan_payload(row))
        session.commit()
    return plans


def _duty_plan_payload(row: DutyPlan) -> dict[str, Any]:
    return {
        "planKey": row.planKey,
        "planDate": row.planDate,
        "timeSlot": row.timeSlot,
        "area": row.area,
        "staff": list(row.staff_json or []),
        "hotspots": list(row.hotspots_json or []),
        "summary": row.summary,
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
    }


def list_duty_plans(limit: int = 20) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(DutyPlan).order_by(DutyPlan.planDate.desc(), DutyPlan.updatedAt.desc())).all()
        return [_duty_plan_payload(row) for row in rows[:limit]]


def list_dispatch_rules(limit: int = 50) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(DispatchRule).order_by(DispatchRule.updatedAt.desc())).all()
        return [
            {
                "ruleKey": row.ruleKey,
                "name": row.name,
                "triggerType": row.triggerType,
                "conditions": dict(row.conditions_json or {}),
                "action": dict(row.action_json or {}),
                "targetRole": row.targetRole,
                "enabled": row.enabled,
                "createdAt": row.createdAt,
                "updatedAt": row.updatedAt,
            }
            for row in rows[:limit]
        ]


def save_dispatch_rule(
    name: str,
    trigger_type: str,
    conditions: dict[str, Any],
    action: dict[str, Any],
    target_role: str,
    enabled: bool = True,
    rule_key: str | None = None,
) -> dict[str, Any]:
    _ensure_defaults()
    now = _now_iso()
    rule_id = rule_key or f"rule-{_slug(name)}"
    with DB_LOCK, SessionLocal() as session:
        row = session.get(DispatchRule, rule_id)
        if not row:
            row = DispatchRule(
                ruleKey=rule_id,
                name=name,
                triggerType=trigger_type,
                conditions_json=conditions,
                action_json=action,
                targetRole=target_role,
                enabled=enabled,
                createdAt=now,
                updatedAt=now,
            )
            session.add(row)
        else:
            row.name = name
            row.triggerType = trigger_type
            row.conditions_json = conditions
            row.action_json = action
            row.targetRole = target_role
            row.enabled = enabled
            row.updatedAt = now
        session.commit()
        return {
            "ruleKey": row.ruleKey,
            "name": row.name,
            "triggerType": row.triggerType,
            "conditions": dict(row.conditions_json or {}),
            "action": dict(row.action_json or {}),
            "targetRole": row.targetRole,
            "enabled": row.enabled,
            "createdAt": row.createdAt,
            "updatedAt": row.updatedAt,
        }


def _intent_from_text(text: str) -> tuple[str, float, str]:
    lowered = text.strip()
    checks = [
        ("fight", ["打架", "斗殴", "冲突", "滋事"], "现场疑似斗殴或冲突"),
        ("gather", ["聚集", "拥堵", "围观"], "现场疑似异常聚集"),
        ("fall", ["跌倒", "摔倒", "晕倒"], "现场疑似有人跌倒"),
        ("leave", ["离岗", "没人在", "空岗", "值守不在"], "现场疑似值守离岗"),
        ("lost", ["钱包", "手机", "遗失", "失物", "找不到"], "现场疑似失物线索"),
        ("help", ["求助", "报警", "帮忙", "救命"], "现场求助信息"),
    ]
    for intent, keywords, label in checks:
        if any(keyword in lowered for keyword in keywords):
            score = 0.78 + 0.04 * sum(1 for keyword in keywords if keyword in lowered)
            return intent, min(score, 0.98), label
    return "report", 0.55, "现场一般上报"


def record_voice_intake(
    transcript: str,
    bay: str,
    channel: str = "voice",
    contact: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    speaker: str | None = None,
    auto_assign: bool = True,
) -> dict[str, Any]:
    _ensure_defaults()
    event_store = _event_store()
    intent, confidence, label = _intent_from_text(transcript)
    now = _now_iso()
    intake_id = _uuid("voice")
    event: dict[str, Any] | None = None
    if intent == "help":
        event = event_store.create_help_event(bay=bay, description=transcript, latitude=latitude, longitude=longitude, contact=contact)
    elif intent == "lost":
        event = event_store.create_lost_event(transcript[:16] or "失物线索", bay, contact)
    else:
        event = event_store.create_report_event(
            category={
                "fight": "打架斗殴",
                "gather": "异常聚集",
                "fall": "人员跌倒",
                "leave": "值守离岗",
            }.get(intent, "现场上报"),
            bay=bay,
            description=transcript,
            anonymous=False,
            contact=contact,
            photo_count=0,
        )

    if event and auto_assign:
        try:
            if intent in {"fight", "gather", "help"}:
                event = event_store.assign_event(event["id"], "wang", "语音接警")
            elif intent in {"fall", "leave"}:
                event = event_store.assign_event(event["id"], "li", "语音接警")
        except Exception:
            pass

    with DB_LOCK, SessionLocal() as session:
        row = VoiceIntake(
            intakeId=intake_id,
            channel=channel,
            transcript=transcript,
            intent=intent,
            confidence=confidence,
            parsed_json={"label": label, "speaker": speaker, "bay": bay, "contact": contact, "latitude": latitude, "longitude": longitude},
            eventId=event["id"] if event else None,
            createdAt=now,
        )
        session.add(row)
        session.commit()

    return {
        "intakeId": intake_id,
        "intent": intent,
        "confidence": confidence,
        "label": label,
        "event": event,
    }


def _notification_payload(row: NotificationRecord) -> dict[str, Any]:
    return {
        "noticeId": row.noticeId,
        "eventId": row.eventId,
        "channel": row.channel,
        "target": row.target,
        "title": row.title,
        "body": row.body,
        "status": row.status,
        "meta": dict(row.meta_json or {}),
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
        "sentAt": row.sentAt,
    }


def queue_notification(
    event_id: str | None,
    channel: str,
    target: str,
    title: str,
    body: str,
    status: str = "待发送",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _ensure_defaults()
    now = _now_iso()
    notice_id = _uuid("notice")
    with DB_LOCK, SessionLocal() as session:
        row = NotificationRecord(
            noticeId=notice_id,
            eventId=event_id,
            channel=channel,
            target=target,
            title=title,
            body=body,
            status=status,
            meta_json=meta or {},
            createdAt=now,
            updatedAt=now,
            sentAt=now if status in {"已发送", "已确认", "已送达"} else None,
        )
        session.add(row)
        session.commit()
        return _notification_payload(row)


def list_notifications(limit: int = 50, channel: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        statement = select(NotificationRecord).order_by(NotificationRecord.createdAt.desc())
        if channel:
            statement = statement.where(NotificationRecord.channel == channel)
        if status:
            statement = statement.where(NotificationRecord.status == status)
        rows = session.scalars(statement).all()
        return [_notification_payload(row) for row in rows[:limit]]


def _profile_payload(row: IdentityProfile) -> dict[str, Any]:
    return {
        "personKey": row.personKey,
        "name": row.name,
        "idNumber": row.idNumber,
        "archiveNo": row.archiveNo,
        "faceFingerprint": row.faceFingerprint,
        "tags": list(row.tags_json or []),
        "faceImage": row.faceImage,
        "notes": row.notes,
        "lastSeenAt": row.lastSeenAt,
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
    }


def upsert_identity_profile(
    name: str,
    id_number: str | None = None,
    archive_no: str | None = None,
    tags: list[str] | None = None,
    face_image: str | None = None,
    face_fingerprint: str | None = None,
    notes: str | None = None,
    person_key: str | None = None,
) -> dict[str, Any]:
    _ensure_defaults()
    now = _now_iso()
    with DB_LOCK, SessionLocal() as session:
        row = None
        if person_key:
            row = session.get(IdentityProfile, person_key)
        elif id_number:
            row = session.scalars(select(IdentityProfile).where(IdentityProfile.idNumber == id_number)).first()
        elif archive_no:
            row = session.scalars(select(IdentityProfile).where(IdentityProfile.archiveNo == archive_no)).first()
        else:
            row = session.scalars(select(IdentityProfile).where(IdentityProfile.name == name)).first()
        key = person_key or (row.personKey if row else hashlib.sha1(f"{name}:{id_number or archive_no or ''}".encode("utf-8")).hexdigest()[:16])
        if not row:
            row = IdentityProfile(
                personKey=key,
                name=name,
                idNumber=id_number,
                archiveNo=archive_no,
                faceFingerprint=face_fingerprint,
                tags_json=list(tags or []),
                faceImage=face_image,
                notes=notes,
                lastSeenAt=None,
                createdAt=now,
                updatedAt=now,
            )
            session.add(row)
        else:
            row.name = name
            row.idNumber = id_number
            row.archiveNo = archive_no
            row.faceFingerprint = face_fingerprint or row.faceFingerprint
            row.tags_json = list(tags or row.tags_json or [])
            row.faceImage = face_image or row.faceImage
            row.notes = notes or row.notes
            row.updatedAt = now
        session.commit()
        return _profile_payload(row)


def list_identity_profiles(limit: int = 50) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(IdentityProfile).order_by(IdentityProfile.updatedAt.desc())).all()
        return [_profile_payload(row) for row in rows[:limit]]


def _fingerprint_from_image(image_base64: str | None) -> str | None:
    if not image_base64:
        return None
    try:
        raw = base64.b64decode(image_base64, validate=False)
    except Exception:
        raw = image_base64.encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:24]


def compare_identity_archive(query: str, limit: int = 5, face_fingerprint: str | None = None, image_base64: str | None = None) -> list[dict[str, Any]]:
    _ensure_defaults()
    query_text = query.strip().lower()
    query_fingerprint = face_fingerprint or _fingerprint_from_image(image_base64)
    profiles = list_identity_profiles(limit=100)
    scored: list[dict[str, Any]] = []
    for profile in profiles:
        score = 0.0
        if query_text and query_text in str(profile.get("name", "")).lower():
            score += 0.6
        if query_text and query_text in str(profile.get("idNumber", "")).lower():
            score += 0.7
        tags = [str(item).lower() for item in profile.get("tags", [])]
        if any(query_text and query_text in tag for tag in tags):
            score += 0.4
        profile_fingerprint = str(profile.get("faceFingerprint") or "")
        if query_fingerprint and profile_fingerprint and query_fingerprint in profile_fingerprint:
            score += 0.9
        if score > 0:
            scored.append({**profile, "score": round(min(score, 0.99), 2)})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]


def _track_payload(row: TrackRecord) -> dict[str, Any]:
    return {
        "trackId": row.trackId,
        "personKey": row.personKey,
        "eventId": row.eventId,
        "cameraId": row.cameraId,
        "cameraName": row.cameraName,
        "points": list(row.points_json or []),
        "behavior": row.behavior,
        "startAt": row.startAt,
        "endAt": row.endAt,
        "createdAt": row.createdAt,
    }


def record_track(
    person_key: str | None,
    points: list[dict[str, Any]],
    camera_id: str | None = None,
    camera_name: str | None = None,
    event_id: str | None = None,
    behavior: str | None = None,
    end_at: str | None = None,
) -> dict[str, Any]:
    _ensure_defaults()
    now = _now_iso()
    track_id = _uuid("track")
    with DB_LOCK, SessionLocal() as session:
        row = TrackRecord(
            trackId=track_id,
            personKey=person_key,
            eventId=event_id,
            cameraId=camera_id,
            cameraName=camera_name,
            points_json=points,
            behavior=behavior,
            startAt=now,
            endAt=end_at,
            createdAt=now,
        )
        session.add(row)
        if person_key:
            profile = session.get(IdentityProfile, person_key)
            if profile:
                profile.lastSeenAt = now
                profile.updatedAt = now
        session.commit()
        return _track_payload(row)


def list_track_records(limit: int = 100, person_key: str | None = None, event_id: str | None = None) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        statement = select(TrackRecord).order_by(TrackRecord.createdAt.desc())
        if person_key:
            statement = statement.where(TrackRecord.personKey == person_key)
        if event_id:
            statement = statement.where(TrackRecord.eventId == event_id)
        rows = session.scalars(statement).all()
        return [_track_payload(row) for row in rows[:limit]]


def _lock_payload(row: TargetLock) -> dict[str, Any]:
    return {
        "targetKey": row.targetKey,
        "personKey": row.personKey,
        "eventId": row.eventId,
        "status": row.status,
        "reason": row.reason,
        "trail": list(row.trail_json or []),
        "lockedAt": row.lockedAt,
        "updatedAt": row.updatedAt,
    }


def lock_target(
    target_name: str,
    person_key: str | None = None,
    event_id: str | None = None,
    reason: str | None = None,
    status: str = "锁定中",
) -> dict[str, Any]:
    _ensure_defaults()
    now = _now_iso()
    target_key = f"target-{_slug(target_name)}-{uuid.uuid4().hex[:8]}"
    trail = list_track_records(person_key=person_key, event_id=event_id, limit=10)
    with DB_LOCK, SessionLocal() as session:
        row = TargetLock(
            targetKey=target_key,
            personKey=person_key,
            eventId=event_id,
            status=status,
            reason=reason or f"{target_name} 已进入重点追踪",
            trail_json=trail,
            lockedAt=now,
            updatedAt=now,
        )
        session.add(row)
        session.commit()
        return _lock_payload(row)


def list_target_locks(limit: int = 50) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(TargetLock).order_by(TargetLock.lockedAt.desc())).all()
        return [_lock_payload(row) for row in rows[:limit]]


def _containment_payload(row: ContainmentPlan) -> dict[str, Any]:
    return {
        "planId": row.planId,
        "eventId": row.eventId,
        "title": row.title,
        "targetKey": row.targetKey,
        "layout": dict(row.layout_json or {}),
        "assignments": list(row.assignments_json or []),
        "status": row.status,
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
    }


def _parse_event_dt(value: Any) -> datetime:
    if hasattr(value, "isoformat"):
        return value if isinstance(value, datetime) else datetime.fromisoformat(value.isoformat())
    if value:
        try:
            return datetime.fromisoformat(str(value))
        except ValueError:
            pass
    return datetime.now()


def _average_response_minutes(event_created_at: dict[str, datetime]) -> float | None:
    if not event_created_at:
        return None
    with SessionLocal() as session:
        logs = session.scalars(
            select(EventAuditLog).where(EventAuditLog.eventId.in_(event_created_at.keys())).order_by(EventAuditLog.createdAt.asc())
        ).all()
    first_response: dict[str, datetime] = {}
    for log in logs:
        if log.eventId in first_response:
            continue
        if log.action not in {"派单", "接收", "到达", "处理", "完成", "状态更新"}:
            continue
        try:
            responded = datetime.fromisoformat(log.createdAt)
        except ValueError:
            continue
        created = event_created_at.get(log.eventId)
        if created and responded >= created:
            first_response[log.eventId] = responded
    minutes = [
        max(0, (responded - event_created_at[event_id]).total_seconds() / 60)
        for event_id, responded in first_response.items()
        if event_created_at.get(event_id)
    ]
    if not minutes:
        return None
    return round(sum(minutes) / len(minutes), 1)


def create_containment_plan(
    event_id: str | None,
    target_key: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    _ensure_defaults()
    event_store = _event_store()
    now = _now_iso()
    events = event_store.list_events()
    target_event = next((item for item in events if item["id"] == event_id), None)
    event_bay = (target_event or {}).get("bay", "重点区域")
    route_hint = (target_event or {}).get("meta", {}).get("route", {})
    assignments = [
        {"team": "PTU快反组", "staff": "wang", "task": "外围围控"},
        {"team": "机动巡防组", "staff": "li", "task": "中圈支援"},
        {"team": "后巷巡防组", "staff": "chen", "task": "后路封控"},
    ]
    layout = {
        "center": event_bay,
        "radiusMeters": 60 if target_event and target_event.get("level") == "高风险" else 40,
        "route": route_hint,
        "targetKey": target_key,
    }
    plan_id = f"contain-{uuid.uuid4().hex[:10]}"
    with DB_LOCK, SessionLocal() as session:
        row = ContainmentPlan(
            planId=plan_id,
            eventId=event_id,
            title=title or f"{event_bay}合围处置方案",
            targetKey=target_key,
            layout_json=layout,
            assignments_json=assignments,
            status="进行中",
            createdAt=now,
            updatedAt=now,
        )
        session.add(row)
        session.commit()
        return _containment_payload(row)


def list_containment_plans(limit: int = 20) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(ContainmentPlan).order_by(ContainmentPlan.updatedAt.desc())).all()
        return [_containment_payload(row) for row in rows[:limit]]


def _feed_payload(row: DataFeed) -> dict[str, Any]:
    return {
        "sourceKey": row.sourceKey,
        "kind": row.kind,
        "name": row.name,
        "endpoint": row.endpoint,
        "enabled": row.enabled,
        "status": row.status,
        "lastSyncAt": row.lastSyncAt,
        "payload": dict(row.payload_json or {}),
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
    }


def upsert_data_feed(
    source_key: str,
    kind: str,
    name: str,
    endpoint: str | None = None,
    enabled: bool = True,
    status: str = "待接入",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _ensure_defaults()
    now = _now_iso()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(DataFeed, source_key)
        if not row:
            row = DataFeed(
                sourceKey=source_key,
                kind=kind,
                name=name,
                endpoint=endpoint,
                enabled=enabled,
                status=status,
                lastSyncAt=now if status == "在线" else None,
                payload_json=payload or {},
                createdAt=now,
                updatedAt=now,
            )
            session.add(row)
        else:
            row.kind = kind
            row.name = name
            row.endpoint = endpoint
            row.enabled = enabled
            row.status = status
            row.lastSyncAt = now if status == "在线" else row.lastSyncAt
            row.payload_json = payload or dict(row.payload_json or {})
            row.updatedAt = now
        session.commit()
        return _feed_payload(row)


def list_data_feeds(limit: int = 50) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(DataFeed).order_by(DataFeed.updatedAt.desc())).all()
        return [_feed_payload(row) for row in rows[:limit]]


def sync_data_feed(source_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    _ensure_defaults()
    now = _now_iso()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(DataFeed, source_key)
        if not row:
            row = DataFeed(
                sourceKey=source_key,
                kind=str(payload.get("kind") or "custom"),
                name=str(payload.get("name") or source_key),
                endpoint=payload.get("endpoint"),
                enabled=True,
                status="在线",
                lastSyncAt=now,
                payload_json=payload,
                createdAt=now,
                updatedAt=now,
            )
            session.add(row)
        else:
            row.status = "在线"
            row.lastSyncAt = now
            row.payload_json = payload
            row.updatedAt = now
        session.commit()
        return _feed_payload(row)


def generate_analysis_report(period: str = "day", start: str | None = None, end: str | None = None) -> dict[str, Any]:
    _ensure_defaults()
    event_store = _event_store()
    overview = event_store.overview()
    events = overview.get("events", [])
    notifications = list_notifications(limit=200)
    locks = list_target_locks(limit=200)
    duty_plans = list_duty_plans(limit=20)
    data_feeds = list_data_feeds(limit=20)
    now = _now_iso()

    response_minutes = overview.get("stats", {}).get("avg_response_minutes") or 0
    by_kind = Counter(event.get("kind") for event in events)
    by_bay = Counter(event.get("bay") for event in events)
    report = {
        "period": period,
        "start": start,
        "end": end,
        "eventCount": len(events),
        "openCount": len([event for event in events if event.get("status") != "已完成"]),
        "completionRate": overview.get("stats", {}).get("completion_rate", 0),
        "avgResponseMinutes": response_minutes,
        "topKinds": [{"kind": kind, "count": count} for kind, count in by_kind.most_common(5)],
        "topBays": [{"bay": bay, "count": count} for bay, count in by_bay.most_common(5)],
        "notificationCount": len(notifications),
        "targetLockCount": len(locks),
        "dutyPlanCount": len(duty_plans),
        "dataFeedCount": len(data_feeds),
    }
    report_id = f"report-{uuid.uuid4().hex[:10]}"
    with DB_LOCK, SessionLocal() as session:
        row = AnalysisReport(
            reportId=report_id,
            periodStart=start or report.get("start") or now,
            periodEnd=end or report.get("end") or now,
            title=f"{period}复盘报告",
            summary_json=report,
            createdAt=now,
            updatedAt=now,
        )
        session.add(row)
        session.commit()
    return report


def list_analysis_reports(limit: int = 20) -> list[dict[str, Any]]:
    _ensure_defaults()
    with SessionLocal() as session:
        rows = session.scalars(select(AnalysisReport).order_by(AnalysisReport.updatedAt.desc())).all()
        return [
            {
                "reportId": row.reportId,
                "periodStart": row.periodStart,
                "periodEnd": row.periodEnd,
                "title": row.title,
                "summary": dict(row.summary_json or {}),
                "createdAt": row.createdAt,
                "updatedAt": row.updatedAt,
            }
            for row in rows[:limit]
        ]


def summary() -> dict[str, Any]:
    _ensure_defaults()
    event_store = _event_store()
    events = event_store.list_events()
    staff = event_store.list_staff()
    notification_items = list_notifications(limit=50)
    duty_plans = list_duty_plans(limit=5)
    data_feeds = list_data_feeds(limit=5)
    identity_items = list_identity_profiles(limit=5)
    containment_items = list_containment_plans(limit=5)
    analysis_items = list_analysis_reports(limit=5)
    role_items = list_roles()[:5]
    dispatch_items = list_dispatch_rules(limit=5)
    try:
        from app.services.admin_store import list_agents, list_skills

        agent_items = list_agents()
        skill_items = list_skills()
    except Exception:
        agent_items = []
        skill_items = []
    open_events = [event for event in events if event.get("status") != "已完成"]
    urgent_events = [event for event in events if event.get("level") == "高风险"]
    closed_events = [event for event in events if event.get("status") == "已完成"]
    event_created_at = {
        event["id"]: _parse_event_dt(event.get("createdAt") or event.get("updatedAt") or event.get("time"))
        for event in events
    }
    avg_response_minutes = _average_response_minutes(event_created_at)
    with SessionLocal() as session:
        role_count = session.scalar(select(func.count()).select_from(UserRole)) or 0
        duty_count = session.scalar(select(func.count()).select_from(DutyPlan)) or 0
        voice_count = session.scalar(select(func.count()).select_from(VoiceIntake)) or 0
        notify_count = session.scalar(select(func.count()).select_from(NotificationRecord)) or 0
        feed_count = session.scalar(select(func.count()).select_from(DataFeed)) or 0
        profile_count = session.scalar(select(func.count()).select_from(IdentityProfile)) or 0
        track_count = session.scalar(select(func.count()).select_from(TrackRecord)) or 0
        lock_count = session.scalar(select(func.count()).select_from(TargetLock)) or 0
        report_count = session.scalar(select(func.count()).select_from(AnalysisReport)) or 0
    return {
        "roles": {"total": int(role_count), "items": role_items},
        "duty": {"total": int(duty_count), "items": duty_plans},
        "voice": {"total": int(voice_count)},
        "notifications": {"total": int(notify_count), "items": notification_items},
        "feeds": {"total": int(feed_count), "items": data_feeds},
        "identity": {
            "profiles": int(profile_count),
            "tracks": int(track_count),
            "locks": int(lock_count),
            "items": identity_items,
        },
        "containment": {"items": containment_items},
        "analysis": {
            "total": int(report_count),
            "items": analysis_items,
            "avgResponseMinutes": avg_response_minutes,
            "completionRate": round((len(closed_events) / len(events)) * 100) if events else 0,
        },
        "dispatchRules": {"items": dispatch_items},
        "agents": agent_items,
        "skills": skill_items,
        "overviewStats": {
            "today_events": len(events),
            "pending_orders": len(open_events),
            "online_staff": len([item for item in staff if item.get("online")]),
            "avg_response_minutes": avg_response_minutes,
            "completion_rate": round((len(closed_events) / len(events)) * 100) if events else 0,
            "urgent_events": len(urgent_events),
        },
    }
