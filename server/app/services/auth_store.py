from __future__ import annotations

from datetime import datetime
from secrets import token_urlsafe
from typing import Any

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import UserRole, WechatUser


def init_auth_db() -> None:
    init_database()


def _user_to_dict(row: WechatUser) -> dict[str, Any]:
    return {
        "openid": row.openid,
        "unionid": row.unionid,
        "lastLoginAt": row.last_login_at,
    }


ROLE_DEFAULTS: dict[str, dict[str, Any]] = {
    "群众": {"permissions": ["report", "help", "view_progress"], "displayName": "群众"},
    "商户": {"permissions": ["report", "help", "view_progress", "notification_ack"], "displayName": "商户"},
    "巡防": {"permissions": ["dispatch", "review", "track", "view_progress"], "displayName": "巡防"},
    "指挥员": {"permissions": ["dispatch", "review", "track", "plan", "notify", "analyze"], "displayName": "指挥员"},
    "管理员": {"permissions": ["admin", "dispatch", "review", "track", "plan", "notify", "analyze", "configure"], "displayName": "管理员"},
}


def open_access_user() -> dict[str, Any]:
    return {
        "openid": "open-access",
        "displayName": "公共工作台",
        "role": "管理员",
        "permissions": sorted({permission for role in ROLE_DEFAULTS.values()
                               for permission in role["permissions"]}),
    }


def _role_to_dict(row: UserRole | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "role": row.role,
        "displayName": row.display_name or row.role,
        "permissions": list(row.permissions_json or []),
        "updatedAt": row.updatedAt,
    }


def _default_role_for(openid: str) -> str:
    lowered = openid.lower()
    if lowered.startswith(("admin", "root")):
        return "管理员"
    if lowered.startswith(("cmd", "dispatch", "comm")):
        return "指挥员"
    if lowered.startswith(("patrol", "staff")):
        return "巡防"
    if lowered.startswith(("merchant", "store", "shop")):
        return "商户"
    return "群众"


def _ensure_user_role(session, openid: str, role: str | None = None) -> UserRole:
    now = datetime.now().isoformat(timespec="seconds")
    current = session.get(UserRole, openid)
    if current:
        if role and current.role != role:
            current.role = role
            current.display_name = ROLE_DEFAULTS.get(role, {}).get("displayName", role)
            current.permissions_json = list(ROLE_DEFAULTS.get(role, {}).get("permissions", []))
            current.updatedAt = now
        return current
    resolved = role or _default_role_for(openid)
    current = UserRole(
        openid=openid,
        role=resolved,
        display_name=ROLE_DEFAULTS.get(resolved, {}).get("displayName", resolved),
        permissions_json=list(ROLE_DEFAULTS.get(resolved, {}).get("permissions", [])),
        createdAt=now,
        updatedAt=now,
    )
    session.add(current)
    return current


def upsert_user_role(openid: str, role: str, display_name: str | None = None, permissions: list[str] | None = None) -> dict[str, Any]:
    init_auth_db()
    now = datetime.now().isoformat(timespec="seconds")
    with DB_LOCK, SessionLocal() as session:
        row = _ensure_user_role(session, openid, role)
        row.role = role
        row.display_name = display_name or row.display_name or ROLE_DEFAULTS.get(role, {}).get("displayName", role)
        row.permissions_json = list(permissions if permissions is not None else ROLE_DEFAULTS.get(role, {}).get("permissions", []))
        row.updatedAt = now
        session.commit()
        return _role_to_dict(row) or {}


def upsert_wechat_user(openid: str, session_key: str | None = None, unionid: str | None = None) -> dict[str, Any]:
    init_auth_db()
    now = datetime.now().isoformat(timespec="seconds")
    token = token_urlsafe(32)
    with DB_LOCK, SessionLocal() as session:
        current = session.get(WechatUser, openid)
        if current:
            current.unionid = unionid
            current.session_key = session_key
            current.token = token
            current.last_login_at = now
            row = current
        else:
            row = WechatUser(
                openid=openid,
                unionid=unionid,
                session_key=session_key,
                token=token,
                last_login_at=now,
                created_at=now,
            )
            session.add(row)
        role_row = _ensure_user_role(session, openid)
        session.commit()

    return {
        "token": token,
        "user": {
            **_user_to_dict(row),
            **(
                {
                    "role": (role_row.role if role_row else None),
                    "displayName": (role_row.display_name if role_row else None),
                    "permissions": list(role_row.permissions_json or []) if role_row else [],
                }
                if role_row
                else {}
            ),
        },
    }


def get_user_by_token(token: str) -> dict[str, Any] | None:
    init_auth_db()
    with SessionLocal() as session:
        row = session.query(WechatUser).filter(WechatUser.token == token).one_or_none()
        if not row:
            return None
        role_row = session.get(UserRole, row.openid)
        payload = _user_to_dict(row)
        if role_row:
            payload["role"] = role_row.role
            payload["displayName"] = role_row.display_name or role_row.role
            payload["permissions"] = list(role_row.permissions_json or [])
        return payload


def list_user_roles() -> list[dict[str, Any]]:
    init_auth_db()
    with SessionLocal() as session:
        rows = session.query(UserRole).order_by(UserRole.updatedAt.desc()).all()
        return [_role_to_dict(row) or {} for row in rows]
