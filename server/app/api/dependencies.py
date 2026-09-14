from __future__ import annotations

import os

from fastapi import Header, HTTPException, Request, status

from app.services import system_control
from app.services.rate_limit import public_write_limiter


async def require_source_ingest_key(
    x_service_key: str | None = Header(default=None, alias="X-Service-Key"),
) -> None:
    return


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded and os.getenv("CICSIC_TRUST_PROXY_HEADERS") == "1":
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


async def enforce_public_write_rate_limit(request: Request) -> None:
    settings = system_control.get_platform_settings()
    allowed, retry_after = public_write_limiter.check(
        f"public-write:{_client_key(request)}",
        settings["publicWriteRateLimitPerMinute"],
        60,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="请求过于频繁，请稍后再试",
            headers={"Retry-After": str(retry_after)},
        )
