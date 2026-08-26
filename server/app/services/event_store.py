from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import EventAuditLog, SafetyEvent


STATUS_FLOW = ["已提交", "已派单", "已接收", "已到达", "处理中", "已完成"]

SEED_EVENTS = [
    {
        "id": "YS-260815-001",
        "kind": "report",
        "title": "烧烤摊前多人推搡",
        "bay": "三号门夜食街",
        "level": "中风险",
        "source": "AI视频预警",
        "status": "已接收",
        "owner": "李敏",
        "distance": "180m",
        "time": "21:08",
        "updatedAt": "21:10",
        "description": "AI识别到摊位前多人聚集推搡，疑似酒后消费纠纷升级，请附近巡防组先期劝阻。",
        "result": None,
        "anonymous": False,
        "meta": {
            "device": "AI-CAM-03",
            "scene": "夜市秩序",
            "eventType": "conflict",
            "sourceType": "fixed_camera",
            "model": "YOLOv8 Pose + 多模态复核",
            "evidence": ["关键帧", "15秒回放", "人员轨迹"],
        },
    },
    {
        "id": "YS-260815-002",
        "kind": "help",
        "title": "商户一键求助：疑似街霸滋扰",
        "bay": "主街烧烤区",
        "level": "高风险",
        "source": "夜市平安码",
        "status": "已到达",
        "owner": "王队",
        "distance": "90m",
        "time": "21:22",
        "updatedAt": "21:25",
        "description": "商户通过夜市平安码上报，两名醉酒人员拍打桌椅、威胁摊主，现场有围观聚集风险。",
        "result": None,
        "anonymous": False,
        "meta": {
            "device": "商户平安码",
            "scene": "街霸滋扰",
            "eventType": "manual_alarm",
            "sourceType": "mini_program",
            "reporterRole": "商户",
            "evidence": ["报警定位", "商户备注", "附近摄像头抓拍"],
        },
    },
    {
        "id": "YS-260815-003",
        "kind": "lost",
        "title": "粉色手机疑似扒窃",
        "bay": "三号门夜食街",
        "level": "低风险",
        "source": "群众报警",
        "status": "已完成",
        "owner": "研判组",
        "distance": "指挥室",
        "time": "20:48",
        "updatedAt": "21:06",
        "description": "群众报警称手机在夜市三号门附近遗失，研判组通过轨迹比对锁定疑似扒窃人员。",
        "result": "已完成视频轨迹复盘，嫌疑目标交由处置组跟进。",
        "anonymous": False,
        "meta": {
            "device": "雪亮工程+鹰眼检索",
            "scene": "扒窃研判",
            "eventType": "key_person_enter",
            "sourceType": "watchlist",
            "model": "人脸/ReID检索",
            "evidence": ["入口抓拍", "轨迹片段", "人工复核记录"],
        },
    },
    {
        "id": "YS-260815-004",
        "kind": "report",
        "title": "机器狗巡防发现高声争执",
        "bay": "啤酒广场",
        "level": "中风险",
        "source": "机器狗巡防",
        "status": "已派单",
        "owner": "陈安",
        "distance": "120m",
        "time": "21:31",
        "updatedAt": "21:32",
        "description": "机器狗前置摄像头和麦克风同时发现多人高声争执，声压和围观人数超过巡防阈值，建议附近队员靠近核验。",
        "result": None,
        "anonymous": False,
        "meta": {
            "device": "ROBOT-DOG-01",
            "scene": "多模态巡防",
            "eventType": "argument",
            "sourceType": "robot_dog",
            "patrolTaskId": "PATROL-260815-NIGHT",
            "model": "视觉姿态 + 音频声压 + VLM描述",
            "evidence": ["前置摄像头", "音频摘要", "巡防坐标"],
        },
    },
    {
        "id": "YS-260815-005",
        "kind": "report",
        "title": "重点关注人员进入东入口",
        "bay": "商户服务站",
        "level": "高风险",
        "source": "重点人员库",
        "status": "已接收",
        "owner": "研判组",
        "distance": "指挥室",
        "time": "21:34",
        "updatedAt": "21:34",
        "description": "入口摄像头命中后台重点关注人员库，系统已生成高优先级关注事件，等待人工复核后联动现场巡防。",
        "result": None,
        "anonymous": False,
        "meta": {
            "device": "FACE-GATE-01",
            "scene": "重点人员进入",
            "eventType": "key_person_enter",
            "sourceType": "watchlist",
            "matchScore": 91,
            "model": "人脸识别 + 多帧确认",
            "evidence": ["入口抓拍", "库内命中记录", "复核任务"],
        },
    },
]

NIGHT_MARKET_BAYS = {
    "主街烧烤区",
    "三号门夜食街",
    "后巷摊位区",
    "停车场入口",
    "啤酒广场",
    "亲子餐饮区",
    "商户服务站",
}

NIGHT_MARKET_SOURCES = {
    "AI视频预警",
    "夜市平安码",
    "群众报警",
    "商户/群众上报",
    "匿名上报",
    "遗失/扒窃线索",
}

