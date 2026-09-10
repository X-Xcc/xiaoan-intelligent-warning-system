from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.access_control import require_admin_token
from app.services import security_ops
from app.services.realtime import realtime_hub


router = APIRouter(prefix="/security-ops", tags=["security-ops"], dependencies=[Depends(require_admin_token)])


class RoleIn(BaseModel):
    openid: str = Field(min_length=1)
    role: str = Field(min_length=1)
    displayName: str | None = None
    permissions: list[str] | None = None


class DutyPlanIn(BaseModel):
    planDate: str | None = None


class DispatchRuleIn(BaseModel):
    ruleKey: str | None = None
    name: str = Field(min_length=1)
    triggerType: str = Field(min_length=1)
    conditions: dict
    action: dict
    targetRole: str = Field(min_length=1)
    enabled: bool = True


class VoiceIntakeIn(BaseModel):
    transcript: str = Field(min_length=1)
    bay: str = Field(min_length=1)
    channel: str = "voice"
    contact: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    speaker: str | None = None
    autoAssign: bool = True


class NotificationIn(BaseModel):
    eventId: str | None = None
    channel: str = Field(min_length=1)
    target: str = Field(min_length=1)
    title: str = Field(min_length=1)
    body: str = Field(min_length=1)
    status: str = "待发送"
    meta: dict | None = None


class DataFeedIn(BaseModel):
    sourceKey: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    name: str = Field(min_length=1)
    endpoint: str | None = None
    enabled: bool = True
    status: str = "待接入"
    payload: dict | None = None


class IdentityProfileIn(BaseModel):
    personKey: str | None = None
    name: str = Field(min_length=1)
    idNumber: str | None = None
    archiveNo: str | None = None
    tags: list[str] | None = None
    faceImage: str | None = None
    faceFingerprint: str | None = None
    notes: str | None = None


class TrackIn(BaseModel):
    personKey: str | None = None
    points: list[dict] = Field(default_factory=list)
    cameraId: str | None = None
    cameraName: str | None = None
    eventId: str | None = None
    behavior: str | None = None
    endAt: str | None = None


class TargetLockIn(BaseModel):
    targetName: str = Field(min_length=1)
    personKey: str | None = None
    eventId: str | None = None
    reason: str | None = None
    status: str = "锁定中"


class ContainmentPlanIn(BaseModel):
    eventId: str | None = None
    targetKey: str | None = None
    title: str | None = None


class AnalysisReportIn(BaseModel):
    period: str = "day"
    start: str | None = None
    end: str | None = None


@router.get("/overview")
def overview():
    return security_ops.summary()


@router.get("/roles")
def list_roles():
    return {"items": security_ops.list_roles()}


@router.patch("/roles/{openid}")
def update_role(openid: str, payload: RoleIn):
    return {"role": security_ops.upsert_role(openid, payload.role, payload.displayName, payload.permissions)}


@router.get("/duty-plans")
def duty_plans(limit: int = 20):
    return {"items": security_ops.list_duty_plans(limit)}


@router.post("/duty-plans/generate")
async def generate_duty_plans(payload: DutyPlanIn | None = None):
    items = security_ops.generate_duty_plans(payload.planDate if payload else None)
    await realtime_hub.publish({"type": "duty_plan.generated", "count": len(items), "target": "command_center"})
    return {"items": items}


@router.get("/dispatch-rules")
def dispatch_rules(limit: int = 50):
    return {"items": security_ops.list_dispatch_rules(limit)}


@router.post("/dispatch-rules")
def save_dispatch_rule(payload: DispatchRuleIn):
    return {
        "rule": security_ops.save_dispatch_rule(
            payload.name,
            payload.triggerType,
            payload.conditions,
            payload.action,
            payload.targetRole,
            payload.enabled,
            payload.ruleKey,
        )
    }


@router.post("/voice-intakes")
async def voice_intake(payload: VoiceIntakeIn):
    result = security_ops.record_voice_intake(
        payload.transcript,
        payload.bay,
        payload.channel,
        payload.contact,
        payload.latitude,
        payload.longitude,
        payload.speaker,
        payload.autoAssign,
    )
    await realtime_hub.publish({"type": "voice_intake.created", "target": "command_center", "intent": result["intent"]})
    return result


