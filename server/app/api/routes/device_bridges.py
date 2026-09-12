from __future__ import annotations

from collections import OrderedDict
import asyncio
import logging
import secrets
import threading
import time
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from starlette.concurrency import run_in_threadpool

from app.api.access_control import require_admin_token
from app.services import system_control
from app.services.device_bridges import get_manager

logger = logging.getLogger(__name__)
COOKIE_NAME = "cicsic_bridge_preview"
COOKIE_PATH = "/api/device-bridges"
SESSION_SECONDS = 3600
_media_sessions: dict[str, dict] = {}
_sessions: OrderedDict[str, tuple[float, str | None]] = OrderedDict()
_session_lock = threading.Lock()


class BridgeRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handle(request: Request):
            try:
                response = await original(request)
            except RequestValidationError as exc:
                # FastAPI's default validation response includes the submitted input.
                response = JSONResponse(status_code=422, content={"detail": [
                    {"loc": list(error["loc"]), "msg": "字段格式或取值不正确", "type": error["type"]}
                    for error in exc.errors()
                ]})
            except KeyError:
                response = JSONResponse(status_code=404, content={"detail": "设备不存在或已删除"})
            except ValueError as exc:
                response = JSONResponse(status_code=400, content={"detail": str(exc)})
            except (RuntimeError, OSError):
                response = JSONResponse(status_code=503, content={"detail": "桥接服务暂不可用，请检查运行环境和加密配置"})
            response.headers["Cache-Control"] = "no-store, max-age=0"
            response.headers["X-Content-Type-Options"] = "nosniff"
            return response

        return handle


router = APIRouter(prefix=COOKIE_PATH.removeprefix("/api"), tags=["device-bridges"], route_class=BridgeRoute)
admin = [Depends(require_admin_token)]


class DeviceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    kind: Literal["go2", "hikvision", "dahua", "rtsp", "http_snapshot", "http_mjpeg"]
    host: str = Field(default="", max_length=253)
    port: int = Field(default=554, ge=1, le=65535, strict=True)
    username: str = Field(default="", max_length=128)
    password: SecretStr | None = Field(default=None, max_length=512)
    rtspPath: str = Field(default="", max_length=2048)
    channel: int = Field(default=1, ge=1, le=256, strict=True)
    stream: Literal["main", "sub"] = "main"
    go2Mode: Literal["LocalSTA", "LocalAP"] = "LocalSTA"
    autoStart: bool = Field(default=False, strict=True)
    httpScheme: Literal["http", "https"] = "http"
    httpPath: str = Field(default="", max_length=2048)


class DeviceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=100)
    kind: Literal["go2", "hikvision", "dahua", "rtsp", "http_snapshot", "http_mjpeg"] | None = None
    host: str | None = Field(default=None, max_length=253)
    port: int | None = Field(default=None, ge=1, le=65535, strict=True)
    username: str | None = Field(default=None, max_length=128)
    password: SecretStr | None = Field(default=None, max_length=512)
    rtspPath: str | None = Field(default=None, max_length=2048)
    channel: int | None = Field(default=None, ge=1, le=256, strict=True)
    stream: Literal["main", "sub"] | None = None
    go2Mode: Literal["LocalSTA", "LocalAP"] | None = None
    autoStart: bool | None = Field(default=None, strict=True)
    httpScheme: Literal["http", "https"] | None = None
    httpPath: str | None = Field(default=None, max_length=2048)


class BindingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bindings: list[str | None] = Field(min_length=16, max_length=16)


def _device_values(payload: DeviceInput | DeviceUpdate) -> dict[str, Any]:
    values = payload.model_dump(exclude_none=True, exclude_unset=isinstance(payload, DeviceUpdate))
    if payload.password is not None:
        values["password"] = payload.password.get_secret_value()
    return values


def _preview_authorized(cookie: str | None) -> bool:
    if not cookie:
        return False
    with _session_lock:
        entry = _sessions.get(cookie)
        if not entry or entry[0] <= time.monotonic():
            _sessions.pop(cookie, None)
            return False
    return system_control.verify_admin_token(entry[1])


async def require_preview(request: Request, x_admin_token: str | None = Header(default=None)):
    return


@router.get("/auth")
def auth_status(x_admin_token: str | None = Header(default=None)):
    return {**system_control.admin_auth_status(), "authorized": system_control.verify_admin_token(x_admin_token)}


@router.post("/session", dependencies=admin)
def preview_session(request: Request, response: Response, x_admin_token: str | None = Header(default=None)):
    key = secrets.token_urlsafe(32)
    with _session_lock:
        now = time.monotonic()
        _sessions.pop(request.cookies.get(COOKIE_NAME, ""), None)
        for expired in [value for value, entry in _sessions.items() if entry[0] <= now]:
            _sessions.pop(expired, None)
        while len(_sessions) >= 128:
            _sessions.popitem(last=False)
        _sessions[key] = (now + SESSION_SECONDS, x_admin_token)
    response.set_cookie(
        COOKIE_NAME, key, max_age=SESSION_SECONDS, httponly=True,
        secure=request.url.scheme == "https", samesite="strict", path=COOKIE_PATH,
    )
    return {"authorized": True, "expiresIn": SESSION_SECONDS}


@router.delete("/session")
def close_preview_session(request: Request, response: Response):
    with _session_lock:
        _sessions.pop(request.cookies.get(COOKIE_NAME, ""), None)
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH)
    return {"authorized": False}


@router.get("", dependencies=admin)
@router.get("/", dependencies=admin, include_in_schema=False)
def list_devices():
    manager = get_manager()
    return {"items": manager.list_devices(), "bindings": manager.get_bindings(), "runtime": manager.runtime_info()}


