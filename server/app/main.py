from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.admin import public_router as public_admin_router
from app.api.routes.admin import router as admin_router
from app.api.routes.db_admin import router as db_admin_router
from app.api.routes.events import router as events_router
from app.api.routes.health import router as health_router
from app.api.routes.security_linkage import router as security_linkage_router
from app.api.routes.security_ai import router as security_ai_router
from app.api.routes.security_ops import router as security_ops_router
from app.api.routes.security_video import router as security_video_router
from app.api.routes.deployment_config import router as deployment_config_router
from app.api.routes.platform import router as platform_router
from app.api.routes.ai_center import router as ai_center_router
from app.api.routes.training import router as training_router
from app.api.routes.command import router as command_router
from app.api.routes.device_bridges import router as device_bridges_router
from app.api.routes.device_bridges import start_bridge_runtime, stop_bridge_runtime
from app.services.auth_store import init_auth_db
from app.services.admin_store import ensure_market_defaults
from app.services.event_store import init_db
from app.services.local_env import load_local_env


load_local_env()

app = FastAPI(title="小安智能预警系统 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or uuid4().hex
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response

app.include_router(health_router, prefix="/api")
app.include_router(deployment_config_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(public_admin_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(db_admin_router, prefix="/api")
app.include_router(events_router, prefix="/api")
app.include_router(security_linkage_router, prefix="/api")
app.include_router(security_video_router, prefix="/api")
app.include_router(security_ai_router, prefix="/api")
app.include_router(security_ops_router, prefix="/api")
app.include_router(platform_router, prefix="/api")
app.include_router(ai_center_router, prefix="/api")
app.include_router(training_router, prefix="/api")
app.include_router(command_router, prefix="/api")
app.include_router(device_bridges_router, prefix="/api")
app.add_event_handler("startup", start_bridge_runtime)
app.add_event_handler("shutdown", stop_bridge_runtime)


@app.on_event("startup")
def startup() -> None:
    init_db()
    init_auth_db()
    ensure_market_defaults()
