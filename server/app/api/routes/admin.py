from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.api.access_control import require_admin_token
from app.services import admin_store, system_control


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin_token)])
public_router = APIRouter(prefix="/admin", tags=["admin"])


class AgentPatch(BaseModel):
    status: str | None = None
    currentTask: str | None = None
    latency: str | None = None
    config: dict[str, Any] | None = None


class SkillPatch(BaseModel):
    status: str | None = None
    trigger: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=100)
    config: dict[str, Any] | None = None


class MarketIn(BaseModel):
    marketId: str | None = None
    name: str = Field(min_length=1)
    district: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    status: str = "运行中"
    tone: str = "safe"
    summary: str = ""


class DeviceIn(BaseModel):
    deviceId: str = Field(min_length=1)
    marketId: str | None = None
    zoneId: str | None = None
    deviceType: str = Field(min_length=1)
    name: str = Field(min_length=1)
    status: str = "待接入"
    capabilities: list[str] = Field(default_factory=list)
    config: dict[str, Any] = Field(default_factory=dict)


class StaffIn(BaseModel):
    staffId: str = Field(min_length=1)
    name: str = Field(min_length=1)
    role: str = Field(min_length=1)
    latitude: float
    longitude: float
    modes: list[str] = Field(default_factory=lambda: ["walk"])
    online: bool = True
    accuracy: float | None = None


class VoiceBroadcastSettingsIn(BaseModel):
    enabled: bool = True
    fightAlertEnabled: bool = True
    dutyPlanEnabled: bool = True
    volume: int = Field(default=80, ge=0, le=100)
    rate: float = Field(default=1, ge=0.5, le=2)
    pitch: float = Field(default=1, ge=0, le=2)
    repeatCount: int = Field(default=1, ge=1, le=3)
    lang: str = "zh-CN"
    fightAlertTemplate: str = Field(min_length=1, max_length=280)
    dutyPlanTemplate: str = Field(min_length=1, max_length=280)


class PlatformSettingsIn(BaseModel):
    adminAuthEnabled: bool = False
    sourceAuthEnabled: bool = False
    publicWriteRateLimitPerMinute: int = Field(default=20, ge=1, le=120)
    evidenceUploadLimitMb: int = Field(default=20, ge=1, le=100)


class AccessKeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=lambda: ["source:ingest"])
    expiresAt: str | None = None


class AccessKeyPatch(BaseModel):
    status: str = Field(pattern="^(active|revoked)$")


def _operator(value: str | None) -> str:
    return (value or "管理台").strip()[:120] or "管理台"


@router.get("/overview")
def admin_overview():
    return admin_store.overview()


@public_router.get("/auth/status")
def admin_auth_status():
    return system_control.admin_auth_status()


@router.get("/voice-broadcast-settings")
def voice_broadcast_settings():
    return {"settings": admin_store.get_voice_broadcast_settings()}


