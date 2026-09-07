from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.services import command_workflow as workflow
from app.services.realtime import realtime_hub

router = APIRouter(prefix="/command", tags=["command"])


def optional_actor(authorization: str | None = Header(default=None)):
    token = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else None
    return workflow.actor_for_token(token, required=False)


def require_actor(authorization: str | None = Header(default=None)):
    token = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else None
    return workflow.actor_for_token(token)


class CommandWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requestId: str = Field(min_length=1, max_length=96)
    expectedVersion: int | None = Field(default=None, ge=0, strict=True)
    runKey: str | None = Field(default=None, max_length=96)
    scenarioId: str | None = None
    scenarioVersion: str | None = None
    transcript: str | None = Field(default=None, max_length=8000)
    bay: str | None = Field(default=None, max_length=80)
    locationText: str | None = Field(default=None, max_length=80)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    contact: str | None = Field(default=None, max_length=100)
    speakerName: str | None = Field(default=None, max_length=100)
    summaryVersion: int | None = Field(default=None, ge=0)
    locationVersion: int | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, max_length=80)
    text: str | None = Field(default=None, max_length=8000)
    riskTags: list[str] = Field(default_factory=list, max_length=20)
    dangerFactors: list[str] = Field(default_factory=list, max_length=20)
    note: str | None = Field(default=None, max_length=8000)
    staffId: str | None = Field(default=None, max_length=64)
    recommendationId: str | None = None
    query: str | None = Field(default=None, max_length=200)
    decision: str | None = None
    reason: str | None = Field(default=None, max_length=8000)
    uploadId: str | None = None
    kind: str | None = None
    name: str | None = Field(default=None, max_length=200)
    discoveredAt: str | None = None
    discoveredBy: str | None = None
    description: str | None = Field(default=None, max_length=8000)
    summary: str | None = Field(default=None, max_length=8000)
    evidenceIds: list[str] = Field(default_factory=list, max_length=200)
    status: str | None = None
    result: str | None = Field(default=None, max_length=8000)


def invoke(function, payload, *args, **kwargs):
    try:
        return function(*args, data=payload.model_dump(exclude_unset=True), **kwargs)
    except HTTPException as exc:
        exc.detail = {"message": exc.detail, "requestId": payload.requestId}
        raise


@router.get("/config")
def config():
    return {"demoEnabled": workflow.demo_enabled(), "scenarioVersion": workflow.scenario()["version"]}


@router.get("/scenario")
def scenario():
    return workflow.scenario()


@router.get("/me")
def me(actor=Depends(require_actor)):
    return {"openid": actor.openid, "roles": sorted(actor.roles), "staffId": actor.staff_id}


@router.get("/events")
def list_events(actor=Depends(require_actor)):
    return {"items": workflow.list_events(actor)}


@router.post("/intakes")
def create_intake(payload: CommandWrite, actor=Depends(require_actor)):
    return invoke(workflow.create_intake, payload, actor=actor)


@router.post("/demo-runs")
def create_demo(payload: CommandWrite, actor=Depends(require_actor)):
    return invoke(workflow.create_intake, payload, actor=actor, demo=True)


@router.get("/events/{event_id}/context")
def context(event_id: str, actor=Depends(require_actor)):
    return workflow.context(event_id, actor)


@router.get("/events/{event_id}/related-alerts")
def related(event_id: str, actor=Depends(require_actor)):
    return {"items": workflow.related_alerts(event_id, actor)}


@router.get("/events/{event_id}/receipts/{request_id}")
def receipt(event_id: str, request_id: str, actor=Depends(require_actor)):
    return workflow.receipt(event_id, request_id, actor)


@router.get("/events/{event_id}/route-preview")
def route_preview(event_id: str, staffId: str, actor=Depends(require_actor)):
    return {"route": workflow.route_preview(event_id, staffId, actor)}


@router.patch("/events/{event_id}/intake")
def edit_intake(event_id: str, payload: CommandWrite, actor=Depends(require_actor)):
    return invoke(workflow.execute, payload, event_id, "intake", actor=actor)


@router.post("/events/{event_id}/{action:path}")
async def command_action(event_id: str, action: str, payload: CommandWrite, actor=Depends(require_actor)):
    parts = action.split("/")
    child_id = None
    if len(parts) == 3 and parts[0] in {"verification", "handover"} and parts[2] == "review":
        child_id = parts[1]
        action = parts[0] + "/review"
    result = invoke(workflow.execute, payload, event_id, action, actor=actor, child_id=child_id)
    try:
        await realtime_hub.publish({"type": "command.updated", "eventId": event_id})
    except Exception:
        # The committed receipt remains authoritative; clients also poll.
        pass
    return result
