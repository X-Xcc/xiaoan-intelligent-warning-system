from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import event_store


router = APIRouter(prefix="/events", tags=["events"])


class HelpIn(BaseModel):
    bay: str = "摩天湾"
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    contact: str | None = None


class ReportIn(BaseModel):
    category: str = Field(min_length=1)
    bay: str = Field(min_length=1)
    description: str = ""
    contact: str | None = None
    anonymous: bool = False
    photoCount: int = 0


class LostClaimIn(BaseModel):
    itemName: str = "儿童蓝色水杯"
    bay: str = "凤凰湾"
    contact: str | None = None


class EventStatusIn(BaseModel):
    status: str
    owner: str | None = None
    result: str | None = None


class SupplementIn(BaseModel):
    text: str = Field(min_length=1)


@router.get("")
def list_events(kind: str | None = None):
    return {"items": event_store.list_events(kind)}


@router.get("/overview")
def overview():
    return event_store.overview()


@router.post("/help")
def create_help(payload: HelpIn):
    event = event_store.create_help_event(
        bay=payload.bay,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        contact=payload.contact,
    )
    return {"event": event, "message": "求助已同步给工作人员，系统已生成高优先级工单"}


@router.post("/reports")
def create_report(payload: ReportIn):
    event = event_store.create_report_event(
        category=payload.category,
        bay=payload.bay,
        description=payload.description,
        anonymous=payload.anonymous,
        contact=payload.contact,
        photo_count=payload.photoCount,
    )
    return {"event": event, "message": "反馈已提交，工作人员会在后台接收处理"}


@router.post("/lost-claims")
def create_lost_claim(payload: LostClaimIn):
    event = event_store.create_lost_event(payload.itemName, payload.bay, payload.contact)
    return {"event": event, "message": "失物认领记录已提交服务台"}


@router.patch("/{event_id}/status")
def update_status(event_id: str, payload: EventStatusIn):
    try:
        event = event_store.update_event(event_id, payload.status, payload.owner, payload.result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return {"event": event}


@router.patch("/{event_id}/supplement")
def supplement_event(event_id: str, payload: SupplementIn):
    event = event_store.supplement_event(event_id, payload.text)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return {"event": event}