NIGHT_MARKETS = [
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
        "summary": "传统小吃老街，适合纳入老城夜间巡防网格。",
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
        "summary": "老城夜宵与小吃点位，适合与珠宝街联动巡查。",
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
        "summary": "商场周边夜市街，适合关注停车、人流导入和商户求助。",
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
        "summary": "景区型夜游夜市，适合文旅、停车和景区安保联动。",
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
        "summary": "青云谱夜间消费街区，适合纳入辖区夜巡线路。",
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
        "summary": "红谷滩居住区与办公区交界夜宵点，适合晚间巡逻覆盖。",
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
        "summary": "艾溪湖片区夜间消费点，适合与湖区商圈联勤。",
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
        "summary": "瑶湖东向美食街，适合夜间外卖骑手和摊点秩序治理。",
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
        "summary": "县区社区型夜市街，适合接入属地巡防与城管联动。",
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
        "summary": "中心城区夜间潮玩消费点，适合与八一广场周边安保联动。",
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


def _now_label() -> str:
    return datetime.now().strftime("%H:%M")


def _new_id(prefix: str = "JT") -> str:
    return f"{prefix}-{datetime.now().strftime('%y%m%d-%H%M%S-%f')[:20]}"


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


def _log_to_dict(log: EventAuditLog) -> dict[str, Any]:
    return {
        "id": log.id,
        "eventId": log.eventId,
        "action": log.action,
        "operator": log.operator,
        "status": log.status,
        "owner": log.owner,
        "note": log.note,
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
) -> None:
    now = datetime.now()
    session.add(
        EventAuditLog(
            eventId=event_id,
            action=action,
            operator=operator,
            status=status,
            owner=owner,
            note=note,
            time=now.strftime("%H:%M"),
            createdAt=now.isoformat(timespec="seconds"),
        )
    )


def init_db() -> None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        count = session.scalar(select(func.count()).select_from(SafetyEvent)) or 0
        if count == 0:
            for item in SEED_EVENTS:
                insert_event(session, item)
            session.commit()

        existing_ids = set(session.scalars(select(SafetyEvent.id)).all())
        missing_seed_events = [item for item in SEED_EVENTS if item["id"] not in existing_ids]
        if missing_seed_events:
            for item in missing_seed_events:
                insert_event(session, item)
            session.commit()

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
    )
    return payload


def _is_night_market_event(event: dict[str, Any]) -> bool:
    return (
        event["bay"] in NIGHT_MARKET_BAYS
        or event["source"] in NIGHT_MARKET_SOURCES
        or event["id"].startswith(("YS-", "HELP-"))
        and event["title"] == "夜市现场一键求助"
    )


def list_events(kind: str | None = None) -> list[dict[str, Any]]:
    init_db()
    with SessionLocal() as session:
        statement = select(SafetyEvent).order_by(SafetyEvent.createdAt.desc())
        if kind:
            statement = statement.where(SafetyEvent.kind == kind)
        rows = session.scalars(statement).all()
        events = [_event_to_dict(row) for row in rows]
        project_events = [event for event in events if _is_night_market_event(event)]
        if project_events:
            events = project_events
        for event in events:
            event["timeline"] = _event_logs(session, event["id"])
    return events


def get_event(event_id: str) -> dict[str, Any] | None:
    init_db()
    with SessionLocal() as session:
        row = session.get(SafetyEvent, event_id)
        if not row:
            return None
        event = _event_to_dict(row)
        event["timeline"] = _event_logs(session, event_id)
        return event


def create_help_event(
    bay: str,
    description: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    contact: str | None = None,
) -> dict[str, Any]:
    init_db()
    label = _now_label()
    event = {
        "id": _new_id("HELP"),
        "kind": "help",
        "title": "夜市现场一键求助",
        "bay": bay,
        "level": "高风险",
        "source": "夜市平安码",
        "status": "已派单",
        "owner": "最近巡防组",
        "distance": "待定位",
        "time": label,
        "updatedAt": label,
        "description": description or "商户或群众已同步夜市点位，请巡防组尽快联系并前往核实。",
        "result": None,
        "anonymous": False,
        "meta": {"latitude": latitude, "longitude": longitude, "contact": contact},
    }
    with DB_LOCK, SessionLocal() as session:
        insert_event(session, event)
        session.commit()
    return get_event(event["id"]) or event


def create_report_event(
    category: str,
    bay: str,
    description: str,
    anonymous: bool = False,
    contact: str | None = None,
    photo_count: int = 0,
) -> dict[str, Any]:
    init_db()
    label = _now_label()
    high_risk = category in {"街霸滋扰", "打架斗殴", "持械苗头"}
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
        "description": description or f"群众提交了夜市现场问题，随附 {photo_count} 张照片，请巡防人员核实。",
        "result": None,
        "anonymous": anonymous,
        "meta": {"contact": None if anonymous else contact, "photoCount": photo_count},
    }
    with DB_LOCK, SessionLocal() as session:
        insert_event(session, event)
        session.commit()
    return get_event(event["id"]) or event