@router.get("/notifications")
def notifications(limit: int = 50, channel: str | None = None, status: str | None = None):
    return {"items": security_ops.list_notifications(limit, channel, status)}


@router.post("/notifications")
async def create_notification(payload: NotificationIn):
    item = security_ops.queue_notification(
        payload.eventId,
        payload.channel,
        payload.target,
        payload.title,
        payload.body,
        payload.status,
        payload.meta or {},
    )
    await realtime_hub.publish({"type": "notification.queued", "channel": payload.channel, "target": payload.target})
    return {"notification": item}


@router.get("/data-feeds")
def data_feeds(limit: int = 50):
    return {"items": security_ops.list_data_feeds(limit)}


@router.post("/data-feeds")
def save_data_feed(payload: DataFeedIn):
    return {
        "feed": security_ops.upsert_data_feed(
            payload.sourceKey,
            payload.kind,
            payload.name,
            payload.endpoint,
            payload.enabled,
            payload.status,
            payload.payload or {},
        )
    }


@router.post("/data-feeds/{source_key}/sync")
async def sync_data_feed(source_key: str, payload: dict | None = None):
    item = security_ops.sync_data_feed(source_key, payload or {})
    await realtime_hub.publish({"type": "data_feed.synced", "sourceKey": source_key, "target": "command_center"})
    return {"feed": item}


@router.get("/identity-profiles")
def identity_profiles(limit: int = 50):
    return {"items": security_ops.list_identity_profiles(limit)}


@router.post("/identity-profiles")
def save_identity_profile(payload: IdentityProfileIn):
    return {
        "profile": security_ops.upsert_identity_profile(
            payload.name,
            payload.idNumber,
            payload.archiveNo,
            payload.tags,
            payload.faceImage,
            payload.faceFingerprint,
            payload.notes,
            payload.personKey,
        )
    }


@router.post("/identity-profiles/compare")
def compare_identity(query: dict):
    text = str(query.get("query") or query.get("text") or "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="query is required")
    return {"items": security_ops.compare_identity_archive(text)}


@router.get("/track-records")
def track_records(limit: int = 100, personKey: str | None = None, eventId: str | None = None):
    return {"items": security_ops.list_track_records(limit, personKey, eventId)}


@router.post("/track-records")
def save_track_record(payload: TrackIn):
    return {
        "track": security_ops.record_track(
            payload.personKey,
            payload.points,
            payload.cameraId,
            payload.cameraName,
            payload.eventId,
            payload.behavior,
            payload.endAt,
        )
    }


@router.get("/target-locks")
def target_locks(limit: int = 50):
    return {"items": security_ops.list_target_locks(limit)}


@router.post("/target-locks")
async def create_target_lock(payload: TargetLockIn):
    item = security_ops.lock_target(payload.targetName, payload.personKey, payload.eventId, payload.reason, payload.status)
    await realtime_hub.publish({"type": "target.locked", "target": "command_center", "targetKey": item["targetKey"]})
    return {"target": item}


@router.get("/containment-plans")
def containment_plans(limit: int = 20):
    return {"items": security_ops.list_containment_plans(limit)}


@router.post("/containment-plans")
async def create_containment_plan(payload: ContainmentPlanIn):
    item = security_ops.create_containment_plan(payload.eventId, payload.targetKey, payload.title)
    await realtime_hub.publish({"type": "containment_plan.created", "target": "command_center", "planId": item["planId"]})
    return {"plan": item}


@router.get("/analysis/reports")
def analysis_reports(limit: int = 20):
    return {"items": security_ops.list_analysis_reports(limit)}


@router.post("/analysis/reports")
async def create_analysis_report(payload: AnalysisReportIn):
    item = security_ops.generate_analysis_report(payload.period, payload.start, payload.end)
    await realtime_hub.publish({"type": "analysis_report.created", "target": "command_center"})
    return {"report": item}
