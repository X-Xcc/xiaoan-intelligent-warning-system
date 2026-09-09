"""Public, browser-visible configuration for an installed dashboard."""
import os

from fastapi import APIRouter, Response
from pydantic import BaseModel

router = APIRouter(prefix="/deployment", tags=["deployment"])


class AmapClientConfig(BaseModel):
    key: str
    securityJsCode: str


class DeploymentClientConfig(BaseModel):
    amap: AmapClientConfig


@router.get("/client-config", response_model=DeploymentClientConfig)
def client_config(response: Response) -> DeploymentClientConfig:
    response.headers["Cache-Control"] = "no-store"
    # These JS SDK credentials are intentionally public to the browser, even
    # when delivered via a private migration. They are not server-side secrets.
    # Keep this explicit allowlist; never serialize env or model/admin/API keys.
    return DeploymentClientConfig(amap=AmapClientConfig(
        key=os.getenv("XIAOAN_AMAP_KEY", "").strip(),
        securityJsCode=os.getenv("XIAOAN_AMAP_SECURITY_JS_CODE", "").strip(),
    ))