@router.post("", dependencies=admin)
@router.post("/", dependencies=admin, include_in_schema=False)
def create_device(payload: DeviceInput):
    return {"device": get_manager().create_device(_device_values(payload))}


@router.put("/bindings", dependencies=admin)
def save_bindings(payload: BindingInput):
    return {"bindings": get_manager().set_bindings(payload.bindings)}


@router.get("/readiness", dependencies=admin)
def readiness():
    return get_manager().readiness_snapshot()


@router.get("/{device_id}", dependencies=admin)
def get_device(device_id: str):
    return {"device": get_manager().get_device(device_id)}


@router.put("/{device_id}", dependencies=admin)
def update_device(device_id: str, payload: DeviceUpdate):
    return {"device": get_manager().update_device(device_id, _device_values(payload))}


@router.delete("/{device_id}", dependencies=admin)
def delete_device(device_id: str):
    get_manager().delete_device(device_id)
    return {"deleted": True}


@router.post("/{device_id}/test", dependencies=admin)
def test_device(device_id: str):
    return get_manager().test_device(device_id, timeout=12)


@router.post("/{device_id}/{action}", dependencies=admin)
def device_action(device_id: str, action: Literal["start", "stop", "restart"]):
    method = {"start": "start_device", "stop": "stop_device", "restart": "restart_device"}[action]
    return {"device": getattr(get_manager(), method)(device_id)}


@router.get("/{device_id}/snapshot", dependencies=[Depends(require_preview)])
def snapshot(device_id: str):
    manager = get_manager()
    manager.get_device(device_id)
    image = manager.snapshot(device_id)
    if image is None:
        raise HTTPException(status_code=503, detail="设备尚未提供新鲜视频帧")
    return Response(image, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


def _stream_frames(manager, device_id: str, cookie: str | None, token: str | None):
    for image in manager.frames(device_id):
        yield (b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
               + str(len(image)).encode("ascii") + b"\r\n\r\n" + image + b"\r\n")


@router.get("/{device_id}/feed", dependencies=[Depends(require_preview)])
def feed(device_id: str, request: Request, x_admin_token: str | None = Header(default=None)):
    manager = get_manager()
    manager.get_device(device_id)
    if manager.snapshot(device_id) is None:
        raise HTTPException(status_code=503, detail="设备尚未提供新鲜视频帧")

    return StreamingResponse(
        _stream_frames(manager, device_id, request.cookies.get(COOKIE_NAME), x_admin_token),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


class VideoOffer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sdp: str = Field(min_length=1, max_length=100_000)
    type: Literal["offer"]


async def _media_watch(identifier, session):
    manager = session["manager"]
    next_renew = 0.0
    try:
        while time.monotonic() < session["expires"]:
            if manager.media_endpoint(session["device"]) != session["endpoint"]:
                break
            if time.monotonic() >= next_renew:
                await run_in_threadpool(manager.media_request, session["endpoint"], "renew", {"id": identifier})
                next_renew = time.monotonic() + 2
            await asyncio.sleep(0.5)
    except (RuntimeError, OSError, KeyError, ValueError):
        pass
    finally:
        _media_sessions.pop(identifier, None)
        try:
            await run_in_threadpool(manager.media_request, session["endpoint"], "close", {"id": identifier})
        except (RuntimeError, OSError, ValueError):
            pass


@router.post("/{device_id}/webrtc/offer", dependencies=[Depends(require_preview)])
async def video_offer(device_id: str, payload: VideoOffer, request: Request,
                      x_admin_token: str | None = Header(default=None)):
    if len(_media_sessions) >= 64:
        raise HTTPException(status_code=429, detail="视频播放连接已达上限")
    manager = get_manager()
    endpoint = manager.media_endpoint(device_id)
    answer = await run_in_threadpool(manager.media_request, endpoint, "offer", payload.model_dump())
    identifier = answer["id"]
    session = {"manager": manager, "device": device_id, "endpoint": endpoint,
               "token": x_admin_token, "cookie": request.cookies.get(COOKIE_NAME),
               "expires": time.monotonic() + 10}
    _media_sessions[identifier] = session
    session["task"] = asyncio.create_task(_media_watch(identifier, session))
    return answer


def _media_session(device_id, identifier, request, token):
    session = _media_sessions.get(identifier)
    if not session or session["device"] != device_id:
        raise HTTPException(status_code=404, detail="视频播放会话已结束")
    return session


@router.post("/{device_id}/webrtc/{identifier}/renew", dependencies=[Depends(require_preview)])
async def renew_video(device_id: str, identifier: str, request: Request,
                      x_admin_token: str | None = Header(default=None)):
    session = _media_session(device_id, identifier, request, x_admin_token)
    session["expires"] = time.monotonic() + 10
    return {"alive": True}


@router.post("/{device_id}/webrtc/{identifier}/close", dependencies=[Depends(require_preview)])
async def close_video(device_id: str, identifier: str, request: Request,
                      x_admin_token: str | None = Header(default=None)):
    session = _media_session(device_id, identifier, request, x_admin_token)
    session["expires"] = 0
    await session["task"]
    return {"closed": True}


def start_bridge_runtime():
    try:
        get_manager().startup()
    except (RuntimeError, OSError, ValueError):
        logger.error("Device bridge startup failed; stored configuration was left unchanged")


def stop_bridge_runtime():
    try:
        get_manager().shutdown()
    except (RuntimeError, OSError, ValueError):
        logger.error("Device bridge shutdown could not initialize its configuration")
