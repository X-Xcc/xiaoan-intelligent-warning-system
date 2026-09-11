from __future__ import annotations

from datetime import datetime
import json
from math import atan2, cos, isfinite, radians, sin, sqrt
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import AlarmPush, EventAuditLog, Market, PatrolStaff, SafetyEvent, SecurityDetection
from app.services.security_detection import ACTION_LEVELS, ACTION_TITLES, import_security_detections_from_files, list_security_detections, status_summary, upsert_security_detection


STATUS_FLOW = ["已提交", "已派单", "已接收", "已到达", "处理中", "已完成"]
SECURITY_SYNC_ACTIONS = set(ACTION_TITLES)
ACTIVE_TASK_STATUSES = {"已派单", "已接收", "已到达", "处理中"}
AUDIT_DETAILS_MARKER = "\n[CICSIC_AUDIT_DETAILS]"

STAFF_ROSTER: dict[str, dict[str, Any]] = {
    "wang": {
        "id": "wang",
        "name": "王队",
        "role": "PTU快反组",
        "latitude": 28.6827,
        "longitude": 115.8593,
        "modes": ["walk", "bike", "drive"],
        "responsibilities": {
            "levels": ["高风险"],
            "bays": ["主街烧烤区", "三号门夜食街", "停车场入口"],
            "sources": ["视频提示", "夜市平安码"],
        },
    },
    "li": {
        "id": "li",
        "name": "李敏",
        "role": "机动巡防组",
        "latitude": 28.6847,
        "longitude": 115.861,
        "modes": ["bike", "drive"],
        "responsibilities": {
            "levels": ["高风险", "中风险"],
            "bays": ["啤酒广场", "亲子餐饮区"],
            "sources": ["视频提示", "商户/群众上报"],
        },
    },
    "chen": {
        "id": "chen",
        "name": "陈安",
        "role": "后巷巡防组",
        "latitude": 28.6804,
        "longitude": 115.8614,
        "modes": ["walk", "bike"],
        "responsibilities": {
            "levels": ["中风险", "低风险"],
            "bays": ["后巷摊位区"],
            "sources": ["商户/群众上报", "遗失/扒窃线索"],
        },
    },
}

STAFF_LOCATIONS: dict[str, dict[str, Any]] = {
    staff_id: {
        "latitude": staff["latitude"],
        "longitude": staff["longitude"],
        "updatedAt": "系统初始",
    }
    for staff_id, staff in STAFF_ROSTER.items()
}

BAY_COORDS: dict[str, dict[str, float]] = {
    "某某夜市": {"latitude": 28.6819, "longitude": 115.8637},
    "主街烧烤区": {"latitude": 28.682, "longitude": 115.8585},
    "三号门夜食街": {"latitude": 28.684, "longitude": 115.8606},
    "后巷摊位区": {"latitude": 28.6805, "longitude": 115.8612},
    "停车场入口": {"latitude": 28.6834, "longitude": 115.8571},
    "啤酒广场": {"latitude": 28.6812, "longitude": 115.8597},
    "亲子餐饮区": {"latitude": 28.6829, "longitude": 115.8609},
    "商户服务点": {"latitude": 28.6818, "longitude": 115.8578},
}

LEGACY_SAMPLE_EVENT_PREFIX = "YS-" + "260815-"
SECURITY_DETECTION_EVENT_PREFIX = "VIDET-"
LEGACY_SECURITY_DETECTION_EVENT_PREFIX = "A" "IDET-"

NIGHT_MARKET_BAYS = {
    "某某夜市",
    "主街烧烤区",
    "三号门夜食街",
    "后巷摊位区",
    "停车场入口",
    "啤酒广场",
    "亲子餐饮区",
    "商户服务站",
}

NIGHT_MARKET_SOURCES = {
    "视频提示",
    "夜市平安码",
    "群众报警",
    "商户/群众上报",
    "匿名上报",
    "遗失/扒窃线索",
}

BOOTSTRAP_NIGHT_MARKETS = [
    {
        "id": "NC-NM-001",
        "name": "绳金塔美食街",
        "district": "西湖区",
        "address": "金塔东街与绳金塔街周边",
        "latitude": 28.6614924,
        "longitude": 115.8972484,
        "tone": "danger",
        "summary": "绳金塔民俗风情街区，夜间餐饮、游客和商户摊位密集。",
        "source": "OpenStreetMap / 本地宝夜市街清单",
    },
    {
        "id": "NC-NM-002",
        "name": "蛤蟆街夜市",
        "district": "东湖区",
        "address": "豫章后街、象山北路周边",
        "latitude": 28.6889072,
        "longitude": 115.8834701,
        "tone": "warn",
        "summary": "老牌夜宵街区，人流、非机动车和餐饮排队集中。",
        "source": "OpenStreetMap / 本地宝夜市街清单",
    },
    {
        "id": "NC-NM-003",
        "name": "大士院老街",
        "district": "东湖区",
        "address": "半步街、大士院老街周边",
        "latitude": 28.6890925,
        "longitude": 115.8799397,
        "tone": "warn",
        "summary": "传统小吃老街，晚间巡查要覆盖半步街口。",
        "source": "OpenStreetMap / 南昌晚报夜经济报道",
    },
    {
        "id": "NC-NM-004",
        "name": "万寿宫历史文化街区",
        "district": "西湖区",
        "address": "船山路、翠花街周边",
        "latitude": 28.6771912,
        "longitude": 115.8822981,
        "tone": "warn",
        "summary": "核心文旅夜消费街区，节假日客流和演艺活动叠加。",
        "source": "OpenStreetMap / 南昌晚报夜经济报道",
    },
    {
        "id": "NC-NM-005",
        "name": "珠宝街",
        "district": "西湖区",
        "address": "珠宝街、嫁妆街周边",
        "latitude": 28.6759581,
        "longitude": 115.8854278,
        "tone": "warn",
        "summary": "老城美食街区，与万寿宫、羊子街形成连片夜游动线。",
        "source": "OpenStreetMap / 南昌晚报夜经济报道",
    },
    {
        "id": "NC-NM-006",
        "name": "羊子街夜市",
        "district": "西湖区",
        "address": "羊子街、八一大道周边",
        "latitude": 28.6772505,
        "longitude": 115.8955663,
        "tone": "safe",
        "summary": "老城夜宵与小吃点位，巡查时可连着珠宝街一起看。",
        "source": "OpenStreetMap / 南昌晚报夜经济报道",
    },
    {
        "id": "NC-NM-007",
        "name": "699文化创意园夜市",
        "district": "青山湖区",
        "address": "上海路699文化创意园",
        "latitude": 28.6738,
        "longitude": 115.9348,
        "tone": "safe",
        "summary": "文创园区型夜间消费点，餐饮、演艺和青年客群集中。",
        "source": "本地宝夜市街清单 / 南昌晚报夜经济报道",
    },
    {
        "id": "NC-NM-008",
        "name": "蓝海特色夜市街",
        "district": "东湖区",
        "address": "青山南路118号蓝海购物广场",
        "latitude": 28.6956,
        "longitude": 115.8892,
        "tone": "service",
        "summary": "商场周边夜市街，重点看停车、人流入口和商户求助。",
        "source": "本地宝夜市街清单",
    },
    {
        "id": "NC-NM-009",
        "name": "玉河湾夜市",
        "district": "青云谱区",
        "address": "解放西路玉河湾广场",
        "latitude": 28.6455,
        "longitude": 115.9182,
        "tone": "service",
        "summary": "商圈广场型夜市，散场交通和周边道路秩序是重点。",
        "source": "本地宝夜市街清单",
    },
    {
        "id": "NC-NM-010",
        "name": "IM乐盈广场夜市",
        "district": "经开区",
        "address": "桂苑大道486号IM乐盈广场",
        "latitude": 28.7388,
        "longitude": 115.8296,
        "tone": "service",
        "summary": "高校与商圈叠加型夜间消费点，关注晚高峰聚集。",
        "source": "本地宝夜市街清单",
    },
    {
        "id": "NC-NM-011",
        "name": "安义古村夜市",
        "district": "安义县",
        "address": "安义古村群景区",
        "latitude": 28.8506,
        "longitude": 115.5548,
        "tone": "safe",
        "summary": "景区型夜游夜市，晚间要兼顾停车和景区安保。",
        "source": "本地宝夜市街清单",
    },
    {
        "id": "NC-NM-012",
        "name": "洪都夜巷",
        "district": "青云谱区",
        "address": "新溪桥北二路周边",
        "latitude": 28.642696,
        "longitude": 115.9185393,
        "tone": "safe",
        "summary": "青云谱夜间消费街区，辖区夜巡线路要覆盖。",
        "source": "OpenStreetMap / 南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-013",
        "name": "警民路夜市",
        "district": "青云谱区",
        "address": "警民路周边",
        "latitude": 28.6193087,
        "longitude": 115.8988405,
        "tone": "safe",
        "summary": "社区型夜市街，重点关注烟火摊点和居民区边界秩序。",
        "source": "OpenStreetMap / 南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-014",
        "name": "怡园路鸿鹄美食街",
        "district": "红谷滩区",
        "address": "怡园路、凤凰中大道周边",
        "latitude": 28.6818,
        "longitude": 115.8549,
        "tone": "safe",
        "summary": "红谷滩居住区与办公区交界夜宵点，晚间巡逻要经过。",
        "source": "南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-015",
        "name": "瑶湖里夜市街区",
        "district": "高新区",
        "address": "瑶湖岱山三街周边",
        "latitude": 28.6744836,
        "longitude": 116.0110159,
        "tone": "safe",
        "summary": "瑶湖片区夜间消费街，关注高校和居住区夜间人流。",
        "source": "OpenStreetMap / 南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-016",
        "name": "寻味艾溪里",
        "district": "高新区",
        "address": "创新二路16号周边",
        "latitude": 28.6925,
        "longitude": 115.9815,
        "tone": "safe",
        "summary": "艾溪湖片区夜间消费点，湖区商圈巡查时一并关注。",
        "source": "南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-017",
        "name": "阳门里美食街",
        "district": "高新区",
        "address": "瑶湖西二路周边",
        "latitude": 28.6978333,
        "longitude": 116.027489,
        "tone": "safe",
        "summary": "瑶湖东向美食街，夜间外卖骑手和摊点都比较集中。",
        "source": "OpenStreetMap / 南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-018",
        "name": "紫荆路步行街夜市",
        "district": "经开区",
        "address": "紫荆路商业步行街、菊圃路周边",
        "latitude": 28.7363827,
        "longitude": 115.8287984,
        "tone": "warn",
        "summary": "高校片区知名夜市，夜间客流、摊位和交通压力集中。",
        "source": "OpenStreetMap / 南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-019",
        "name": "滨湖大道活力夜市街",
        "district": "南昌县",
        "address": "滨湖大道世纪名城北门周边",
        "latitude": 28.556,
        "longitude": 116.015,
        "tone": "safe",
        "summary": "县区社区型夜市街，属地巡防和城管要一起看。",
        "source": "南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-020",
        "name": "福州路潮玩夜市",
        "district": "东湖区",
        "address": "福州路、八一大道周边",
        "latitude": 28.6843758,
        "longitude": 115.8984017,
        "tone": "safe",
        "summary": "中心城区夜间潮玩消费点，八一广场周边安保要同步关注。",
        "source": "OpenStreetMap / 南昌夜间文旅消费打卡地",
    },
    {
        "id": "NC-NM-021",
        "name": "赣江新天地夜间街区",
        "district": "红谷滩区",
        "address": "赣江南大道、摩天轮周边",
        "latitude": 28.6358,
        "longitude": 115.8504,
        "tone": "service",
        "summary": "滨江文旅夜游街区，活动期间需关注车流、人流和亲水安全。",
        "source": "南昌晚报夜经济报道",
    },
]


