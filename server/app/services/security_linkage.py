from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import Device, DroneTask, EventAuditLog, Market, RiskRecord, SafetyEvent, Zone


DEVICE_TYPES = {"camera", "robot_dog", "thermal", "drone"}
RISK_WINDOW_MINUTES = 30
PRIMARY_MARKET_ID = "NC-NM-001"
PRIMARY_ZONE_ID = "NC-NM-001-Z1"


def _now() -> datetime:
    return datetime.now()


def _now_iso() -> str:
    return _now().isoformat(timespec="seconds")


def _unique(values: list[str]) -> list[str]:
    return sorted({value for value in values if value})


def _as_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _as_timestamp(value: Any) -> str:
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).isoformat(timespec="seconds")
        except ValueError:
            pass
    return _now_iso()


def _parse_timestamp(value: Any) -> datetime:
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return _now()


def _risk_type(value: str | None) -> str:
    text = (value or "").strip()
    if any(keyword in text for keyword in ("打架", "斗殴", "纠纷", "冲突", "滋扰")):
        return "打架"
    if any(keyword in text for keyword in ("聚集", "拥挤", "客流")):
        return "人员聚集"
    if "跌倒" in text:
        return "跌倒"
    if "越界" in text:
        return "越界"
    if "离岗" in text:
        return "离岗"
    return text or "现场求助"


def _title_for_risk(risk_type: str) -> str:
    titles = {
        "打架": "跨夜市纠纷联防预警",
        "人员聚集": "跨夜市客流风险预警",
        "跌倒": "跨夜市跌倒事件预警",
        "越界": "跨夜市越界风险预警",
        "离岗": "跨夜市离岗风险预警",
    }
    return titles.get(risk_type, f"跨夜市{risk_type}预警")


def _level_for_score(score: float) -> str:
    if score >= 90:
        return "高风险"
    if score >= 45:
        return "中风险"
    return "低风险"


def _default_zone_name(market_name: str) -> str:
    return f"{market_name}核心巡查区"


def _market_data() -> list[dict[str, Any]]:
    from app.services.event_store import list_night_markets

    return list_night_markets()


def _bootstrap_market_data() -> list[dict[str, Any]]:
    from app.services.event_store import bootstrap_night_markets

    return bootstrap_night_markets()


def ensure_linkage_defaults() -> None:
    init_database()
    now_iso = _now_iso()
    zone_names = {
        "NC-NM-001": "绳金塔主街巡逻线",
        "NC-NM-002": "蛤蟆街北口",
    }
    with DB_LOCK, SessionLocal() as session:
        market_items = _bootstrap_market_data()
        known_market_ids = {item["id"] for item in market_items}
        market_rows = session.scalars(select(Market).order_by(Market.marketId.asc())).all()
        market_items.extend(
            {
                "id": row.marketId,
                "name": row.name,
                "district": row.district,
                "address": row.address,
                "latitude": row.latitude,
                "longitude": row.longitude,
                "tone": (row.meta_json or {}).get("tone"),
                "summary": (row.meta_json or {}).get("summary"),
            }
            for row in market_rows
            if row.marketId not in known_market_ids
        )
        for item in market_items:
            market_id = item["id"]
            row = session.get(Market, market_id)
            if row is None:
                session.add(
                    Market(
                        marketId=market_id,
                        name=item["name"],
                        district=item.get("district"),
                        address=item.get("address"),
                        latitude=item.get("latitude"),
                        longitude=item.get("longitude"),
                        status="运行中",
                        meta_json={"tone": item.get("tone"), "summary": item.get("summary")},
                        createdAt=now_iso,
                        updatedAt=now_iso,
                    )
                )

        session.flush()

        for item in market_items:
            market_id = item["id"]
            zone_id = f"{market_id}-Z1"
            zone = session.get(Zone, zone_id)
            if zone is None:
                session.add(
                    Zone(
                        zoneId=zone_id,
                        marketId=market_id,
                        name=zone_names.get(market_id, _default_zone_name(item["name"])),
                        latitude=item.get("latitude"),
                        longitude=item.get("longitude"),
                        boundary_json={"aliases": [item["name"], zone_names.get(market_id, "")]},
                        createdAt=now_iso,
                        updatedAt=now_iso,
                    )
                )

        session.flush()

        default_devices = [
            {
                "deviceId": "camera-nc-001",
                "marketId": "NC-NM-001",
                "zoneId": "NC-NM-001-Z1",
                "deviceType": "camera",
                "name": "绳金塔固定摄像头",
                "capabilities": ["video", "crowd", "behavior"],
            },
            {
                "deviceId": "robotdog-nc-001",
                "marketId": "NC-NM-001",
                "zoneId": "NC-NM-001-Z1",
                "deviceType": "robot_dog",
                "name": "机器狗移动巡查",
                "capabilities": ["video", "patrol", "speaker"],
            },
            {
                "deviceId": "thermal-nc-001",
                "marketId": "NC-NM-001",
                "zoneId": "NC-NM-001-Z1",
                "deviceType": "thermal",
                "name": "热成像巡查单元",
                "capabilities": ["thermal", "crowd"],
            },
            {
                "deviceId": "drone-nc-001",
                "marketId": "NC-NM-001",
                "zoneId": "NC-NM-001-Z1",
                "deviceType": "drone",
                "name": "联动无人机",
                "capabilities": ["aerial_video", "speaker", "waypoint"],
            },
        ]
        for item in default_devices:
            row = session.get(Device, item["deviceId"])
            if row is None:
                capabilities = item["capabilities"]
                session.add(
                    Device(
                        deviceId=item["deviceId"],
                        marketId=item["marketId"],
                        zoneId=item["zoneId"],
                        deviceType=item["deviceType"],
                        name=item["name"],
                        status="模拟在线",
                        capabilities_json=capabilities,
                        config_json={"mode": "simulated"},
                        lastSeenAt=now_iso,
                        createdAt=now_iso,
                        updatedAt=now_iso,
                    )
                )
        session.commit()


