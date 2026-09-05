import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from uuid import uuid4

from app.api.dependencies import enforce_public_write_rate_limit
from app.services import event_store
from app.services import system_control
from app.services.realtime import realtime_hub


router = APIRouter(prefix="/events", tags=["events"])
DEFAULT_EVIDENCE_DIR = Path(__file__).resolve().parents[3] / "data" / "event-evidence"
EVIDENCE_DIR = Path(os.getenv("CICSIC_EVIDENCE_DIR", str(DEFAULT_EVIDENCE_DIR))).resolve()
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


class HelpIn(BaseModel):
    bay: str = Field(min_length=1)
    description: str | None = None
    latitude: float
    longitude: float
    contact: str | None = None
    marketId: str | None = None
    zoneId: str | None = None
    riskType: str | None = None
    evidence: list[dict[str, object]] = Field(default_factory=list)


class ReportIn(BaseModel):
    category: str = Field(min_length=1)
    bay: str = Field(min_length=1)
    description: str = ""
    contact: str | None = None
    anonymous: bool = False
    photoCount: int = 0
    marketId: str | None = None
    zoneId: str | None = None
    evidence: list[dict[str, object]] = Field(default_factory=list)


class LostClaimIn(BaseModel):
    itemName: str = Field(min_length=1)
    bay: str = Field(min_length=1)
    contact: str | None = None


class EventStatusIn(BaseModel):
    status: str
    owner: str | None = None
    result: str | None = None
    operator: str | None = None


class AssignIn(BaseModel):
    staff: str
    operator: str | None = None


class StaffLocationIn(BaseModel):
    staff: str = Field(min_length=1)
    latitude: float
    longitude: float
    accuracy: float | None = None


class SupplementIn(BaseModel):
    text: str = Field(min_length=1)


class VisionReviewIn(BaseModel):
    judgement: dict
    operator: str | None = None


@router.get("")
def list_events(kind: str | None = None):
    return {"items": event_store.list_events(kind)}


@router.get("/overview")
def overview():
    return event_store.overview()


@router.get("/alarm-pushes")
def alarm_pushes(event_id: str | None = None, status: str | None = None):
    return {"items": event_store.list_alarm_pushes(event_id, status)}


@router.get("/night-markets")
def night_markets():
    items = event_store.list_night_markets()
    return {"count": len(items), "items": items}


@router.get("/staff")
def staff_list():
    return {"items": event_store.list_staff()}


@router.post("/evidence")
async def upload_evidence(
    file: UploadFile = File(...),
    _: None = Depends(enforce_public_write_rate_limit),
):
    content = await file.read()
    limit_mb = system_control.get_platform_settings()["evidenceUploadLimitMb"]
    if len(content) > limit_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件过大")
    suffix = Path(file.filename or "").suffix or ".bin"
    stored_name = f"{uuid4().hex}{suffix}"
    (EVIDENCE_DIR / stored_name).write_bytes(content)
    return {
        "evidence": {
            "kind": "video" if (file.content_type or "").startswith("video/") else "image",
            "name": file.filename,
            "mimeType": file.content_type,
            "url": f"/api/events/evidence/{stored_name}",
            "size": len(content),
        }
    }


@router.get("/evidence/{filename}")
def get_evidence(filename: str):
    target = (EVIDENCE_DIR / filename).resolve()
    if EVIDENCE_DIR not in target.parents or not target.exists():
        raise HTTPException(status_code=404, detail="证据文件不存在")
    return FileResponse(target)


@router.post("/staff-location")
def update_staff_location(payload: StaffLocationIn):
    try:
        staff = event_store.update_staff_location(payload.staff, payload.latitude, payload.longitude, payload.accuracy)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"staff": staff}


@router.get("/staff-tasks")
def staff_tasks(staff: str):
    try:
        items = event_store.list_staff_tasks(staff)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"items": items}


@router.post("/security-detections/sync")
async def sync_security_detections():
    items = event_store.sync_security_detections()
    if items:
        await realtime_hub.publish({"type": "security_detection.synced", "count": len(items), "target": "command_center"})
    return {"count": len(items), "items": items}


@router.post("/{event_id}/vision-review")
async def attach_vision_review(event_id: str, payload: VisionReviewIn):
    event = event_store.attach_vision_review(event_id, payload.judgement, payload.operator)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    await realtime_hub.publish({"type": "vision_review.attached", "eventId": event_id, "target": "command_center"})
    return {"event": event}


@router.get("/{event_id}")
def event_detail(event_id: str):
    event = event_store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return {"event": event}


@router.post("/help")
async def create_help(payload: HelpIn, _: None = Depends(enforce_public_write_rate_limit)):
    event = event_store.create_help_event(
        bay=payload.bay,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        contact=payload.contact,
        market_id=payload.marketId,
        zone_id=payload.zoneId,
        risk_type=payload.riskType,
        evidence=payload.evidence,
    )
    await realtime_hub.publish({"type": "alarm.created", "eventId": event["id"], "target": "command_center"})
    return {"event": event, "message": "求助已发给指挥中心，等派单"}


@router.post("/reports")
def create_report(payload: ReportIn, _: None = Depends(enforce_public_write_rate_limit)):
    event = event_store.create_report_event(
        category=payload.category,
        bay=payload.bay,
        description=payload.description,
        anonymous=payload.anonymous,
        contact=payload.contact,
        photo_count=payload.photoCount,
        market_id=payload.marketId,
        zone_id=payload.zoneId,
        evidence=payload.evidence,
    )
    return {"event": event, "message": "上报已提交，指挥端会接收"}


@router.post("/lost-claims")
def create_lost_claim(payload: LostClaimIn, _: None = Depends(enforce_public_write_rate_limit)):
    event = event_store.create_lost_event(payload.itemName, payload.bay, payload.contact)
    return {"event": event, "message": "线索已提交给工作人员"}


@router.patch("/{event_id}/status")
def update_status(event_id: str, payload: EventStatusIn):
    try:
        event = event_store.update_event(event_id, payload.status, payload.owner, payload.result, payload.operator)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return {"event": event}


@router.patch("/{event_id}/assign")
async def assign_event(event_id: str, payload: AssignIn):
    try:
        event = event_store.assign_event(event_id, payload.staff, payload.operator)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    await realtime_hub.publish({"type": "event.assigned", "eventId": event_id, "staff": event["owner"]})
    return {"event": event}


@router.get("/{event_id}/route")
def route_event(
    event_id: str,
    staff: str,
    latitude: float | None = None,
    longitude: float | None = None,
    accuracy: float | None = None,
):
    try:
        event = event_store.recommend_route(event_id, staff, latitude, longitude, accuracy)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return {"event": event, "route": (event.get("meta") or {}).get("route")}


@router.patch("/{event_id}/supplement")
def supplement_event(event_id: str, payload: SupplementIn):
    event = event_store.supplement_event(event_id, payload.text)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return {"event": event}


@router.patch("/alarm-pushes/{push_id}/acknowledge")
async def acknowledge_alarm_push(push_id: str):
    push = event_store.acknowledge_alarm_push(push_id)
    if not push:
        raise HTTPException(status_code=404, detail="报警推送不存在")
    await realtime_hub.publish({"type": "alarm.acknowledged", "eventId": push["eventId"], "target": "command_center"})
    return {"push": push}


@router.websocket("/realtime")
async def realtime_events(websocket: WebSocket):
    await realtime_hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        realtime_hub.disconnect(websocket)
