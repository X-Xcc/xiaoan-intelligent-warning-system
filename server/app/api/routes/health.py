from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.services import system_control

router = APIRouter(tags=["health"])

@router.get("/health")
def health_check():
    runtime = system_control.runtime_status()
    return {"status": "ok", "service": "public-security-platform-api", "database": runtime["database"]}


@router.get("/health/ready")
def readiness_check():
    runtime = system_control.runtime_status()
    return JSONResponse(status_code=200 if runtime["status"] == "ready" else 503, content=runtime)
