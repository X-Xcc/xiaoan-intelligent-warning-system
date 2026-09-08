from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.services import system_control


async def require_admin_token(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    if system_control.verify_admin_token(x_admin_token):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="后台访问令牌无效或未配置",
    )
