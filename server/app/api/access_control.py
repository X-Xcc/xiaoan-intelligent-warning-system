from __future__ import annotations

from fastapi import Header


async def require_admin_token(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    return