def bootstrap_night_markets() -> list[dict[str, Any]]:
    return [dict(item) for item in BOOTSTRAP_NIGHT_MARKETS]


def _now_label() -> str:
    return datetime.now().strftime("%H:%M")


def _new_id(prefix: str = "JT") -> str:
    return f"{prefix}-{datetime.now().strftime('%y%m%d-%H%M%S-%f')[:20]}"


def _staff_key(staff: str | None) -> str | None:
    if not staff:
        return None
    normalized = staff.strip()
    for staff_id, item in STAFF_ROSTER.items():
        if normalized in {staff_id, item["name"], item["role"]}:
            return staff_id
    init_database()
    with SessionLocal() as session:
        row = session.get(PatrolStaff, normalized)
        if row:
            return row.id
        row = session.scalars(
            select(PatrolStaff).where(or_(PatrolStaff.name == normalized, PatrolStaff.role == normalized))
        ).first()
        if row:
            return row.id
    return None


def _location(latitude: float, longitude: float, name: str, source: str = "gps") -> dict[str, Any]:
    return {
        "latitude": round(float(latitude), 6),
        "longitude": round(float(longitude), 6),
        "name": name,
        "source": source,
    }


def _event_location(event: dict[str, Any]) -> dict[str, Any]:
    meta = event.get("meta") or {}
    if meta.get("locationSource") == "manual":
        return {"name": meta.get("manualLocation") or event["bay"], "source": "manual"}
    reporter = meta.get("reporterLocation") or meta.get("alarmLocation")
    if isinstance(reporter, dict) and reporter.get("latitude") is not None and reporter.get("longitude") is not None:
        return _location(reporter["latitude"], reporter["longitude"], event["bay"], reporter.get("source", "gps"))
    if meta.get("latitude") is not None and meta.get("longitude") is not None:
        return _location(meta["latitude"], meta["longitude"], event["bay"], "legacy_gps")
    fallback = BAY_COORDS.get(event["bay"]) or BAY_COORDS["主街烧烤区"]
    return _location(fallback["latitude"], fallback["longitude"], event["bay"], "bay_fallback")


def _staff_location(staff_id: str, session: Session | None = None) -> dict[str, Any]:
    staff = STAFF_ROSTER.get(staff_id)
    row = session.get(PatrolStaff, staff_id) if session is not None else None
    if row:
        return _location(
            row.latitude,
            row.longitude,
            row.name,
            "staff_gps" if row.updatedAt != "系统初始" else "staff_default",
        )
    if staff is None:
        fallback = BAY_COORDS["主街烧烤区"]
        return _location(fallback["latitude"], fallback["longitude"], staff_id, "staff_default")
    current = STAFF_LOCATIONS.get(staff_id) or {}
    return _location(
        current.get("latitude", staff["latitude"]),
        current.get("longitude", staff["longitude"]),
        staff["name"],
        "staff_gps" if current.get("updatedAt") != "系统初始" else "staff_default",
    )


def _haversine_meters(origin: dict[str, Any], destination: dict[str, Any]) -> int:
    radius = 6371000
    lat1 = radians(float(origin["latitude"]))
    lat2 = radians(float(destination["latitude"]))
    delta_lat = radians(float(destination["latitude"]) - float(origin["latitude"]))
    delta_lon = radians(float(destination["longitude"]) - float(origin["longitude"]))
    a = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    return round(radius * 2 * atan2(sqrt(a), sqrt(1 - a)))


def _format_distance(distance_meters: int) -> str:
    if distance_meters < 1000:
        return f"{distance_meters}m"
    return f"{distance_meters / 1000:.1f}km"


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _recommend_transport(distance_meters: int, staff_id: str, session: Session | None = None) -> dict[str, Any]:
    row = session.get(PatrolStaff, staff_id) if session is not None else None
    available = row.modes if row else STAFF_ROSTER.get(staff_id, {}).get("modes", ["walk"])
    if distance_meters <= 800 and "walk" in available:
        mode = "walk"
        speed = 80
        label = "步行"
    elif distance_meters <= 2500 and "bike" in available:
        mode = "bike"
        speed = 180
        label = "骑行"
    else:
        mode = "drive" if "drive" in available else available[-1]
        speed = 420 if mode == "drive" else 180
        label = "驾车" if mode == "drive" else "骑行"
    eta = max(1, round(distance_meters / speed))
    return {"mode": mode, "modeLabel": label, "etaMinutes": eta, "etaLabel": f"{eta}分钟"}