@router.put("/voice-broadcast-settings")
def save_voice_broadcast_settings(
    payload: VoiceBroadcastSettingsIn,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    settings = admin_store.save_voice_broadcast_settings(payload.model_dump())
    system_control.record_system_audit(_operator(x_operator), "voice.settings.update", "voice-broadcast-settings")
    return {"settings": settings}


@router.get("/runtime-status")
def runtime_status():
    return system_control.runtime_status()


@router.get("/platform-settings")
def platform_settings():
    return {"settings": system_control.get_platform_settings()}


@router.put("/platform-settings")
def save_platform_settings(
    payload: PlatformSettingsIn,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    try:
        settings = system_control.save_platform_settings(payload.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    system_control.record_system_audit(
        _operator(x_operator),
        "platform.settings.update",
        "platform-settings",
        detail={
            "adminAuthEnabled": settings["adminAuthEnabled"],
            "sourceAuthEnabled": settings["sourceAuthEnabled"],
        },
    )
    return {"settings": settings}


@router.get("/access-keys")
def access_keys():
    return {"items": system_control.list_access_keys()}


@router.post("/access-keys")
def create_access_key(
    payload: AccessKeyIn,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    try:
        access_key = system_control.create_access_key(payload.name, payload.scopes, payload.expiresAt)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    system_control.record_system_audit(
        _operator(x_operator),
        "access_key.create",
        "service-access-key",
        access_key["keyId"],
        {"name": access_key["name"], "scopes": access_key["scopes"]},
    )
    return access_key


@router.patch("/access-keys/{key_id}")
def patch_access_key(
    key_id: str,
    payload: AccessKeyPatch,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    try:
        access_key = system_control.update_access_key(key_id, payload.status)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="来源服务密钥不存在") from exc
    system_control.record_system_audit(
        _operator(x_operator),
        "access_key.status.update",
        "service-access-key",
        key_id,
        {"status": access_key["status"]},
    )
    return {"accessKey": access_key}


@router.get("/agents")
def agents():
    return {"items": admin_store.list_agents()}


@router.patch("/agents/{agent_key}")
def patch_agent(
    agent_key: str,
    payload: AgentPatch,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    try:
        agent = admin_store.update_agent(
            agent_key,
            status=payload.status,
            current_task=payload.currentTask,
            latency=payload.latency,
            config=payload.config,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Agent 不存在") from exc
    system_control.record_system_audit(_operator(x_operator), "agent.update", "agent", agent_key)
    return {"agent": agent}


@router.get("/skills")
def skills():
    return {"items": admin_store.list_skills()}


@router.patch("/skills/{skill_key}")
def patch_skill(
    skill_key: str,
    payload: SkillPatch,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    try:
        skill = admin_store.update_skill(
            skill_key,
            status=payload.status,
            trigger=payload.trigger,
            confidence=payload.confidence,
            config=payload.config,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Skill 不存在") from exc
    system_control.record_system_audit(_operator(x_operator), "skill.update", "skill", skill_key)
    return {"skill": skill}


@router.get("/markets")
def markets():
    return {"items": admin_store.list_markets()}


@router.post("/markets")
def save_market(
    payload: MarketIn,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    market = admin_store.upsert_market(
        payload.marketId,
        payload.name,
        payload.district,
        payload.address,
        payload.latitude,
        payload.longitude,
        payload.status,
        payload.tone,
        payload.summary,
    )
    system_control.record_system_audit(_operator(x_operator), "market.upsert", "market", market["id"])
    return {"market": market}


@router.get("/devices")
def devices():
    return {"items": admin_store.list_devices()}


@router.post("/devices")
def save_device(
    payload: DeviceIn,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    device = admin_store.upsert_device(
        payload.deviceId,
        payload.marketId,
        payload.zoneId,
        payload.deviceType,
        payload.name,
        payload.status,
        payload.capabilities,
        payload.config,
    )
    system_control.record_system_audit(_operator(x_operator), "device.upsert", "device", device["deviceId"])
    return {"device": device}


@router.get("/staff")
def staff():
    return {"items": admin_store.list_staff()}


@router.post("/staff")
def save_staff(
    payload: StaffIn,
    x_operator: str | None = Header(default=None, alias="X-Operator"),
):
    saved_staff = admin_store.upsert_staff(
        payload.staffId,
        payload.name,
        payload.role,
        payload.latitude,
        payload.longitude,
        payload.modes,
        payload.online,
        payload.accuracy,
    )
    system_control.record_system_audit(_operator(x_operator), "staff.upsert", "staff", saved_staff["id"])
    return {"staff": saved_staff}


@router.get("/audit-logs")
def audit_logs(event_id: str | None = None, limit: int = 100):
    return {"items": admin_store.list_audit_logs(event_id, limit)}


@router.get("/system-audit-logs")
def system_audit_logs(limit: int = 100):
    return {"items": system_control.list_system_audit_logs(limit)}
