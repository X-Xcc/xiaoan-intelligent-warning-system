from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.dependencies import require_source_ingest_key
from app.services import security_linkage
from app.services.realtime import realtime_hub


router = APIRouter(prefix="/security-linkage", tags=["security-linkage"])


class DeviceObservationIn(BaseModel):
    deviceId: str = Field(min_length=1)
    deviceType: str = Field(min_length=1)
    eventKey: str | None = None
    cameraId: str | None = None
    cameraName: str | None = None
    deviceName: str | None = None
    marketId: str | None = None
    zoneId: str | None = None
    timestamp: str | None = None
    riskType: str | None = None
    behaviorScore: float | None = None
    crowdScore: float | None = None
    thermalScore: float | None = None
    confidence: float | None = None
    personCount: int | None = None
    crowdCount: int | None = None
    frameCount: int | None = None
    fps: float | None = None
    imageFilename: str | None = None
    path: str | None = None
    description: str | None = None
    location: dict[str, Any] | None = None
    evidence: list[dict[str, Any]] = Field(default_factory=list)


class DroneTaskIn(BaseModel):
    eventId: str | None = None
    riskRecordId: str | None = None
    marketId: str | None = None
    zoneId: str | None = None
    taskArea: str = Field(min_length=1)
    waypoints: list[dict[str, Any]] = Field(default_factory=list)
    priority: str = "中"
    broadcastText: str | None = None
    videoUrl: str | None = None
    deviceStatus: str | None = None
    evidence: list[dict[str, Any]] = Field(default_factory=list)


class DroneReceiptIn(BaseModel):
    status: str | None = None
    videoUrl: str | None = None
    deviceStatus: str | None = None
    evidence: list[dict[str, Any]] | None = None


@router.get("/overview")
def linkage_overview():
    return security_linkage.overview()


@router.post("/observations", dependencies=[Depends(require_source_ingest_key)])
async def ingest_observation(payload: DeviceObservationIn):
    try:
        result = security_linkage.ingest_device_observation(payload.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await realtime_hub.publish({"type": "linkage.observation", "eventId": result["event"]["id"], "target": "command_center"})
    return result


@router.post("/drone-tasks")
async def create_drone_task(payload: DroneTaskIn):
    try:
        task = security_linkage.create_drone_task(payload.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await realtime_hub.publish({"type": "drone.task.created", "taskId": task["taskId"], "target": "command_center"})
    return {"task": task}


@router.patch("/drone-tasks/{task_id}/receipt")
async def update_drone_receipt(task_id: str, payload: DroneReceiptIn):
    task = security_linkage.update_drone_task_receipt(task_id, payload.model_dump(exclude_none=True))
    if task is None:
        raise HTTPException(status_code=404, detail="无人机任务不存在")
    await realtime_hub.publish({"type": "drone.task.receipt", "taskId": task_id, "target": "command_center"})
    return {"task": task}