def _build_route(
    origin: dict[str, Any],
    destination: dict[str, Any],
    staff_id: str,
    session: Session | None = None,
) -> dict[str, Any]:
    if destination.get("latitude") is None or destination.get("longitude") is None:
        raise ValueError("Manual location requires verified coordinates before routing")
    distance_meters = _haversine_meters(origin, destination)
    transport = _recommend_transport(distance_meters, staff_id, session)
    mid_lat = (origin["latitude"] + destination["latitude"]) / 2
    mid_lon = (origin["longitude"] + destination["longitude"]) / 2
    offset = min(0.00045, max(0.00012, distance_meters / 10000000))
    points = [
        {"latitude": origin["latitude"], "longitude": origin["longitude"]},
        {"latitude": round(mid_lat + offset, 6), "longitude": round(mid_lon - offset, 6)},
        {"latitude": destination["latitude"], "longitude": destination["longitude"]},
    ]
    return {
        **transport,
        "distanceMeters": distance_meters,
        "distanceLabel": _format_distance(distance_meters),
        "origin": origin,
        "destination": destination,
        "points": points,
        "provider": "local_recommendation",
    }


def _responsibility_matched(event: dict[str, Any], staff: dict[str, Any]) -> bool:
    responsibilities = staff.get("responsibilities") or {}
    return any(
        (
            event.get("level") in responsibilities.get("levels", []),
            event.get("bay") in responsibilities.get("bays", []),
            event.get("source") in responsibilities.get("sources", []),
        )
    )


def _active_task_load(session: Session | None, staff_name: str) -> int:
    if session is None:
        return 0
    return int(
        session.scalar(
            select(func.count())
            .select_from(SafetyEvent)
            .where(SafetyEvent.owner == staff_name)
            .where(SafetyEvent.status.in_(ACTIVE_TASK_STATUSES))
        )
        or 0
    )


def _build_assignment(event: dict[str, Any], staff_id: str | None = None, session: Session | None = None) -> dict[str, Any]:
    destination = _event_location(event)
    candidates: list[dict[str, Any]] = []
    staff_ids = [staff_id] if staff_id else list(STAFF_ROSTER.keys())
    if session is not None:
        db_staff_ids = list(session.scalars(select(PatrolStaff.id).order_by(PatrolStaff.id.asc())).all())
        staff_ids = [staff_id] if staff_id else db_staff_ids or staff_ids
    for candidate_id in staff_ids:
        row = session.get(PatrolStaff, candidate_id) if session is not None else None
        staff = STAFF_ROSTER.get(candidate_id) or {
            "name": row.name if row else candidate_id,
            "role": row.role if row else "巡防人员",
            "modes": row.modes if row else ["walk"],
            "responsibilities": {},
        }
        online = bool(row.online) if row is not None else True
        responsibility_matched = _responsibility_matched(event, staff)
        origin = _staff_location(candidate_id, session)
        route = _build_route(origin, destination, candidate_id, session) if destination.get("latitude") is not None else None
        load = _active_task_load(session, row.name if row else staff["name"])
        candidates.append(
            {
                "staffId": candidate_id,
                "staffName": row.name if row else staff["name"],
                "role": row.role if row else staff["role"],
                "route": route,
                "online": online,
                "responsibilityMatched": responsibility_matched,
                "load": load,
                "score": (route["distanceMeters"] if route else 0) + load * 500,
            }
        )
    online_candidates = [candidate for candidate in candidates if candidate["online"]]
    matched_candidates = [candidate for candidate in online_candidates if candidate["responsibilityMatched"]]
    selectable = online_candidates if staff_id else (matched_candidates or online_candidates)
    if not selectable:
        raise ValueError("No online staff available for assignment")
    best = min(selectable, key=lambda item: item["score"])
    fallback_used = not staff_id and not matched_candidates
    return {
        "staffId": best["staffId"],
        "staffName": best["staffName"],
        "role": best["role"],
        "assignedAt": datetime.now().isoformat(timespec="seconds"),
        "reason": "按在线状态、责任范围、实时距离和在办任务量推荐" if not fallback_used else "按在线状态、实时距离和在办任务量推荐",
        "route": best["route"],
        "candidates": candidates,
    }


def _event_to_dict(event: SafetyEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "kind": event.kind,
        "title": event.title,
        "bay": event.bay,
        "level": event.level,
        "source": event.source,
        "status": event.status,
        "owner": event.owner,
        "distance": event.distance,
        "time": event.time,
        "updatedAt": event.updatedAt,
        "description": event.description,
        "result": event.result,
        "anonymous": bool(event.anonymous),
        "meta": event.meta_json or {},
        "createdAt": event.createdAt,
        "updatedAtIso": event.updatedAtIso,
    }


def _alarm_push_to_dict(push: AlarmPush) -> dict[str, Any]:
    payload = push.payload_json or {}
    return {
        "id": push.id,
        "eventId": push.eventId,
        "channel": push.channel,
        "target": push.target,
        "status": push.status,
        "title": push.title,
        "payload": payload,
        "alarmLocation": payload.get("alarmLocation"),
        "route": payload.get("route"),
        "assignment": payload.get("assignment"),
        "createdAt": push.createdAt,
        "acknowledgedAt": push.acknowledgedAt,
    }


def _event_evidence_index(event: dict[str, Any]) -> dict[str, Any]:
    meta = event.get("meta") or {}
    detection = meta.get("securityDetection")
    context = meta.get("context")
    index: dict[str, Any] = {}
    keys = ("eventKey", "sourceId", "cameraId", "cameraName", "imageFilename", "path", "timestamp")
    if isinstance(detection, dict):
        index.update({key: detection[key] for key in keys if detection.get(key) is not None})
    if isinstance(context, dict):
        for key in ("marketId", "zoneId", "deviceId", "deviceType", "riskRecordId", "riskType"):
            if context.get(key) is not None:
                index[key] = context[key]
        if context.get("evidence"):
            index["evidence"] = context["evidence"]
    return index


def _split_audit_note(note: str | None) -> tuple[str | None, dict[str, Any]]:
    if not note or AUDIT_DETAILS_MARKER not in note:
        return note, {}
    summary, serialized_details = note.split(AUDIT_DETAILS_MARKER, 1)
    try:
        details = json.loads(serialized_details)
    except json.JSONDecodeError:
        return note, {}
    return summary or None, details if isinstance(details, dict) else {}


def _compose_audit_note(summary: str | None, details: dict[str, Any] | None) -> str | None:
    if not details:
        return summary
    return f"{summary or ''}{AUDIT_DETAILS_MARKER}{json.dumps(details, ensure_ascii=False, separators=(',', ':'))}"


def _log_to_dict(log: EventAuditLog) -> dict[str, Any]:
    note, details = _split_audit_note(log.note)
    return {
        "id": log.id,
        "eventId": log.eventId,
        "action": log.action,
        "operator": log.operator,
        "status": log.status,
        "owner": log.owner,
        "note": note,
        "details": details,
        "time": log.time,
        "createdAt": log.createdAt,
    }


def _event_logs(session: Session, event_id: str) -> list[dict[str, Any]]:
    rows = session.scalars(
        select(EventAuditLog)
        .where(EventAuditLog.eventId == event_id)
        .order_by(EventAuditLog.createdAt.asc(), EventAuditLog.id.asc())
    ).all()
    return [_log_to_dict(row) for row in rows]