def _market_from_location(location: dict[str, Any] | None, fallback_name: str = "") -> str:
    text = " ".join(
        str(value)
        for value in (
            fallback_name,
            (location or {}).get("name"),
            (location or {}).get("label"),
        )
        if value
    )
    for item in _market_data():
        aliases = {item["name"], item["name"].replace("夜市", ""), item["name"].replace("美食街", "")}
        if any(alias and alias in text for alias in aliases):
            return item["id"]
    return PRIMARY_MARKET_ID


def _normalize_evidence(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for entry in value:
        if isinstance(entry, str) and entry:
            items.append({"kind": "link", "url": entry})
        elif isinstance(entry, dict):
            item = {key: entry[key] for key in ("kind", "url", "name", "mimeType", "size") if entry.get(key) is not None}
            if item:
                items.append(item)
    return items


def normalize_event_context(
    raw: dict[str, Any] | None = None,
    *,
    bay: str = "",
    title: str = "",
    description: str = "",
    alarm_location: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw = raw or {}
    location = raw.get("location") if isinstance(raw.get("location"), dict) else alarm_location or {}
    market_id = str(raw.get("marketId") or _market_from_location(location, bay))
    zone_id = str(raw.get("zoneId") or f"{market_id}-Z1")
    if raw.get("riskType"):
        risk_value = str(raw.get("riskType"))
    elif title and "求助" in title:
        risk_value = str(description or title)
    else:
        risk_value = str(title or description)
    return {
        "marketId": market_id,
        "zoneId": zone_id,
        "deviceId": raw.get("deviceId"),
        "deviceType": raw.get("deviceType"),
        "cameraId": raw.get("cameraId"),
        "thermalScore": _as_float(raw.get("thermalScore")),
        "behaviorScore": _as_float(raw.get("behaviorScore")),
        "crowdScore": _as_float(raw.get("crowdScore")),
        "location": location,
        "timestamp": _as_timestamp(raw.get("timestamp")),
        "riskType": _risk_type(risk_value),
        "evidence": _normalize_evidence(raw.get("evidence")),
        "confidence": max(0.0, min(1.0, _as_float(raw.get("confidence"), 0.6))),
    }


def _risk_to_dict(row: RiskRecord) -> dict[str, Any]:
    return {
        "riskId": row.riskId,
        "title": row.title,
        "riskType": row.riskType,
        "level": row.level,
        "score": round(row.score, 1),
        "status": row.status,
        "marketIds": list(row.marketIds_json or []),
        "zoneIds": list(row.zoneIds_json or []),
        "eventIds": list(row.eventIds_json or []),
        "sourceTypes": list(row.sourceTypes_json or []),
        "evidence": list(row.evidence_json or []),
        "metrics": dict(row.metrics_json or {}),
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
    }


def _drone_task_to_dict(row: DroneTask) -> dict[str, Any]:
    return {
        "taskId": row.taskId,
        "eventId": row.eventId,
        "riskRecordId": row.riskRecordId,
        "marketId": row.marketId,
        "zoneId": row.zoneId,
        "taskArea": row.taskArea,
        "waypoints": list(row.waypoints_json or []),
        "priority": row.priority,
        "broadcastText": row.broadcastText,
        "videoUrl": row.videoUrl,
        "deviceStatus": row.deviceStatus,
        "status": row.status,
        "evidence": list(row.evidence_json or []),
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
    }


def _device_to_dict(row: Device) -> dict[str, Any]:
    return {
        "deviceId": row.deviceId,
        "marketId": row.marketId,
        "zoneId": row.zoneId,
        "deviceType": row.deviceType,
        "name": row.name,
        "status": row.status,
        "capabilities": list(row.capabilities_json or []),
        "lastSeenAt": row.lastSeenAt,
    }


def _risk_key(risk_type: str, occurred_at: datetime) -> str:
    start = occurred_at.replace(minute=(occurred_at.minute // RISK_WINDOW_MINUTES) * RISK_WINDOW_MINUTES, second=0, microsecond=0)
    digest = hashlib.sha1(f"nanchang:{risk_type}:{start.isoformat()}".encode("utf-8")).hexdigest()[:16]
    return f"{risk_type}:{start.strftime('%Y%m%d%H%M')}:{digest}"


def _event_context(row: SafetyEvent) -> dict[str, Any]:
    meta = dict(row.meta_json or {})
    context = meta.get("context")
    if not isinstance(context, dict):
        context = normalize_event_context(
            {"timestamp": row.createdAt},
            bay=row.bay,
            title=row.title,
            description=row.description,
            alarm_location=meta.get("alarmLocation") or meta.get("reporterLocation"),
        )
        meta["context"] = context
        row.meta_json = meta
    return context


def _event_score(row: SafetyEvent, context: dict[str, Any]) -> float:
    base = {"高风险": 55.0, "中风险": 30.0, "低风险": 15.0}.get(row.level, 20.0)
    signal = max(context.get("behaviorScore", 0.0), context.get("crowdScore", 0.0), context.get("thermalScore", 0.0))
    return base + min(20.0, signal / 5.0) + min(10.0, context.get("confidence", 0.0) * 10.0)


def _append_risk_audit(session, row: SafetyEvent, risk: RiskRecord) -> None:
    session.add(
        EventAuditLog(
            eventId=row.id,
            action="关联联防风险",
            operator="风险关联服务",
            status=row.status,
            owner=row.owner,
            note=json.dumps(
                {"riskRecordId": risk.riskId, "riskLevel": risk.level, "riskScore": round(risk.score, 1)},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            time=_now().strftime("%H:%M"),
            createdAt=_now_iso(),
        )
    )


def link_event_risk(event_id: str) -> dict[str, Any] | None:
    ensure_linkage_defaults()
    with DB_LOCK, SessionLocal() as session:
        target = session.get(SafetyEvent, event_id)
        if target is None:
            return None
        target_context = _event_context(target)
        risk_type = _risk_type(str(target_context.get("riskType") or target.title))
        occurred_at = _parse_timestamp(target_context.get("timestamp") or target.createdAt)
        window_start = occurred_at - timedelta(minutes=RISK_WINDOW_MINUTES)
        window_end = occurred_at + timedelta(minutes=RISK_WINDOW_MINUTES)
        candidates = []
        for row in session.scalars(select(SafetyEvent)).all():
            context = _event_context(row)
            if _risk_type(str(context.get("riskType") or row.title)) != risk_type:
                continue
            row_at = _parse_timestamp(context.get("timestamp") or row.createdAt)
            if window_start <= row_at <= window_end:
                candidates.append((row, context))
        if not candidates:
            candidates = [(target, target_context)]

        event_ids = _unique([row.id for row, _ in candidates])
        market_ids = _unique([str(context.get("marketId") or "") for _, context in candidates])
        zone_ids = _unique([str(context.get("zoneId") or "") for _, context in candidates])
        source_types = _unique([str(row.source) for row, _ in candidates])
        evidence = [item for _, context in candidates for item in _normalize_evidence(context.get("evidence"))]
        score = sum(_event_score(row, context) for row, context in candidates)
        score += max(0, len(market_ids) - 1) * 15
        score += max(0, len(source_types) - 1) * 8
        risk_key = _risk_key(risk_type, occurred_at)
        risk = session.scalar(select(RiskRecord).where(RiskRecord.riskKey == risk_key))
        now_iso = _now_iso()
        if risk is None:
            risk = RiskRecord(
                riskId=f"RISK-{uuid4().hex[:12].upper()}",
                riskKey=risk_key,
                title=_title_for_risk(risk_type),
                riskType=risk_type,
                level=_level_for_score(score),
                score=score,
                status="联防预警" if len(market_ids) > 1 and score >= 90 else "观察中",
                marketIds_json=market_ids,
                zoneIds_json=zone_ids,
                eventIds_json=event_ids,
                sourceTypes_json=source_types,
                evidence_json=evidence,
                metrics_json={
                    "eventCount": len(event_ids),
                    "marketCount": len(market_ids),
                    "sourceCount": len(source_types),
                    "windowMinutes": RISK_WINDOW_MINUTES,
                },
                createdAt=now_iso,
                updatedAt=now_iso,
            )
            session.add(risk)
            session.flush()
        else:
            risk.title = _title_for_risk(risk_type)
            risk.level = _level_for_score(score)
            risk.score = score
            risk.status = "联防预警" if len(market_ids) > 1 and score >= 90 else "观察中"
            risk.marketIds_json = market_ids
            risk.zoneIds_json = zone_ids
            risk.eventIds_json = event_ids
            risk.sourceTypes_json = source_types
            risk.evidence_json = evidence
            risk.metrics_json = {
                "eventCount": len(event_ids),
                "marketCount": len(market_ids),
                "sourceCount": len(source_types),
                "windowMinutes": RISK_WINDOW_MINUTES,
            }
            risk.updatedAt = now_iso

        for row, context in candidates:
            previous_risk_id = context.get("riskRecordId")
            next_context = dict(context)
            next_context.update({"riskRecordId": risk.riskId, "riskLevel": risk.level, "riskScore": round(risk.score, 1)})
            meta = dict(row.meta_json or {})
            meta["context"] = next_context
            row.meta_json = meta
            if previous_risk_id != risk.riskId:
                _append_risk_audit(session, row, risk)
        session.commit()
        return _risk_to_dict(risk)


def get_risk_for_event(event_id: str) -> dict[str, Any] | None:
    ensure_linkage_defaults()
    with SessionLocal() as session:
        row = session.get(SafetyEvent, event_id)
        if row is None:
            return None
        context = (row.meta_json or {}).get("context") or {}
        risk_id = context.get("riskRecordId")
        risk = session.get(RiskRecord, risk_id) if risk_id else None
        return _risk_to_dict(risk) if risk else None


def _touch_device(payload: dict[str, Any]) -> None:
    now_iso = _now_iso()
    device_id = str(payload["deviceId"])
    with DB_LOCK, SessionLocal() as session:
        row = session.get(Device, device_id)
        if row is None:
            row = Device(
                deviceId=device_id,
                marketId=payload.get("marketId"),
                zoneId=payload.get("zoneId"),
                deviceType=payload["deviceType"],
                name=str(payload.get("deviceName") or device_id),
                status="在线",
                capabilities_json=[],
                config_json={},
                lastSeenAt=now_iso,
                createdAt=now_iso,
                updatedAt=now_iso,
            )
            session.add(row)
        else:
            row.marketId = payload.get("marketId") or row.marketId
            row.zoneId = payload.get("zoneId") or row.zoneId
            row.deviceType = payload["deviceType"]
            row.status = "在线"
            row.lastSeenAt = now_iso
            row.updatedAt = now_iso
        session.commit()


def ingest_device_observation(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_linkage_defaults()
    device_type = str(payload.get("deviceType") or "")
    if device_type not in DEVICE_TYPES:
        raise ValueError("不支持的设备类型")
    if not payload.get("deviceId"):
        raise ValueError("deviceId 不能为空")
    _touch_device(payload)
    risk_type = _risk_type(str(payload.get("riskType") or ""))
    action_map = {
        "打架": "打架",
        "人员聚集": "人员聚集",
        "跌倒": "跌倒",
        "越界": "越界",
        "离岗": "离岗",
    }
    action = action_map.get(risk_type, "人员聚集")
    timestamp = _as_timestamp(payload.get("timestamp"))
    context = normalize_event_context(
        {**payload, "riskType": risk_type, "timestamp": timestamp},
        bay=str(payload.get("cameraName") or payload.get("deviceName") or payload["deviceId"]),
        title=action,
        description=str(payload.get("description") or ""),
        alarm_location=payload.get("location") if isinstance(payload.get("location"), dict) else None,
    )
    detection = {
        "eventKey": str(payload.get("eventKey") or f"{device_type}-{payload['deviceId']}-{timestamp}"),
        "sourceId": f"{device_type}:{payload['deviceId']}",
        "cameraId": payload.get("cameraId") or payload["deviceId"],
        "cameraName": payload.get("cameraName") or payload.get("deviceName") or payload["deviceId"],
        "timestamp": timestamp,
        "actions": [action],
        "personCount": int(_as_float(payload.get("personCount") or payload.get("crowdCount"))),
        "frameCount": int(_as_float(payload.get("frameCount"), 1)),
        "fps": _as_float(payload.get("fps"), 0.0),
        "imageFilename": payload.get("imageFilename"),
        "path": payload.get("path"),
        "payload": {**payload, "context": context},
        "context": context,
    }
    from app.services.event_store import ingest_security_detection

    event = ingest_security_detection(detection)
    if event is None:
        raise ValueError("设备观测没有生成事件")
    risk = link_event_risk(event["id"])
    return {"event": event, "risk": risk}


def create_drone_task(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_linkage_defaults()
    task_area = str(payload.get("taskArea") or "").strip()
    if not task_area:
        raise ValueError("taskArea 不能为空")
    now_iso = _now_iso()
    with DB_LOCK, SessionLocal() as session:
        task = DroneTask(
            taskId=f"DRONE-{uuid4().hex[:12].upper()}",
            eventId=payload.get("eventId"),
            riskRecordId=payload.get("riskRecordId"),
            marketId=payload.get("marketId"),
            zoneId=payload.get("zoneId"),
            taskArea=task_area,
            waypoints_json=list(payload.get("waypoints") or []),
            priority=str(payload.get("priority") or "中"),
            broadcastText=payload.get("broadcastText"),
            videoUrl=payload.get("videoUrl"),
            deviceStatus=str(payload.get("deviceStatus") or "待命"),
            status="待执行",
            evidence_json=_normalize_evidence(payload.get("evidence")),
            createdAt=now_iso,
            updatedAt=now_iso,
        )
        session.add(task)
        session.commit()
        return _drone_task_to_dict(task)


def update_drone_task_receipt(task_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    ensure_linkage_defaults()
    with DB_LOCK, SessionLocal() as session:
        task = session.get(DroneTask, task_id)
        if task is None:
            return None
        if payload.get("status"):
            task.status = str(payload["status"])
        if payload.get("videoUrl") is not None:
            task.videoUrl = str(payload["videoUrl"])
        if payload.get("deviceStatus"):
            task.deviceStatus = str(payload["deviceStatus"])
        if payload.get("evidence") is not None:
            task.evidence_json = _normalize_evidence(payload["evidence"])
        task.updatedAt = _now_iso()
        session.commit()
        return _drone_task_to_dict(task)


def overview() -> dict[str, Any]:
    ensure_linkage_defaults()
    with SessionLocal() as session:
        risks = session.scalars(select(RiskRecord).order_by(RiskRecord.updatedAt.desc()).limit(12)).all()
        devices = session.scalars(select(Device).order_by(Device.updatedAt.desc()).limit(12)).all()
        drone_tasks = session.scalars(select(DroneTask).order_by(DroneTask.updatedAt.desc()).limit(12)).all()
        risk_items = [_risk_to_dict(row) for row in risks]
        return {
            "stats": {
                "activeRisks": len([row for row in risk_items if row["status"] != "已关闭"]),
                "crossMarketWarnings": len([row for row in risk_items if len(row["marketIds"]) > 1]),
                "onlineDevices": len([row for row in devices if row.status in {"在线", "模拟在线"}]),
                "droneTasks": len([row for row in drone_tasks if row.status != "已完成"]),
            },
            "risks": risk_items,
            "devices": [_device_to_dict(row) for row in devices],
            "droneTasks": [_drone_task_to_dict(row) for row in drone_tasks],
        }
