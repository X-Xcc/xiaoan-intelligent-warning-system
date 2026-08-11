from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.demo import router as demo_router
from app.api.routes.events import router as events_router
from app.api.routes.health import router as health_router
from app.services.auth_store import init_auth_db
from app.services.event_store import init_db

app = FastAPI(title="江滩智防 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(events_router, prefix="/api")
app.include_router(demo_router, prefix="/api")


@app.on_event("startup")
def startup() -> None:
    init_db()
    init_auth_db()