def _append_log(
    session: Session,
    event_id: str,
    action: str,
    status: str,
    owner: str,
    operator: str = "系统",
    note: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    now = datetime.now()
    session.add(
        EventAuditLog(
            eventId=event_id,
            action=action,
            operator=operator,
            status=status,
            owner=owner,
            note=_compose_audit_note(note, details),
            time=now.strftime("%H:%M"),
            createdAt=now.isoformat(timespec="seconds"),
        )
    )


def _create_alarm_push(session: Session, event: dict[str, Any], channel: str = "command_center") -> dict[str, Any]:
    payload = {
        "eventId": event["id"],
        "bay": event["bay"],
        "locationSource": (event.get("meta") or {}).get("locationSource"),
        "manualLocation": (event.get("meta") or {}).get("manualLocation"),
        "alarmLocation": (event.get("meta") or {}).get("alarmLocation"),
        "reporterLocation": (event.get("meta") or {}).get("reporterLocation"),
        "assignment": (event.get("meta") or {}).get("assignment"),
        "route": (event.get("meta") or {}).get("route"),
        "contact": (event.get("meta") or {}).get("contact"),
        "context": (event.get("meta") or {}).get("context"),
        "description": event.get("description"),
    }
    push = AlarmPush(
        id=_new_id("PUSH"),
        eventId=event["id"],
        channel=channel,
        target="指挥中心",
        status="待确认",
        title=f"{event['title']}已发给指挥中心",
        payload_json=payload,
        createdAt=datetime.now().isoformat(timespec="seconds"),
        acknowledgedAt=None,
    )
    session.add(push)
    session.flush()
    return _alarm_push_to_dict(push)


def _seed_staff(session: Session) -> None:
    now_iso = datetime.now().isoformat(timespec="seconds")
    for staff_id, staff in STAFF_ROSTER.items():
        row = session.get(PatrolStaff, staff_id)
        if row:
            row.name = staff["name"]
            row.role = staff["role"]
            row.modes = staff["modes"]
            if row.updatedAt == "系统初始":
                row.latitude = staff["latitude"]
                row.longitude = staff["longitude"]
                row.online = True
            continue
        session.add(
            PatrolStaff(
                id=staff_id,
                name=staff["name"],
                role=staff["role"],
                latitude=staff["latitude"],
                longitude=staff["longitude"],
                modes=staff["modes"],
                online=True,
                updatedAt="系统初始",
                accuracy=None,
            )
        )
        STAFF_LOCATIONS[staff_id] = {
            "latitude": staff["latitude"],
            "longitude": staff["longitude"],
            "updatedAt": "系统初始",
        }


def _staff_to_dict(row: PatrolStaff) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "role": row.role,
        "location": _location(row.latitude, row.longitude, row.name, "staff_gps" if row.updatedAt != "系统初始" else "staff_default"),
        "updatedAt": row.updatedAt,
        "modes": row.modes,
        "online": row.online,
        "accuracy": row.accuracy,
    }


def _normalize_assignment_roles(meta: dict[str, Any]) -> bool:
    changed = False
    assignment = meta.get("assignment")
    if isinstance(assignment, dict):
        staff_id = assignment.get("staffId")
        staff = STAFF_ROSTER.get(staff_id)
        if staff and assignment.get("role") != staff["role"]:
            assignment["role"] = staff["role"]
            changed = True
        candidates = assignment.get("candidates")
        if isinstance(candidates, list):
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                candidate_staff = STAFF_ROSTER.get(candidate.get("staffId"))
                if candidate_staff and candidate.get("role") != candidate_staff["role"]:
                    candidate["role"] = candidate_staff["role"]
                    changed = True
    return changed


def _normalize_existing_metadata(session: Session) -> None:
    events = session.scalars(select(SafetyEvent)).all()
    for row in events:
        if (row.meta_json or {}).get("command"):
            continue
        if row.source in {"视频提示", "视频预警"}:
            row.source = "视频提示"
        meta = dict(row.meta_json or {})
        if _normalize_assignment_roles(meta):
            row.meta_json = meta

    pushes = session.scalars(select(AlarmPush)).all()
    for push in pushes:
        payload = dict(push.payload_json or {})
        if _normalize_assignment_roles(payload):
            push.payload_json = payload


def _prune_legacy_sample_events(session: Session) -> None:
    legacy_ids = list(
        session.scalars(
            select(SafetyEvent.id).where(SafetyEvent.id.like(f"{LEGACY_SAMPLE_EVENT_PREFIX}%"))
        ).all()
    )
    if not legacy_ids:
        return
    session.execute(delete(AlarmPush).where(AlarmPush.eventId.in_(legacy_ids)))
    session.execute(delete(EventAuditLog).where(EventAuditLog.eventId.in_(legacy_ids)))
    session.execute(delete(SafetyEvent).where(SafetyEvent.id.in_(legacy_ids)))


def _prune_unlocated_help_events(session: Session) -> None:
    rows = session.scalars(select(SafetyEvent).where(SafetyEvent.kind == "help")).all()
    event_ids = []
    for row in rows:
        meta = row.meta_json or {}
        if meta.get("command"):
            continue
        location = meta.get("alarmLocation") or meta.get("reporterLocation") or {}
        if isinstance(location, dict) and location.get("source") == "bay_fallback":
            event_ids.append(row.id)
    if not event_ids:
        return
    session.execute(delete(AlarmPush).where(AlarmPush.eventId.in_(event_ids)))
    session.execute(delete(EventAuditLog).where(EventAuditLog.eventId.in_(event_ids)))
    session.execute(delete(SafetyEvent).where(SafetyEvent.id.in_(event_ids)))


def _ensure_demo_placeholder_event(session: Session) -> None:
    """Keep one clearly synthetic high-risk card visible for demonstrations."""
    event_id = "YS-DEMO-001"
    if session.get(SafetyEvent, event_id):
        return
    created_at = datetime.now().isoformat(timespec="seconds")
    session.add(
        SafetyEvent(
            id=event_id,
            kind="help",
            title="寻衅滋事",
            bay="某某夜市",
            level="高风险",
            source="群众报警",
            status="已提交",
            owner="待指派",
            distance="待测距",
            time=datetime.now().strftime("%H:%M"),
            updatedAt=datetime.now().strftime("%H:%M"),
            description="某某夜市现场有人持续滋扰、挑衅并影响摊位经营，已形成围观，建议附近巡防人员先期到场核实。",
            result=None,
            anonymous=True,
            meta_json={
                "locationSource": "desensitized_demo",
                "manualLocation": "某某夜市",
                "alarmLocation": {"latitude": 28.6819, "longitude": 115.8637, "name": "某某夜市", "source": "desensitized_demo"},
                "demo": True,
            },
            createdAt=created_at,
            updatedAtIso=created_at,
        )
    )


def init_db() -> None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        _seed_staff(session)
        _prune_legacy_sample_events(session)
        _prune_unlocated_help_events(session)
        _ensure_demo_placeholder_event(session)
        _normalize_existing_metadata(session)
        session.commit()
        count = session.scalar(select(func.count()).select_from(SafetyEvent)) or 0

        log_count = session.scalar(select(func.count()).select_from(EventAuditLog)) or 0
        if count > 0 and log_count == 0:
            rows = session.scalars(select(SafetyEvent).order_by(SafetyEvent.createdAt.asc())).all()
            for row in rows:
                _append_log(
                    session,
                    row.id,
                    "创建事件",
                    row.status,
                    row.owner,
                    "事件系统",
                    row.description,
                )
            session.commit()

        push_count = session.scalar(select(func.count()).select_from(AlarmPush)) or 0
        if count > 0 and push_count == 0:
            rows = session.scalars(select(SafetyEvent).order_by(SafetyEvent.createdAt.asc())).all()
            for row in rows:
                event = _event_to_dict(row)
                if row.kind == "help" and not (row.meta_json or {}).get("command"):
                    _create_alarm_push(session, event)
            session.commit()