def create_lost_event(item_name: str, bay: str = "三号门夜食街", contact: str | None = None) -> dict[str, Any]:
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
        "owner": "研判组",
        "distance": "指挥室",
        "time": label,
        "updatedAt": label,
        "description": "群众提交遗失物品或疑似扒窃线索，等待研判组核验。",
        "result": None,
        "anonymous": False,
        "meta": {"contact": contact},
    }
    with DB_LOCK, SessionLocal() as session:
        insert_event(session, event)
        session.commit()
    return get_event(event["id"]) or event


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
        previous_status = current.status
        next_owner = owner or current.owner
        current.status = status
        current.owner = next_owner
        current.result = result if result is not None else current.result
        current.updatedAt = label
        current.updatedAtIso = datetime.now().isoformat(timespec="seconds")
        action = "闭环事件" if status == "已完成" else ("派发工单" if status == "已派单" else "更新状态")
        _append_log(
            session,
            event_id,
            action,
            status,
            next_owner,
            operator or "巡防人员端",
            result or f"状态由 {previous_status} 更新为 {status}",
        )
        session.commit()
    return get_event(event_id)


def supplement_event(event_id: str, text: str) -> dict[str, Any] | None:
    init_db()
    label = _now_label()
    with DB_LOCK, SessionLocal() as session:
        current = session.get(SafetyEvent, event_id)
        if not current:
            return None
        current.description = f"{current.description} 补充：{text}"
        current.updatedAt = label
        current.updatedAtIso = datetime.now().isoformat(timespec="seconds")
        _append_log(
            session,
            event_id,
            "补充说明",
            current.status,
            current.owner,
            "指挥中心",
            text,
        )
        session.commit()
    return get_event(event_id)


def list_night_markets() -> list[dict[str, Any]]:
    return NIGHT_MARKETS


def overview() -> dict[str, Any]:
    events = list_events()
    open_events = [event for event in events if event["status"] != "已完成"]
    urgent = [event for event in events if event["level"] == "高风险"]
    closed = [event for event in events if event["status"] == "已完成"]
    return {
        "project": "夜市智防",
        "subtitle": "夜市商圈数智安全指挥舱",
        "stats": {
            "today_events": len(events),
            "pending_orders": len(open_events),
            "online_staff": 18,
            "avg_response_minutes": 2.1,
            "completion_rate": round((len(closed) / len(events)) * 100) if events else 0,
            "urgent_events": len(urgent),
        },
        "events": events,
        "night_markets": list_night_markets(),
        "patrol_staff": ["王队", "李敏", "陈安", "义警联络员"],
        "ai_copilot": {
            "skills": [
                {
                    "name": "风险研判 Skill",
                    "status": "运行中",
                    "trigger": "街霸滋扰、斗殴苗头自动置顶",
                    "confidence": 92,
                },
                {
                    "name": "派单建议 Skill",
                    "status": "运行中",
                    "trigger": "按商圈网格、距离与警力负载推荐",
                    "confidence": 88,
                },
                {
                    "name": "复盘归档 Skill",
                    "status": "待确认",
                    "trigger": "闭环后生成审计摘要",
                    "confidence": 76,
                },
            ],
            "agents": [
                {
                    "name": "Dispatch Agent",
                    "status": "active",
                    "currentTask": "扫描未闭环风险并推荐处置力量",
                    "latency": "188ms",
                },
                {
                    "name": "Patrol Agent",
                    "status": "active",
                    "currentTask": "同步巡防组与商户端状态流转",
                    "latency": "212ms",
                },
                {
                    "name": "Audit Agent",
                    "status": "idle",
                    "currentTask": "等待闭环事件生成复核记录",
                    "latency": "待触发",
                },
            ],
            "mcp_connectors": [
                {
                    "name": "事件库 MCP",
                    "status": "connected",
                    "scope": "database night_market_events / audit_logs",
                    "lastSync": _now_label(),
                },
                {
                    "name": "小程序 MCP",
                    "status": "connected",
                    "scope": "商户求助、群众上报、巡防任务",
                    "lastSync": _now_label(),
                },
                {
                    "name": "指挥台 MCP",
                    "status": "connected",
                    "scope": "预警、派单、处置、复盘闭环",
                    "lastSync": _now_label(),
                },
            ],
            "playbook": [
                "街霸滋扰和打架苗头优先派给最近巡防组，并同步巡防人员小程序。",
                "处理中超过 10 分钟的事件进入指挥台提醒队列。",
                "已完成事件由后台生成复盘摘要，沉淀夜市热力点。",
            ],
            "actions": [
                {
                    "title": "建议就近派发",
                    "detail": f"当前 {len(urgent)} 个高风险点，优先分配王队或李敏。",
                    "tone": "danger" if urgent else "info",
                },
                {
                    "title": "数据已对齐",
                    "detail": f"小程序、指挥端、后台共享 {len(events)} 条夜市事件记录。",
                    "tone": "success",
                },
                {
                    "title": "复盘任务待生成",
                    "detail": f"{len(closed)} 条闭环记录可进入审计摘要。",
                    "tone": "info",
                },
            ],
        },
    }
