"""Human-confirmed command workflow on the existing SafetyEvent aggregate."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import math
import os
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.services.database import DB_LOCK, SessionLocal
from app.services.models import (
    CommandPrincipal, CommandReceipt, CommandUpload, EventAuditLog, PatrolStaff,
    SafetyEvent, VoiceIntake, WechatUser, IdentityProfile,
)
from app.services import event_store

SCENARIO_PATH = Path(__file__).resolve().parents[1] / "data/command/night_market_b1_b4_v1.json"
READ_ROLES = {"intake", "dispatch", "analyze", "audit"}
ACTION_ROLES = {
    "intake": "intake", "summary/confirm": "intake",
    "dispatch/confirm": "dispatch", "dispatch": "dispatch",
    "status": "field", "verification": "field", "verification/review": "field",
    "evidence": "field", "handover": "field", "handover/review": "analyze",
}


@dataclass(frozen=True)
class Actor:
    openid: str
    roles: frozenset[str]
    staff_id: str | None = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def fail(code: int, message: str):
    raise HTTPException(code, message)


def scenario() -> dict:
    return json.loads(SCENARIO_PATH.read_text(encoding="utf-8"))


def demo_enabled() -> bool:
    return (os.getenv("APP_ENV") == "development"
            and os.getenv("CICSIC_COMMAND_DEMO") == "1"
            and os.getenv("CICSIC_COMMAND_ISOLATED") == "1")


def actor_for_token(token: str | None, required=True) -> Actor | None:
    with SessionLocal() as session:
        user = session.scalar(select(WechatUser).where(WechatUser.token == token)) if token else None
        if not user:
            if required:
                fail(401, "未登录或令牌已失效")
            return None
        grant = session.get(CommandPrincipal, user.openid)
        if not grant or not grant.enabled:
            if required:
                fail(403, "账号未获接处警授权")
            return None
        return Actor(user.openid, frozenset(grant.roles_json), grant.staffId)


def require_role(actor: Actor, role: str):
    if role not in actor.roles:
        fail(403, f"当前账号缺少 {role} 操作权限")


def can_read(actor: Actor | None, event: dict) -> bool:
    command = event.get("meta", {}).get("command")
    if not command or actor is None:
        return False
    if actor.roles & READ_ROLES:
        return True
    if "display" in actor.roles and command["sourceMode"] == "desensitized_demo":
        return True
    return ("field" in actor.roles and bool(actor.staff_id)
            and event["status"] != "已提交"
            and event["meta"].get("assignment", {}).get("staffId") == actor.staff_id)


def authorize(actor: Actor, row: SafetyEvent, role: str | None = None):
    if not can_read(actor, event_store._event_to_dict(row)):
        fail(404, "事件不存在或不可访问")
    if role:
        require_role(actor, role)
        if role == "field" and (not actor.staff_id or
                (row.meta_json or {}).get("assignment", {}).get("staffId") != actor.staff_id):
            fail(404, "事件未分派给当前人员")


def assert_legacy_writable(row: SafetyEvent):
    if (row.meta_json or {}).get("command"):
        raise ValueError("接处警事件必须通过受控工作流提交，并携带请求编号与版本")


def is_command(event_id: str) -> bool:
    with SessionLocal() as session:
        row = session.get(SafetyEvent, event_id)
        return bool(row and (row.meta_json or {}).get("command"))


def _row(session, event_id, actor):
    row = session.scalar(select(SafetyEvent).where(SafetyEvent.id == event_id).with_for_update())
    if not row:
        fail(404, "事件不存在或不可访问")
    authorize(actor, row)
    return row


def _response(session, row, request_id=None, audit_id=None):
    session.flush()
    event = event_store._event_to_dict(row)
    event["timeline"] = event_store._event_logs(session, row.id)
    return deepcopy({"event": event, "command": event["meta"].get("command"),
                     "requestId": request_id, "auditId": audit_id})


def context(event_id: str, actor: Actor) -> dict:
    with SessionLocal() as session:
        row = session.get(SafetyEvent, event_id)
        if not row:
            fail(404, "事件不存在或不可访问")
        if not (row.meta_json or {}).get("command"):
            require_role(actor, "intake")
        else:
            authorize(actor, row)
        return _response(session, row)


def receipt(event_id: str, request_id: str, actor: Actor) -> dict:
    with SessionLocal() as session:
        row = session.get(SafetyEvent, event_id)
        if not row:
            fail(404, "事件不存在或不可访问")
        authorize(actor, row)
        record = session.get(CommandReceipt, (event_id, request_id))
        if not record:
            fail(404, "尚未查到该请求回执")
        return deepcopy(record.response_json)


def list_events(actor: Actor | None) -> list[dict]:
    if actor is None:
        return []
    with SessionLocal() as session:
        rows = session.scalars(select(SafetyEvent).order_by(SafetyEvent.createdAt.desc())).all()
        return [event_store._event_to_dict(row) for row in rows if can_read(actor, event_store._event_to_dict(row))]


def _text(value, label, required=True, maximum=8000):
    if value is None and not required:
        return ""
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        fail(422, f"{label}不能为空且不得超过{maximum}字")
    return value.strip()


def _point(data):
    lat, lon = data.get("latitude"), data.get("longitude")
    if lat is None and lon is None:
        return None
    if (type(lat) not in (int, float) or type(lon) not in (int, float)
            or not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180):
        fail(422, "经纬度必须成对提供且处于有效范围")
    return {"latitude": lat, "longitude": lon}


def _audit(session, row, actor, action, request_id, details=None):
    log = EventAuditLog(eventId=row.id, action=action, operator=actor.openid, status=row.status,
                        owner=row.owner, note=event_store._compose_audit_note(action, {
                            "requestId": request_id, **(details or {})}),
                        time=datetime.now().strftime("%H:%M"), createdAt=now())
    session.add(log)
    session.flush()
    return str(log.id)


def _fingerprint(actor, action, data):
    return sha256(json.dumps([actor.openid, action, data], sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _prior(session, scope, data, fingerprint):
    request_id = _text(data.get("requestId"), "请求编号", maximum=96)
    old = session.get(CommandReceipt, (scope, request_id))
    if old:
        if old.fingerprint != fingerprint:
            fail(409, "相同请求编号已用于不同内容，请先核对回执")
        return deepcopy(old.response_json)
    return None


def _save_receipt(session, scope, data, fingerprint, response):
    session.add(CommandReceipt(scope=scope, requestId=data["requestId"],
                               fingerprint=fingerprint, response_json=response))


def _summary(transcript, version):
    return {"version": version, "text": transcript, "category": "消费纠纷" if any(
        word in transcript for word in ["纠纷", "赔偿", "索赔", "食品"]) else "现场求助",
        "riskTags": ["纠纷升级风险"] if any(word in transcript for word in ["威胁", "砸", "冲突"]) else [],
        "dangerFactors": ["伤情及危险物品待核实"], "basis": ["报警人原文，未经现场核实"],
        "dataTime": now(), "generationMethod": "rules", "confidence": None, "reviewStatus": "pending"}


def _intake_context(data, source_mode, fixture=None):
    transcript = _text(data.get("transcript"), "接警文本")
    location = _text(data.get("locationText", data.get("bay")), "地点", maximum=80)
    point = _point(data)
    intake = {"speakerName": data.get("speakerName", ""), "transcript": transcript,
              "transcriptSource": "manual", "transcriptConfidence": None,
              "transcriptUpdatedAt": now(), "locationVersion": 1, "locationText": location,
              "locationSource": "desensitized_demo" if point and fixture else "manual",
              "contactMasked": data.get("contact", "")[-4:].rjust(11, "*") if data.get("contact") else "",
              "coordinates": point, "segments": fixture["intake"]["segments"] if fixture else []}
    return {"version": 1, "updatedAt": now(), "stage": "B1_SUMMARY_PENDING_REVIEW",
            "sourceMode": source_mode, "scenarioId": fixture["scenarioId"] if fixture else None,
            "scenarioVersion": fixture["version"] if fixture else None,
            "intake": intake, "intakeHistory": [], "summary": _summary(transcript, 1),
            "relatedAlerts": fixture["relatedAlerts"] if fixture else [],
            "evidenceIndex": [], "handoverHistory": [], "verificationHistory": []}


def create_intake(data: dict, actor: Actor, demo=False):
    require_role(actor, "intake")
    fixture = scenario() if demo else None
    if demo and not demo_enabled():
        fail(403, "教学联调仅允许在显式隔离环境运行")
    if fixture and (data.get("scenarioId") != fixture["scenarioId"] or data.get("scenarioVersion") != fixture["version"]):
        fail(409, "教学场景版本不匹配")
    run_key = _text(data.get("runKey"), "演示轮次", maximum=96) if demo else None
    scope = f"create:{actor.openid}"
    fingerprint = _fingerprint(actor, "demo" if demo else "intake", data)
    event_id = ("CMD-DEMO-" + sha256(run_key.encode()).hexdigest()[:32]) if demo else "CMD-" + uuid4().hex
    try:
        with DB_LOCK, SessionLocal.begin() as session:
            old = _prior(session, scope, data, fingerprint)
            if old:
                return old
            existing = session.get(SafetyEvent, event_id)
            if existing:
                authorize(actor, existing)
                response = _response(session, existing, data["requestId"])
                _save_receipt(session, scope, data, fingerprint, response)
                return response
            intake_data = fixture["intake"] if fixture else data
            command = _intake_context(intake_data, "desensitized_demo" if fixture else "live", fixture)
            command["eventId"] = event_id
            command["runKey"] = run_key
            point = command["intake"]["coordinates"]
            meta = {"command": command, "evidence": [], "context": {"evidence": []},
                    "locationSource": command["intake"]["locationSource"], "manualLocation": command["intake"]["locationText"]}
            if point:
                meta["alarmLocation"] = {**point, "name": command["intake"]["locationText"], "source": command["intake"]["locationSource"]}
            event_store.insert_event(session, {
                "id": event_id, "kind": "help", "title": command["summary"]["category"],
                "bay": command["intake"]["locationText"], "level": "待核实", "source": "接处警文本登记",
                "status": "已提交", "owner": "待派单", "distance": "地点待核实",
                "time": datetime.now().strftime("%H:%M"), "updatedAt": datetime.now().strftime("%H:%M"),
                "description": command["intake"]["transcript"], "meta": meta,
            })
            from app.services.security_ops import _intent_from_text
            intent, _, label = _intent_from_text(command["intake"]["transcript"])
            session.add(VoiceIntake(intakeId="CMD-VOICE-" + uuid4().hex, channel="manual",
                transcript=command["intake"]["transcript"], intent=intent, confidence=0,
                parsed_json={"label": label, "generationMethod": "rules", "autoAssign": False},
                eventId=event_id, createdAt=now()))
            row = session.get(SafetyEvent, event_id)
            audit_id = _audit(session, row, actor, "登记接警文本", data["requestId"])
            response = _response(session, row, data["requestId"], audit_id)
            _save_receipt(session, scope, data, fingerprint, response)
            return response
    except IntegrityError:
        # Concurrent creation of the same run cannot create a second event.
        with SessionLocal() as session:
            old = _prior(session, scope, data, fingerprint)
            if old:
                return old
        fail(409, "该轮次正在创建，请核对回执后使用原请求编号重试")


def related_alerts(event_id, actor):
    current = context(event_id, actor)
    command = current["command"]
    if not command:
        return []
    if command["sourceMode"] == "desensitized_demo":
        return command.get("relatedAlerts", [])
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    result = []
    for event in list_events(actor):
        other = event["meta"]["command"]
        if event["id"] == event_id or other["sourceMode"] != "live":
            continue
        try:
            occurred = datetime.fromisoformat(event["createdAt"])
            occurred = occurred.replace(tzinfo=timezone.utc) if occurred.tzinfo is None else occurred.astimezone(timezone.utc)
        except ValueError:
            continue
        matches = [word for word in ["食品", "索赔", "砸摊", "纠纷"] if word in event["description"]
                   and word in current["event"]["description"]]
        if occurred >= cutoff and matches:
            result.append({"eventId": event["id"], "occurredAt": event["createdAt"], "locationText": event["bay"],
                           "relation": "文本特征交叉，地点需核实", "similarity": "low", "basis": matches, "sourceMode": "live"})
    return sorted(result, key=lambda item: item["occurredAt"], reverse=True)


def _route(session, row, command, staff_id):
    staff = session.get(PatrolStaff, staff_id)
    if not staff or not staff.online:
        fail(422, "指定警力不存在或离线")
    if command["summary"]["reviewStatus"] != "confirmed":
        fail(409, "请先确认当前警情摘要")
    result = {"staffId": staff.id, "staffName": staff.name,
              "summaryVersion": command["summary"]["version"],
              "locationVersion": command["intake"]["locationVersion"],
              "routeSource": "manual", "segments": [], "notice": "手动地点待核实，不提供路线与到达时间"}
    point = command["intake"].get("coordinates")
    if not point:
        return result
    fixture = scenario()
    frozen_point = {k: fixture["intake"][k] for k in ("latitude", "longitude")}
    if command["sourceMode"] == "desensitized_demo" and point == frozen_point:
        return {**result, **fixture["route"]}
    distance = event_store._haversine_meters({"latitude": staff.latitude, "longitude": staff.longitude}, point)
    return {**result, "routeSource": "local_estimate",
            "notice": f"直线距离约{distance}米，非道路导航；不推断可通行道路或到达时间",
            "straightLineMeters": distance, "destination": point}


def route_preview(event_id, staff_id, actor):
    require_role(actor, "dispatch")
    with SessionLocal() as session:
        row = session.get(SafetyEvent, event_id)
        if not row:
            fail(404, "事件不存在或不可访问")
        authorize(actor, row)
        return _route(session, row, row.meta_json["command"], staff_id)


def _onsite(row):
    if row.status not in {"已到达", "处理中"}:
        fail(409, "当前任务尚未到场或已结束")


def _evidence_path(filename):
    directory = Path(os.getenv("CICSIC_EVIDENCE_DIR", str(Path(__file__).resolve().parents[2] / "data/event-evidence")))
    return directory.resolve() / filename


def _valid_material(session, row, item):
    if item["kind"] == "note":
        return bool(item.get("description", "").strip())
    upload = session.get(CommandUpload, item.get("uploadId"))
    if not upload or upload.eventId != row.id:
        return False
    path = _evidence_path(upload.filename)
    return path.is_file() and sha256(path.read_bytes()).hexdigest() == upload.sha256


def _mutate(session, row, command, action, data, actor, child_id):
    stamp = now()
    if action == "intake":
        if row.status != "已提交":
            fail(409, "派警后不可修订接警摘要")
        updated = _intake_context(data, command["sourceMode"])
        command["intakeHistory"].append(deepcopy(command["intake"]))
        updated["intake"]["locationVersion"] = command["intake"]["locationVersion"] + 1
        command["intake"] = updated["intake"]
        command["summary"] = _summary(updated["intake"]["transcript"], command["summary"]["version"] + 1)
        command.pop("dispatch", None)
        command["stage"] = "B1_SUMMARY_PENDING_REVIEW"
        row.bay, row.description = command["intake"]["locationText"], command["intake"]["transcript"]
        row.meta_json = {**row.meta_json, "manualLocation": row.bay}
        row.meta_json.pop("route", None)
        row.meta_json.pop("alarmLocation", None)
        if command["intake"]["coordinates"]:
            row.meta_json["alarmLocation"] = {**command["intake"]["coordinates"], "name": row.bay, "source": "manual"}
    elif action == "summary/confirm":
        if row.status != "已提交" or data.get("summaryVersion") != command["summary"]["version"]:
            fail(409, "摘要版本已变化或事件已经派单")
        if not isinstance(data.get("dangerFactors"), list) or not data["dangerFactors"]:
            fail(422, "请记录危险因素；无法确定时明确填写不详")
        command["summary"].update(
            text=_text(data.get("text"), "摘要"), category=_text(data.get("category"), "警情类别", maximum=80),
            dangerFactors=[_text(v, "危险因素", maximum=200) for v in data["dangerFactors"]],
            riskTags=[_text(v, "风险标签", maximum=100) for v in data.get("riskTags", [])],
            reviewStatus="confirmed", confirmedBy=actor.openid, confirmedAt=stamp,
            confirmationNote=data.get("note", ""), generationMethod="manual")
        command.pop("dispatch", None)
        command["stage"] = "B1_SUMMARY_CONFIRMED"
        row.title = command["summary"]["category"]
    elif action == "dispatch/confirm":
        if row.status != "已提交":
            fail(409, "当前事件已经派单")
        route = _route(session, row, command, _text(data.get("staffId"), "警力编号", maximum=64))
        if data.get("summaryVersion") != route["summaryVersion"] or data.get("locationVersion") != route["locationVersion"]:
            fail(409, "地点或摘要版本已变化，请重新确认建议")
        command["dispatch"] = {**route, "recommendationId": "REC-" + uuid4().hex,
                               "reviewStatus": "confirmed", "confirmedBy": actor.openid, "confirmedAt": stamp,
                               "note": data.get("note", "")}
        command["stage"] = "B2_DISPATCH_CONFIRMED"
    elif action == "dispatch":
        dispatch = command.get("dispatch", {})
        if (row.status != "已提交" or dispatch.get("reviewStatus") != "confirmed"
                or data.get("recommendationId") != dispatch.get("recommendationId")
                or dispatch.get("summaryVersion") != command["summary"]["version"]
                or dispatch.get("locationVersion") != command["intake"]["locationVersion"]):
            fail(409, "派警建议未确认、已失效或已下达")
        staff = session.get(PatrolStaff, dispatch["staffId"])
        if not staff or not staff.online:
            fail(409, "警力状态已变化，请重新核对")
        row.owner, row.status = staff.name, "已派单"
        row.meta_json = {**row.meta_json, "assignment": {
            "staffId": staff.id, "staffName": staff.name, "role": staff.role, "assignedAt": stamp,
            "reason": dispatch.get("note") or "指挥席人工确认", "groupLabel": dispatch.get("groupLabel"),
        }}
        dispatch.update(dispatchedAt=stamp, notificationStatus="polling_available")
        command["stage"] = "B2_DISPATCHED"
    elif action == "status":
        target = data.get("status")
        allowed = {"已派单": "已接收", "已接收": "已到达", "已到达": "处理中", "处理中": "已完成"}
        if allowed.get(row.status) != target:
            fail(409, "不允许跳步、回退或重复推进任务状态")
        if target == "已完成":
            if command.get("handover", {}).get("status") != "accepted":
                fail(409, "研判移交尚未接收，现场任务不能完成")
            row.result = _text(data.get("result"), "现场处置结果")
        row.status = target
    elif action == "verification":
        _onsite(row)
        query = _text(data.get("query"), "核验查询", maximum=200)
        person = scenario()["person"] if command["sourceMode"] == "desensitized_demo" else None
        match = person and query in [person["name"], person["personKey"], person["archiveNo"]]
        archive = None
        ambiguous = False
        if not person:
            candidates = session.scalars(select(IdentityProfile).where(
                (IdentityProfile.name == query) | (IdentityProfile.archiveNo == query) | (IdentityProfile.personKey == query)
            ).limit(2)).all()
            if len(candidates) == 1:
                archive = candidates[0]
                match = True
            ambiguous = len(candidates) > 1
        basis = (person["basis"] if person and match else
                 ["本地档案字段精确匹配，不含图像识别；同名与关联警情需人工复核"] if archive else
                 ["命中多个本地档案，必须转人工核查"] if ambiguous else
                 ["本地授权查询未返回对应档案；不代表不存在其他记录"])
        if command.get("verification"):
            command["verificationHistory"].append(deepcopy(command["verification"]))
        command["verification"] = {
            "verificationId": "VER-" + uuid4().hex, "subjectName": query,
            "query": query, "resultStatus": "pending", "lookupStatus": "matched" if match else "ambiguous" if ambiguous else "no_match",
            "basis": basis,
            "personKey": person["personKey"] if person and match else archive.personKey if archive else None,
            "dataTime": scenario()["baseTime"] if person else archive.updatedAt if archive else stamp,
            "queriedAt": stamp, "method": "scenario_fixture" if person else "archive_lookup",
            "matchScore": None, "confidence": None,
        }
        if not command["stage"].startswith("B4"):
            command["stage"] = "B3_VERIFICATION_PENDING"
    elif action == "verification/review":
        _onsite(row)
        verification = command.get("verification", {})
        if verification.get("verificationId") != child_id or verification.get("resultStatus") != "pending":
            fail(409, "核验记录不存在、已变化或已审核")
        decision = data.get("decision")
        if decision not in {"confirmed", "no_match", "fallback"}:
            fail(422, "核验决定不合法")
        if decision == "confirmed" and verification["lookupStatus"] != "matched":
            fail(409, "无匹配结果不能确认为核验线索")
        if decision == "no_match" and verification["lookupStatus"] != "no_match":
            fail(409, "有匹配线索，不能登记无匹配；可转人工说明")
        reason = _text(data.get("reason"), "转人工原因") if decision == "fallback" else data.get("reason", "")
        verification.update(resultStatus=decision, confirmedBy=actor.openid, confirmedAt=stamp, fallbackReason=reason)
        if not command["stage"].startswith("B4"):
            command["stage"] = "B3_VERIFICATION_CONFIRMED" if decision == "confirmed" else "B3_VERIFICATION_FALLBACK"
    elif action == "evidence":
        _onsite(row)
        name = _text(data.get("name"), "材料名称", maximum=200)
        discovery = _text(data.get("discoveredAt"), "发现时间", maximum=40)
        try:
            datetime.fromisoformat(discovery)
        except ValueError:
            fail(422, "发现时间必须是ISO日期时间")
        if data.get("discoveredBy") not in (None, actor.openid, actor.staff_id):
            fail(422, "发现人不属于当前任务")
        item = {"evidenceId": "EVD-" + uuid4().hex, "name": name, "sourceStage": "B4",
                "discoveredAt": discovery, "discoveredBy": actor.openid, "registeredBy": actor.openid,
                "registeredAt": stamp, "description": data.get("description", ""),
                "sensitivity": "desensitized" if command["sourceMode"] == "desensitized_demo" else "restricted"}
        if data.get("kind") == "note":
            item.update(kind="note", description=_text(data.get("description"), "文字材料"))
        else:
            upload = session.get(CommandUpload, data.get("uploadId", ""))
            if not upload or upload.eventId != row.id or upload.uploadedBy != actor.openid:
                fail(422, "上传回执不存在或不属于当前事件/账号")
            if any(entry.get("uploadId") == upload.uploadId for entry in command["evidenceIndex"]):
                fail(409, "该上传已登记，请读取当前证据索引")
            item.update(kind="video" if upload.mimeType.startswith("video/") else "image", uploadId=upload.uploadId,
                        url=f"/api/events/evidence/{upload.filename}", sha256=upload.sha256)
            if not _valid_material(session, row, item):
                fail(422, "材料文件不存在或校验值已变化")
        command["evidenceIndex"].append(item)
        meta = deepcopy(row.meta_json)
        meta["evidence"] = [*(meta.get("evidence") or []), item]
        meta["context"] = {**meta.get("context", {}), "evidence": [*(meta.get("context", {}).get("evidence") or []), item]}
        row.meta_json = meta
        command["stage"] = "B4_EVIDENCE_COLLECTING"
    elif action == "handover":
        _onsite(row)
        if command.get("verification", {}).get("resultStatus") not in {"confirmed", "no_match", "fallback"}:
            fail(409, "请先确认核验线索、登记无匹配或说明转人工原因")
        ids = data.get("evidenceIds")
        if not isinstance(ids, list) or not ids or any(not isinstance(key, str) for key in ids) or len(set(ids)) != len(ids):
            fail(422, "请选择本事件材料，不得为空或重复")
        by_id = {item["evidenceId"]: item for item in command["evidenceIndex"]}
        if any(key not in by_id or not _valid_material(session, row, by_id[key]) for key in ids):
            fail(422, "材料不存在、不属于当前事件或文件不可用")
        previous = command.get("handover")
        if previous:
            command["handoverHistory"].append(deepcopy(previous))
        command["handover"] = {
            "handoverId": "HND-" + uuid4().hex, "version": (previous or {}).get("version", 0) + 1,
            "target": "研判中心", "status": "submitted", "evidenceIds": ids,
            "evidenceSnapshot": [deepcopy(by_id[key]) for key in ids],
            "verificationSnapshot": deepcopy(command["verification"]),
            "summary": _text(data.get("summary"), "移交摘要"),
            "submittedBy": actor.openid, "submittedAt": stamp,
        }
        command["stage"] = "B4_HANDOVER_SUBMITTED"
    elif action == "handover/review":
        handover = command.get("handover", {})
        if handover.get("handoverId") != child_id or handover.get("status") != "submitted":
            fail(409, "移交记录不存在、已变化或已审核")
        decision = data.get("decision")
        if decision not in {"accepted", "rejected"}:
            fail(422, "移交审核决定不合法")
        if decision == "accepted":
            if any(not _valid_material(session, row, item) for item in handover["evidenceSnapshot"]):
                fail(422, "移交材料文件不可用，请退回补正")
            handover.update(status="accepted", acceptedBy=actor.openid, acceptedAt=stamp)
            command["stage"] = "B4_HANDOVER_ACCEPTED"
        else:
            handover.update(status="rejected", rejectedBy=actor.openid, rejectedAt=stamp,
                            rejectionReason=_text(data.get("reason"), "退回原因"))
            command["stage"] = "B4_HANDOVER_PENDING"


def execute(event_id, action, data, actor, child_id=None):
    role = ACTION_ROLES.get(action)
    if role is None:
        fail(404, "未知工作流动作")
    require_role(actor, role)
    fingerprint = _fingerprint(actor, [action, child_id], data)
    with DB_LOCK, SessionLocal.begin() as session:
        row = session.scalar(select(SafetyEvent).where(SafetyEvent.id == event_id).with_for_update())
        if not row:
            fail(404, "事件不存在或不可访问")
        if not (row.meta_json or {}).get("command") and action == "intake":
            if row.status != "已提交":
                fail(409, "历史事件已派警，不可初始化")
            if data.get("expectedVersion") != 0:
                fail(409, "首次初始化的版本必须为0")
            command = _intake_context({"transcript": row.description or "历史接警原文未记录", "bay": row.bay}, "live")
            command["eventId"] = event_id
            command["version"] = 0
            command["intake"]["locationVersion"] = 0
            command["summary"]["version"] = 0
        else:
            authorize(actor, row, role)
            command = deepcopy(row.meta_json["command"])
        old = _prior(session, event_id, data, fingerprint)
        if old:
            return old
        if type(data.get("expectedVersion")) is not int or data["expectedVersion"] != command["version"]:
            fail(409, "事件版本已变化，请刷新核对后重新确认")
        handover_status = command.get("handover", {}).get("status")
        if row.status == "已完成" or (handover_status == "accepted" and action != "status"):
            fail(409, "已接收的移交或已完成的事件只读")
        if handover_status == "submitted" and action not in {"handover/review", "status"}:
            fail(409, "移交已提交，审核前不可更改材料和核验")
        _mutate(session, row, command, action, data, actor, child_id)
        command["version"] += 1
        command["updatedAt"] = now()
        row.updatedAtIso = command["updatedAt"]
        row.updatedAt = datetime.now().strftime("%H:%M")
        audit_id = _audit(session, row, actor, action, data["requestId"], {"version": command["version"]})
        command["lastAuditId"] = audit_id
        if action.startswith("verification"):
            command["verification"]["auditId"] = audit_id
        if action.startswith("handover"):
            command["handover"]["auditId"] = audit_id
        if action == "dispatch":
            command["dispatch"]["auditId"] = audit_id
        row.meta_json = {**row.meta_json, "command": command}
        response = _response(session, row, data["requestId"], audit_id)
        _save_receipt(session, event_id, data, fingerprint, response)
        return response


def upload_evidence(event_id, actor, name, mime, content):
    require_role(actor, "field")
    allowed = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
               "video/mp4": ".mp4", "video/webm": ".webm"}
    if mime not in allowed or not content or len(content) > 20 * 1024 * 1024:
        fail(422, "仅支持PNG/JPEG/WebP图片及MP4/WebM视频，大小不超过20MB")
    signatures = {"image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
                  "image/jpeg": content.startswith(b"\xff\xd8\xff"),
                  "image/webp": content[:4] == b"RIFF" and content[8:12] == b"WEBP",
                  "video/mp4": content[4:8] == b"ftyp", "video/webm": content.startswith(b"\x1aE\xdf\xa3")}
    if not signatures[mime]:
        fail(422, "文件内容与声明类型不符")
    with DB_LOCK, SessionLocal.begin() as session:
        row = _row(session, event_id, actor)
        authorize(actor, row, "field")
        _onsite(row)
        if row.meta_json["command"].get("handover", {}).get("status") in {"submitted", "accepted"}:
            fail(409, "移交已冻结，不能继续上传")
        digest = sha256(content).hexdigest()
        upload = session.scalar(select(CommandUpload).where(CommandUpload.eventId == event_id,
            CommandUpload.uploadedBy == actor.openid, CommandUpload.sha256 == digest))
        if not upload:
            upload = CommandUpload(uploadId="UP-" + uuid4().hex, eventId=event_id, uploadedBy=actor.openid,
                filename="cmd-" + uuid4().hex + allowed[mime], name=_text(name, "文件名", maximum=200),
                mimeType=mime, size=len(content), sha256=digest, createdAt=now())
            path = _evidence_path(upload.filename)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            session.add(upload)
        elif not _evidence_path(upload.filename).exists():
            _evidence_path(upload.filename).write_bytes(content)
        return {"uploadId": upload.uploadId, "url": f"/api/events/evidence/{upload.filename}",
                "mimeType": upload.mimeType, "size": upload.size, "sha256": upload.sha256,
                "name": upload.name, "kind": "video" if mime.startswith("video/") else "image"}


def authorize_file(filename, actor):
    with SessionLocal() as session:
        upload = session.scalar(select(CommandUpload).where(CommandUpload.filename == filename))
        if not upload:
            fail(404, "材料不存在")
        row = session.get(SafetyEvent, upload.eventId)
        if not row or not actor:
            fail(404, "材料不存在或不可访问")
        authorize(actor, row)
        return upload.mimeType