def insert_event(session: Session, event: dict[str, Any]) -> dict[str, Any]:
    now_iso = datetime.now().isoformat(timespec="seconds")
    payload = {
        **event,
        "meta": event.get("meta", {}),
        "createdAt": event.get("createdAt", now_iso),
        "updatedAtIso": event.get("updatedAtIso", now_iso),
    }
    row = SafetyEvent(
        id=payload["id"],
        kind=payload["kind"],
        title=payload["title"],
        bay=payload["bay"],
        level=payload["level"],
        source=payload["source"],
        status=payload["status"],
        owner=payload["owner"],
        distance=payload["distance"],
        time=payload["time"],
        updatedAt=payload["updatedAt"],
        description=payload["description"],
        result=payload.get("result"),
        anonymous=bool(payload.get("anonymous", False)),
        meta_json=payload["meta"],
        createdAt=payload["createdAt"],
        updatedAtIso=payload["updatedAtIso"],
    )
    session.add(row)
    session.flush()
    _append_log(
        session,
        payload["id"],
        "创建事件",
        payload["status"],
        payload["owner"],
        "事件系统",
        payload["description"],
        {
            "previousStatus": None,
            "nextStatus": payload["status"],
            "operationLocation": _event_location(payload),
            "evidenceIndex": _event_evidence_index(payload),
        },
    )
    return payload


def _attach_alarm_push(session: Session, event: dict[str, Any]) -> dict[str, Any] | None:
    if event["kind"] not in {"help", "ai_detection"}:
        return None
    return _create_alarm_push(session, event)


def _queue_event_notification(
    event: dict[str, Any],
    channel: str,
    target: str,
    status: str = "已发送",
    body: str | None = None,
) -> None:
    try:
        from app.services.security_ops import queue_notification

        queue_notification(
            event["id"],
            channel,
            target,
            event["title"],
            body or event["description"],
            status,
            {"source": "event_store", "kind": event["kind"]},
        )
    except Exception:
        pass


def _security_camera_location(camera_name: str, camera_id: str | None = None) -> dict[str, Any]:
    label = camera_name or camera_id or "视频监控点"
    for market in list_night_markets():
        alias = (
            market["name"]
            .replace("美食街", "")
            .replace("夜市", "")
            .replace("历史文化街区", "")
            .replace("文化创意园", "")
            .replace("特色", "")
        )
        if alias and alias in label:
            return _location(market["latitude"], market["longitude"], label, "security_camera")
    fallback = BAY_COORDS["主街烧烤区"]
    return _location(fallback["latitude"], fallback["longitude"], label, "security_camera")


def _security_detection_event_id(event_key: str, legacy: bool = False) -> str:
    prefix = LEGACY_SECURITY_DETECTION_EVENT_PREFIX if legacy else SECURITY_DETECTION_EVENT_PREFIX
    return f"{prefix}{event_key}"


def _insert_security_detection(session: Session, detection: dict[str, Any]) -> dict[str, Any] | None:
    action = next((item for item in detection.get("actions", []) if item in SECURITY_SYNC_ACTIONS), None)
    if not action:
        return None
    event_id = _security_detection_event_id(detection["eventKey"])
    existing = session.get(SafetyEvent, event_id) or session.get(
        SafetyEvent, _security_detection_event_id(detection["eventKey"], legacy=True)
    )
    if existing:
        return _event_to_dict(existing)

    timestamp = detection["timestamp"]
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp)
        except ValueError:
            timestamp = datetime.now()
    label = timestamp.strftime("%H:%M")
    detection_payload = {**detection, "timestamp": timestamp.isoformat(timespec="seconds")}
    camera_name = detection.get("cameraName") or detection.get("cameraId") or "视频监控点"
    alarm_location = _security_camera_location(camera_name, detection.get("cameraId"))
    event = {
        "id": event_id,
        "kind": "ai_detection",
        "title": ACTION_TITLES[action],
        "bay": camera_name,
        "level": ACTION_LEVELS[action],
        "source": "视频提示",
        "status": "已提交",
        "owner": "指挥中心待派单",
        "distance": "待派单",
        "time": label,
        "updatedAt": label,
        "description": (
            f"{camera_name}发现{ACTION_TITLES[action]}，"
            f"画面中约 {detection.get('personCount', 0)} 人，请巡防组到现场看一下。"
        ),
        "result": None,
        "anonymous": False,
        "createdAt": timestamp.isoformat(timespec="seconds"),
        "updatedAtIso": datetime.now().isoformat(timespec="seconds"),
        "meta": {
            "alarmLocation": alarm_location,
            "securityDetection": detection_payload,
            "visionReviewStatus": "pending",
        },
    }
    from app.services.security_linkage import normalize_event_context

    event["meta"]["context"] = normalize_event_context(
        detection.get("context") if isinstance(detection.get("context"), dict) else {},
        bay=camera_name,
        title=ACTION_TITLES[action],
        description=event["description"],
        alarm_location=alarm_location,
    )
    assignment = _build_assignment(event, session=session)
    event["distance"] = assignment["route"]["distanceLabel"]
    event["meta"]["assignment"] = {key: value for key, value in assignment.items() if key != "route"}
    event["meta"]["route"] = assignment["route"]
    insert_event(session, event)
    _attach_alarm_push(session, event)
    row = session.get(SecurityDetection, detection["eventKey"])
    if row:
        row.eventId = event["id"]
        row.updatedAt = datetime.now().isoformat(timespec="seconds")
    return event


def ingest_security_detection(detection: dict[str, Any]) -> dict[str, Any] | None:
    init_db()
    upsert_security_detection(detection)
    with DB_LOCK, SessionLocal() as session:
        event = _insert_security_detection(session, detection)
        session.commit()
    if not event:
        return None
    try:
        from app.services.security_linkage import link_event_risk

        link_event_risk(event["id"])
    except Exception:
        pass
    _queue_event_notification(event, "popup", "command_center")
    return get_event(event["id"]) or event


def sync_security_detections(limit: int = 50) -> list[dict[str, Any]]:
    init_db()
    created: list[dict[str, Any]] = []
    import_security_detections_from_files(limit=limit)
    detections = list_security_detections(limit=limit)
    if not detections:
        return created

    with DB_LOCK, SessionLocal() as session:
        for detection in detections:
            action = next((item for item in detection["actions"] if item in SECURITY_SYNC_ACTIONS), None)
            if not action:
                continue
            event_id = _security_detection_event_id(detection["eventKey"])
            detection_row = session.get(SecurityDetection, detection["eventKey"])
            if session.get(SafetyEvent, event_id) or session.get(
                SafetyEvent, _security_detection_event_id(detection["eventKey"], legacy=True)
            ) or (detection_row and detection_row.eventId):
                continue
            event = _insert_security_detection(session, detection)
            if event:
                created.append(event)
        session.commit()

    for event in created:
        try:
            from app.services.security_linkage import link_event_risk

            link_event_risk(event["id"])
        except Exception:
            pass
        _queue_event_notification(event, "popup", "command_center")
    return [get_event(event["id"]) or event for event in created]


def _is_night_market_event(event: dict[str, Any]) -> bool:
    return (
        event["bay"] in NIGHT_MARKET_BAYS
        or event["source"] in NIGHT_MARKET_SOURCES
        or event["id"].startswith(("YS-", "HELP-"))
        and event["title"] in {"夜市现场一键求助", "夜市现场求助"}
    )


def list_events(kind: str | None = None) -> list[dict[str, Any]]:
    init_db()
    with SessionLocal() as session:
        statement = select(SafetyEvent).order_by(SafetyEvent.createdAt.desc())
        if kind:
            statement = statement.where(SafetyEvent.kind == kind)
        rows = session.scalars(statement).all()
        events = [_event_to_dict(row) for row in rows if not (row.meta_json or {}).get("command")]
        project_events = [event for event in events if _is_night_market_event(event)]
        if project_events:
            events = project_events
        for event in events:
            event["timeline"] = _event_logs(session, event["id"])
    return events


