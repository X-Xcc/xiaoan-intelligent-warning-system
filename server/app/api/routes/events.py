import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from urllib.parse import urlsplit
from uuid import uuid4

from app.api.dependencies import enforce_public_write_rate_limit
from app.services import event_store
from app.services import system_control
from app.services import evidence_media
from app.services.realtime import realtime_hub
from app.services import command_workflow
from app.api.routes.command import optional_actor


router = APIRouter(prefix="/events", tags=["events"])
DEFAULT_EVIDENCE_DIR = Path(__file__).resolve().parents[3] / "data" / "event-evidence"
EVIDENCE_DIR = Path(os.getenv("CICSIC_EVIDENCE_DIR", str(DEFAULT_EVIDENCE_DIR))).resolve()
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


class HelpIn(BaseModel):
    bay: str = Field(min_length=1)
    description: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    contact: str | None = None
    marketId: str | None = None
    zoneId: str | None = None
    riskType: str | None = None
    evidence: list[dict[str, object]] = Field(default_factory=list)

    @field_validator("bay")
    @classmethod
    def valid_bay(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("bay must contain a place or manual address")
        return value.strip()

    @model_validator(mode="after")
    def complete_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be supplied together")
        return self


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
    requestId: str | None = None
    expectedVersion: int | None = None


class AssignIn(BaseModel):
    staff: str
    operator: str | None = None


class StaffLocationIn(BaseModel):
    staff: str = Field(min_length=1)
    latitude: float
    longitude: float
    accuracy: float | None = None


class SupplementIn(BaseModel):
    text: str = ""
    evidence: list[dict[str, object]] = Field(default_factory=list)

    @model_validator(mode="after")
    def nonempty_supplement(self):
        self.text = self.text.strip()
        if not self.text and not self.evidence:
            raise ValueError("text or evidence is required")
        for item in self.evidence:
            url = item.get("url")
            if not isinstance(url, str) or not url.strip() or any(char.isspace() for char in url) or "\\" in url:
                raise ValueError("evidence must have a valid URL")
            parsed = urlsplit(url)
            if not ((parsed.scheme in {"http", "https"} and parsed.hostname)
                    or (not parsed.scheme and url.startswith("/") and not url.startswith("//"))):
                raise ValueError("evidence URL must use HTTP, HTTPS or a backend-relative path")
        return self


class VisionReviewIn(BaseModel):
    judgement: dict
    operator: str | None = None


@router.get("")
def list_events(kind: str | None = None, actor=Depends(optional_actor)):
    controlled = [item for item in command_workflow.list_events(actor) if not kind or item["kind"] == kind]
    return {"items": [*event_store.list_events(kind), *controlled]}


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
    eventId: str | None = Form(default=None),
    actor=Depends(optional_actor),
    _: None = Depends(enforce_public_write_rate_limit),
):
    if eventId:
        if actor is None:
            raise HTTPException(401, "请登录获授权的处警账号")
        content = await file.read(20 * 1024 * 1024 + 1)
        return {"evidence": command_workflow.upload_evidence(eventId, actor, file.filename, file.content_type, content)}
    limit_mb = system_control.get_platform_settings()["evidenceUploadLimitMb"]
    content = await file.read(limit_mb * 1024 * 1024 + 1)
    if len(content) > limit_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件过大")
    try:
        mime, suffix = evidence_media.validate_upload(content, file.content_type)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    stored_name = f"{uuid4().hex}{suffix}"
    try:
        with (EVIDENCE_DIR / stored_name).open("xb") as target:
            target.write(content)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail="请重试上传") from exc
    return {
        "evidence": {
            "kind": "video" if mime.startswith("video/") else "image",
            "name": file.filename,
            "mimeType": mime,
            "url": f"/api/events/evidence/{stored_name}",
            "size": len(content),
        }
    }


@router.get("/evidence/{filename}")
def get_evidence(filename: str, actor=Depends(optional_actor)):
    if (not filename or filename in {".", ".."} or filename.endswith((" ", "."))
            or any(char in filename for char in "/\\:")
            or any(ord(char) < 32 or ord(char) == 127 for char in filename)):
        raise HTTPException(status_code=404, detail="证据文件不存在")
    protected_mime = command_workflow.authorize_file(filename, actor) if filename.lower().startswith("cmd-") else None
    try:
        source = EVIDENCE_DIR / filename
        target = source.resolve()
        if source.is_symlink() or target.parent != EVIDENCE_DIR or not target.is_file():
            raise HTTPException(status_code=404, detail="证据文件不存在")
        with target.open("rb") as evidence:
            mime = evidence_media.inline_media_type(
                evidence.read(evidence_media.HEADER_LIMIT), os.fstat(evidence.fileno()).st_size,
                target.suffix, protected_mime,
            )
    except (OSError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=404, detail="证据文件不存在") from exc
    return FileResponse(
        target, media_type=mime or "application/octet-stream", filename=target.name,
        content_disposition_type="inline" if mime else "attachment",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'",
        },
    )


@router.post("/staff-location")
def update_staff_location(payload: StaffLocationIn):
    try:
        staff = event_store.update_staff_location(payload.staff, payload.latitude, payload.longitude, payload.accuracy)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"staff": staff}


@router.get("/staff-tasks")
def staff_tasks(staff: str, actor=Depends(optional_actor)):
    try:
        items = event_store.list_staff_tasks(staff)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    controlled = []
    if actor and actor.staff_id and staff in {actor.staff_id, *[
        entry["name"] for entry in event_store.list_staff() if entry["id"] == actor.staff_id
    ]}:
        controlled = [item for item in command_workflow.list_events(actor)
                      if item["status"] != "已提交" and item["meta"].get("assignment", {}).get("staffId") == actor.staff_id]
    return {"items": [*items, *controlled]}


@router.post("/security-detections/sync")
async def sync_security_detections():
    items = event_store.sync_security_detections()
    if items:
        await realtime_hub.publish({"type": "security_detection.synced", "count": len(items), "target": "command_center"})
    return {"count": len(items), "items": items}


@router.post("/{event_id}/vision-review")
async def attach_vision_review(event_id: str, payload: VisionReviewIn):
    try:
        event = event_store.attach_vision_review(event_id, payload.judgement, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    await realtime_hub.publish({"type": "vision_review.attached", "eventId": event_id, "target": "command_center"})
    return {"event": event}


@router.get("/{event_id}")
def event_detail(event_id: str, actor=Depends(optional_actor)):
    event = event_store.get_event(event_id, include_command=True)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    if event.get("meta", {}).get("command") and not command_workflow.can_read(actor, event):
        raise HTTPException(404, "事件不存在或不可访问")
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
def update_status(event_id: str, payload: EventStatusIn, actor=Depends(optional_actor)):
    if payload.requestId is not None:
        if actor is None:
            raise HTTPException(401, "请登录获授权的处警账号")
        return command_workflow.execute(event_id, "status", payload.model_dump(exclude_none=True), actor)
    try:
        event = event_store.update_event(event_id, payload.status, payload.owner, payload.result, payload.operator)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return {"event": event}


@router.patch("/{event_id}/assign")
async def assign_event(event_id: str, payload: AssignIn):
    try:
        event = event_store.assign_event(event_id, payload.staff, payload.operator)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
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
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return {"event": event, "route": (event.get("meta") or {}).get("route")}


@router.patch("/{event_id}/supplement")
def supplement_event(event_id: str, payload: SupplementIn):
    try:
        event = event_store.supplement_event(event_id, payload.text, payload.evidence)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
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