def get_event(event_id: str, include_command: bool = False) -> dict[str, Any] | None:
    init_db()
    with SessionLocal() as session:
        row = session.get(SafetyEvent, event_id)
        if not row:
            return None
        if (row.meta_json or {}).get("command") and not include_command:
            return None
        event = _event_to_dict(row)
        event["timeline"] = _event_logs(session, event_id)
        return event


def _reviewed_event_level(review: dict[str, Any], current_level: str) -> str:
    risk_level = str(review.get("riskLevel") or "").strip().lower()
    mapping = {
        "high": "高风险",
        "medium": "中风险",
        "low": "低风险",
        "none": "低风险",
    }
    if risk_level in mapping:
        return mapping[risk_level]
    return current_level


def _dispatch_priority(level: str) -> str:
    return {"高风险": "高", "中风险": "中", "低风险": "低"}.get(level, "观察")


def attach_vision_review(event_id: str, review: dict[str, Any], operator: str | None = None) -> dict[str, Any] | None:
    init_db()
    label = _now_label()
    normalized_review = dict(review)
    normalized_review.setdefault("reviewedAt", datetime.now().isoformat(timespec="seconds"))
    with DB_LOCK, SessionLocal() as session:
        current = session.get(SafetyEvent, event_id)
        if not current:
            return None
        from app.services.command_workflow import assert_legacy_writable
        assert_legacy_writable(current)
        event_before_review = _event_to_dict(current)
        previous_level = current.level
        reviewed_level = _reviewed_event_level(normalized_review, previous_level)
        meta = dict(current.meta_json or {})
        meta["visionReview"] = normalized_review
        if normalized_review.get("configured") is False:
            vision_status = "manual_confirmation"
        else:
            vision_status = "confirmed" if normalized_review.get("isGathering") else "cleared"
        meta["visionReviewStatus"] = vision_status
        meta["dispatchPriority"] = _dispatch_priority(reviewed_level)
        meta["riskAssessment"] = {
            "previousLevel": previous_level,
            "reviewedLevel": reviewed_level,
            "dispatchPriority": meta["dispatchPriority"],
            "reviewStatus": vision_status,
        }
        current.level = reviewed_level
        current.meta_json = meta
        current.updatedAt = label
        current.updatedAtIso = datetime.now().isoformat(timespec="seconds")
        _append_log(
            session,
            event_id,
            "画面复核",
            current.status,
            current.owner,
            operator or "画面复核服务",
            normalized_review.get("sceneSummary") or normalized_review.get("suggestion"),
            {
                "previousStatus": current.status,
                "nextStatus": current.status,
                "previousLevel": previous_level,
                "nextLevel": reviewed_level,
                "dispatchPriority": meta["dispatchPriority"],
                "operationLocation": _event_location(event_before_review),
                "evidenceIndex": _event_evidence_index(event_before_review),
            },
        )
        session.commit()
    return get_event(event_id)


def create_help_event(
    bay: str,
    description: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    contact: str | None = None,
    market_id: str | None = None,
    zone_id: str | None = None,
    risk_type: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    bay = bay.strip()
    if not bay:
        raise ValueError("bay must contain a place or manual address")
    if (latitude is None) != (longitude is None):
        raise ValueError("latitude and longitude must be supplied together")
    if latitude is not None and (
        not isfinite(latitude) or not isfinite(longitude)
        or not -90 <= latitude <= 90 or not -180 <= longitude <= 180
    ):
        raise ValueError("Invalid location coordinates")
    init_db()
    label = _now_label()
    alarm_location = (
        _location(latitude, longitude, bay, "visitor_gps")
        if latitude is not None and longitude is not None
        else None
    )
    event = {
        "id": _new_id("HELP"),
        "kind": "help",
        "title": "夜市现场求助",
        "bay": bay,
        "level": "高风险",
        "source": "夜市平安码",
        "status": "已提交",
        "owner": "指挥中心待派单",
        "distance": "待派单",
        "time": label,
        "updatedAt": label,
        "description": description or "商户或群众已发来夜市点位，请巡防组尽快联系并过去看看。",
        "result": None,
        "anonymous": False,
        "meta": {
            "latitude": latitude,
            "longitude": longitude,
            "contact": contact,
            "evidence": evidence or [],
            "locationSource": "gps" if alarm_location else "manual",
            **(
                {"reporterLocation": alarm_location, "alarmLocation": alarm_location}
                if alarm_location else {"manualLocation": bay}
            ),
        },
    }
    from app.services.security_linkage import normalize_event_context

    event["meta"]["context"] = normalize_event_context(
        {
            "marketId": market_id,
            "zoneId": zone_id,
            "riskType": risk_type,
            "timestamp": event.get("createdAt"),
            "evidence": evidence or [],
        },
        bay=bay,
        title=event["title"],
        description=event["description"],
        alarm_location=alarm_location or {"name": bay, "source": "manual"},
    )
    with DB_LOCK, SessionLocal() as session:
        if alarm_location:
            assignment = _build_assignment(event, session=session)
            event["distance"] = assignment["route"]["distanceLabel"]
            event["meta"]["assignment"] = {key: value for key, value in assignment.items() if key != "route"}
            event["meta"]["route"] = assignment["route"]
        insert_event(session, event)
        _attach_alarm_push(session, event)
        session.commit()
    _queue_event_notification(event, "popup", "command_center")
    _queue_event_notification(event, "wechat", "巡防人员", "待发送")
    try:
        from app.services.security_linkage import link_event_risk

        link_event_risk(event["id"])
    except Exception:
        pass
    return get_event(event["id"]) or event


def create_report_event(
    category: str,
    bay: str,
    description: str,
    anonymous: bool = False,
    contact: str | None = None,
    photo_count: int = 0,
    market_id: str | None = None,
    zone_id: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    init_db()
    label = _now_label()
    high_risk = category in {"街霸滋扰", "寻衅滋事", "打架斗殴", "持械苗头"}
    event = {
        "id": _new_id("RPT"),
        "kind": "report",
        "title": category,
        "bay": bay,
        "level": "高风险" if high_risk else "中风险",
        "source": "匿名上报" if anonymous else "商户/群众上报",
        "status": "已提交",
        "owner": "待分配",
        "distance": "待核实",
        "time": label,
        "updatedAt": label,
        "description": description or f"群众提交了夜市现场问题，随附 {photo_count} 张照片，请巡防人员去看一下。",
        "result": None,
        "anonymous": anonymous,
        "meta": {"contact": None if anonymous else contact, "photoCount": photo_count, "evidence": evidence or []},
    }
    from app.services.security_linkage import normalize_event_context

    event["meta"]["context"] = normalize_event_context(
        {
            "marketId": market_id,
            "zoneId": zone_id,
            "riskType": category,
            "timestamp": event.get("createdAt"),
            "evidence": evidence or [],
        },
        bay=bay,
        title=category,
        description=event["description"],
    )
    with DB_LOCK, SessionLocal() as session:
        insert_event(session, event)
        session.commit()
    _queue_event_notification(event, "popup", "command_center")
    try:
        from app.services.security_linkage import link_event_risk

        link_event_risk(event["id"])
    except Exception:
        pass
    return get_event(event["id"]) or event


def create_lost_event(item_name: str, bay: str, contact: str | None = None) -> dict[str, Any]:
    init_db()
    label = _now_label()
    event = {
        "id": _new_id("LOST"),
        "kind": "lost",
        "title": f"{item_name}线索登记",
        "bay": bay,
        "level": "低风险",
        "source": "遗失/扒窃线索",
        "status": "已提交",
        "owner": "值守组",
        "distance": "指挥室",
        "time": label,
        "updatedAt": label,
        "description": "群众提交了遗失物品或疑似扒窃线索，等工作人员核验。",
        "result": None,
        "anonymous": False,
        "meta": {"contact": contact},
    }
    with DB_LOCK, SessionLocal() as session:
        insert_event(session, event)
        session.commit()
    _queue_event_notification(event, "popup", "command_center")
    return get_event(event["id"]) or event


def list_alarm_pushes(event_id: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    init_db()
    with SessionLocal() as session:
        statement = select(AlarmPush).order_by(AlarmPush.createdAt.desc(), AlarmPush.id.desc())
        if event_id:
            statement = statement.where(AlarmPush.eventId == event_id)
        if status:
            statement = statement.where(AlarmPush.status == status)
        rows = session.scalars(statement).all()
        return [_alarm_push_to_dict(row) for row in rows]


def acknowledge_alarm_push(push_id: str, operator: str | None = None) -> dict[str, Any] | None:
    init_db()
    now_iso = datetime.now().isoformat(timespec="seconds")
    with DB_LOCK, SessionLocal() as session:
        push = session.get(AlarmPush, push_id)
        if not push:
            return None
        push.status = "已确认"
        push.acknowledgedAt = now_iso
        session.commit()
        return _alarm_push_to_dict(push)


def update_event(
    event_id: str,
    status: str,
    owner: str | None = None,
    result: str | None = None,
    operator: str | None = None,
) -> dict[str, Any] | None:
    init_db()
    if status not in STATUS_FLOW:
        raise ValueError(f"Unsupported status: {status}")

    label = _now_label()
    with DB_LOCK, SessionLocal() as session:
        current = session.get(SafetyEvent, event_id)
        if not current:
            return None
        from app.services.command_workflow import assert_legacy_writable
        assert_legacy_writable(current)
        previous_status = current.status
        next_owner = owner or current.owner
        current.status = status
        current.owner = next_owner
        current.result = result if result is not None else current.result
        current.updatedAt = label
        current.updatedAtIso = datetime.now().isoformat(timespec="seconds")
        action = "完成事件" if status == "已完成" else ("派发工单" if status == "已派单" else "更新状态")
        event_for_audit = _event_to_dict(current)
        _append_log(
            session,
            event_id,
            action,
            status,
            next_owner,
            operator or "巡防人员端",
            result or f"状态由 {previous_status} 更新为 {status}",
            {
                "previousStatus": previous_status,
                "nextStatus": status,
                "operationLocation": _event_location(event_for_audit),
                "evidenceIndex": _event_evidence_index(event_for_audit),
                "result": current.result,
            },
        )
        session.commit()
    if status == "已完成":
        try:
            from app.services.security_ops import queue_notification

            queue_notification(
                event_id,
                "popup",
                "command_center",
                "事件已完成",
                result or "事件已完成",
                "已发送",
                {"source": "event_store", "status": status},
            )
        except Exception:
            pass
    return get_event(event_id)


def assign_event(event_id: str, staff: str, operator: str | None = None) -> dict[str, Any] | None:
    init_db()
    staff_id = _staff_key(staff)
    if not staff_id:
        raise ValueError(f"Unsupported staff: {staff}")

    label = _now_label()
    with DB_LOCK, SessionLocal() as session:
        current = session.get(SafetyEvent, event_id)
        if not current:
            return None
        from app.services.command_workflow import assert_legacy_writable
        assert_legacy_writable(current)
        event = _event_to_dict(current)
        assignment = _build_assignment(event, staff_id, session)
        route = assignment["route"]
        dispatch_note = (
            f"已派给{assignment['staffName']}，推荐{route['modeLabel']}，预计{route['etaLabel']}"
            if route else f"已派给{assignment['staffName']}，手动地点待核实，暂未生成路线。"
        )
        meta = dict(current.meta_json or {})
        meta["assignment"] = {key: value for key, value in assignment.items() if key != "route"}
        if route:
            meta["route"] = route
            meta["alarmLocation"] = route["destination"]
        else:
            meta.pop("route", None)
            meta.pop("alarmLocation", None)
            meta["assignment"]["reason"] = "按指挥员指定人员派单，手动地点待核实"
        current.status = "已派单"
        current.owner = assignment["staffName"]
        current.distance = route["distanceLabel"] if route else "地点待核实"
        current.meta_json = meta
        current.updatedAt = label
        current.updatedAtIso = datetime.now().isoformat(timespec="seconds")
        previous_status = event["status"]
        _append_log(
            session,
            event_id,
            "派发工单",
            current.status,
            current.owner,
            operator or "指挥中心",
            dispatch_note,
            {
                "previousStatus": previous_status,
                "nextStatus": current.status,
                "operationLocation": route["destination"] if route else _event_location(event),
                "evidenceIndex": _event_evidence_index(event),
                "assignment": {
                    "staffId": assignment["staffId"],
                    "staffName": assignment["staffName"],
                    "load": next(item["load"] for item in assignment["candidates"] if item["staffId"] == assignment["staffId"]),
                },
            },
        )
        push = session.scalars(
            select(AlarmPush).where(AlarmPush.eventId == event_id).order_by(AlarmPush.createdAt.desc(), AlarmPush.id.desc())
        ).first()
        if push:
            push.status = "已确认"
            push.acknowledgedAt = datetime.now().isoformat(timespec="seconds")
        session.commit()
    try:
        from app.services.security_ops import queue_notification

        queue_notification(
            event_id,
            "popup",
            assignment["staffId"],
            event["title"],
            dispatch_note,
            "已发送",
            {"source": "event_store", "kind": event["kind"]},
        )
    except Exception:
        pass
    return get_event(event_id)


def list_staff() -> list[dict[str, Any]]:
    init_db()
    with SessionLocal() as session:
        rows = session.scalars(select(PatrolStaff).order_by(PatrolStaff.id.asc())).all()
        return [_staff_to_dict(row) for row in rows]


def update_staff_location(
    staff: str,
    latitude: float,
    longitude: float,
    accuracy: float | None = None,
) -> dict[str, Any]:
    staff_id = _staff_key(staff)
    if not staff_id:
        raise ValueError(f"Unsupported staff: {staff}")
    now_iso = datetime.now().isoformat(timespec="seconds")
    STAFF_LOCATIONS[staff_id] = {
        "latitude": latitude,
        "longitude": longitude,
        "accuracy": accuracy,
        "updatedAt": now_iso,
    }
    init_db()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(PatrolStaff, staff_id)
        if not row:
            _seed_staff(session)
            row = session.get(PatrolStaff, staff_id)
        if not row:
            raise ValueError(f"Unsupported staff: {staff}")
        row.latitude = latitude
        row.longitude = longitude
        row.accuracy = accuracy
        row.online = True
        row.updatedAt = now_iso
        session.commit()
        return _staff_to_dict(row)


def list_staff_tasks(staff: str) -> list[dict[str, Any]]:
    staff_id = _staff_key(staff)
    if not staff_id:
        raise ValueError(f"Unsupported staff: {staff}")
    init_db()
    with SessionLocal() as session:
        row = session.get(PatrolStaff, staff_id)
        staff_name = row.name if row else STAFF_ROSTER[staff_id]["name"]
    return [
        event
        for event in list_events()
        if event["owner"] == staff_name
        or (
            event["status"] != "已提交"
            and (event.get("meta") or {}).get("assignment", {}).get("staffId") == staff_id
        )
    ]


def recommend_route(
    event_id: str,
    staff: str,
    latitude: float | None = None,
    longitude: float | None = None,
    accuracy: float | None = None,
) -> dict[str, Any] | None:
    staff_id = _staff_key(staff)
    if not staff_id:
        raise ValueError(f"Unsupported staff: {staff}")
    from app.services.command_workflow import is_command
    if is_command(event_id):
        raise ValueError("接处警事件请使用只读路线预览")
    if latitude is not None and longitude is not None:
        update_staff_location(staff_id, latitude, longitude, accuracy)

    label = _now_label()
    with DB_LOCK, SessionLocal() as session:
        current = session.get(SafetyEvent, event_id)
        if not current:
            return None
        staff_row = session.get(PatrolStaff, staff_id)
        staff_name = staff_row.name if staff_row else STAFF_ROSTER[staff_id]["name"]
        staff_role = staff_row.role if staff_row else STAFF_ROSTER[staff_id]["role"]
        event = _event_to_dict(current)
        route = _build_route(_staff_location(staff_id, session), _event_location(event), staff_id, session)
        meta = dict(current.meta_json or {})
        meta["route"] = route
        assignment = dict(meta.get("assignment") or {})
        assignment.update(
            {
                "staffId": staff_id,
                "staffName": staff_name,
                "role": staff_role,
                "assignedAt": assignment.get("assignedAt") or datetime.now().isoformat(timespec="seconds"),
                "reason": assignment.get("reason") or "按实时距离与可用交通方式推荐",
            }
        )
        meta["assignment"] = assignment
        current.owner = staff_name
        current.distance = route["distanceLabel"]
        current.meta_json = meta
        current.updatedAt = label
        current.updatedAtIso = datetime.now().isoformat(timespec="seconds")
        session.commit()
    return get_event(event_id)


def supplement_event(event_id: str, text: str, evidence: list[dict[str, Any]] | None = None) -> dict[str, Any] | None:
    init_db()
    label = _now_label()
    with DB_LOCK, SessionLocal() as session:
        current = session.get(SafetyEvent, event_id)
        if not current:
            return None
        from app.services.command_workflow import assert_legacy_writable
        assert_legacy_writable(current)
        text = text.strip()
        meta = dict(current.meta_json or {})
        context = dict(meta.get("context") or {})
        combined = [*(meta.get("evidence") or []), *(context.get("evidence") or [])]
        seen = {item.get("url") for item in combined if isinstance(item, dict) and item.get("url")}
        added = []
        for item in evidence or []:
            if item.get("url") and item["url"] not in seen:
                added.append(dict(item))
                seen.add(item["url"])
        if added:
            # Reassign JSON values so SQLAlchemy persists both evidence indexes.
            indexed = []
            indexed_urls = set()
            for item in [*combined, *added]:
                url = item.get("url") if isinstance(item, dict) else None
                if url and url in indexed_urls:
                    continue
                if url:
                    indexed_urls.add(url)
                indexed.append(item)
            meta["evidence"] = indexed
            context["evidence"] = indexed
            meta["context"] = context
            current.meta_json = meta
        if not text and not added:
            return _event_to_dict(current) | {"timeline": _event_logs(session, event_id)}
        if text:
            current.description = f"{current.description} 补充：{text}"
        current.updatedAt = label
        current.updatedAtIso = datetime.now().isoformat(timespec="seconds")
        _append_log(
            session,
            event_id,
            "补充说明",
            current.status,
            current.owner,
            "事件补充接口",
            text or f"新增 {len(added)} 项证据",
            {
                "operationLocation": _event_location(_event_to_dict(current)),
                "evidenceIndex": _event_evidence_index(_event_to_dict(current)),
                "addedEvidence": added,
            },
        )
        session.commit()
    if added:
        try:
            from app.services.security_linkage import link_event_risk

            link_event_risk(event_id)
        except Exception:
            # Derived risk refresh must not invalidate committed evidence.
            pass
    return get_event(event_id)


def list_night_markets() -> list[dict[str, Any]]:
    init_db()
    with SessionLocal() as session:
        rows = session.scalars(select(Market).order_by(Market.marketId.asc())).all()
        if rows:
            return [
                {
                    "id": row.marketId,
                    "name": row.name,
                    "district": row.district or "",
                    "address": row.address or "",
                    "latitude": row.latitude,
                    "longitude": row.longitude,
                    "tone": (row.meta_json or {}).get("tone", "safe"),
                    "summary": (row.meta_json or {}).get("summary", ""),
                    "source": (row.meta_json or {}).get("source", "后端管理台"),
                }
                for row in rows
            ]
    return []


def _average_response_minutes(session: Session, events: list[dict[str, Any]]) -> float | None:
    event_created_at = {
        event["id"]: _parse_iso(event.get("createdAt"))
        for event in events
    }
    if not event_created_at:
        return None
    response_statuses = {"已派单", "已接收", "已到达", "处理中", "已完成"}
    response_logs = session.scalars(
        select(EventAuditLog)
        .where(EventAuditLog.eventId.in_(event_created_at.keys()))
        .where(EventAuditLog.status.in_(response_statuses))
        .order_by(EventAuditLog.createdAt.asc(), EventAuditLog.id.asc())
    ).all()
    first_response: dict[str, datetime] = {}
    for log in response_logs:
        created = event_created_at.get(log.eventId)
        responded = _parse_iso(log.createdAt)
        if not created or not responded or responded < created or log.eventId in first_response:
            continue
        first_response[log.eventId] = responded
    if not first_response:
        return None

    minutes = [
        max(0, (responded - event_created_at[event_id]).total_seconds() / 60)
        for event_id, responded in first_response.items()
        if event_created_at[event_id]
    ]
    if not minutes:
        return None
    return round(sum(minutes) / len(minutes), 1)


def overview() -> dict[str, Any]:
    events = list_events()
    staff = list_staff()
    alarm_pushes = list_alarm_pushes()
    security_model = status_summary(refresh_from_files=False)
    try:
        from app.services.security_ops import summary as security_ops_summary

        ops = dict(security_ops_summary())
        # This overview is public; archive records stay behind the admin routes.
        ops.pop("identityProfiles", None)
        identity = ops.get("identity") or {}
        ops["identity"] = {
            key: identity[key] for key in ("profiles", "tracks", "locks") if key in identity
        } | {"items": []}
    except Exception:
        ops = {}
    try:
        from app.services.security_linkage import overview as linkage_overview

        linkage = linkage_overview()
    except Exception:
        linkage = {"stats": {}, "risks": [], "devices": [], "droneTasks": []}
    open_events = [event for event in events if event["status"] != "已完成"]
    urgent = [event for event in events if event["level"] == "高风险"]
    closed = [event for event in events if event["status"] == "已完成"]
    with SessionLocal() as session:
        avg_response_minutes = _average_response_minutes(session, events)
    return {
        "project": "小安智能预警系统",
        "subtitle": "夜市商圈值守台",
        "stats": {
            "today_events": len(events),
            "pending_orders": len(open_events),
            "online_staff": len([item for item in staff if item["online"]]),
            "avg_response_minutes": avg_response_minutes,
            "completion_rate": round((len(closed) / len(events)) * 100) if events else 0,
            "urgent_events": len(urgent),
        },
        "events": events,
        "alarm_pushes": alarm_pushes,
        "night_markets": list_night_markets(),
        "patrol_staff": staff,
        "security_model": security_model,
        "security_ops": ops,
        "linkage": linkage,
        "ai_copilot": {
            "skills": [
                {
                    "name": item["name"],
                    "status": item["status"],
                    "trigger": item["trigger"],
                    "confidence": item["confidence"],
                }
                for item in ops.get("skills", [])
            ],
            "agents": [
                {
                    "name": item["name"],
                    "status": item["status"],
                    "currentTask": item["currentTask"],
                    "latency": item["latency"],
                }
                for item in ops.get("agents", [])
            ],
            "mcp_connectors": [],
            "playbook": [
                "视频行为检测会进入指挥中心推送队列，并按点位推荐附近巡防组。",
                "滋扰和打架苗头优先派给附近巡防组，同时发到巡防人员小程序。",
                "处理超过 10 分钟的事件会在指挥台提醒。",
                "已完成事件会保留处理记录，方便后面回看高发点。",
            ],
            "actions": [
                {
                    "title": "就近派发",
                    "detail": f"当前 {len(urgent)} 个高风险点，建议先派附近在线人员。",
                    "tone": "danger" if urgent else "info",
                },
                {
                    "title": "数据已更新",
                    "detail": f"小程序、指挥端和后台当前共用 {len(events)} 条夜市事件记录。",
                    "tone": "success",
                },
                {
                    "title": "检测已接入",
                    "detail": f"已读取 {security_model['detections']['total']} 条视频检测结果。",
                    "tone": "success" if security_model["configured"] else "info",
                },
                {
                    "title": "记录可回看",
                    "detail": f"{len(closed)} 条已完成记录可用于后续回看。",
                    "tone": "info",
                },
            ],
        },
    }
