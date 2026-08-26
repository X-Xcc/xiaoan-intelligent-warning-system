from __future__ import annotations

from datetime import datetime
from secrets import token_urlsafe
from typing import Any

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import WechatUser


def init_auth_db() -> None:
    init_database()


def _user_to_dict(row: WechatUser) -> dict[str, Any]:
    return {
        "openid": row.openid,
        "unionid": row.unionid,
        "lastLoginAt": row.last_login_at,
    }


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
        session.commit()

    return {
        "token": token,
        "user": _user_to_dict(row),
    }


def get_user_by_token(token: str) -> dict[str, Any] | None:
    init_auth_db()
    with SessionLocal() as session:
        row = session.query(WechatUser).filter(WechatUser.token == token).one_or_none()
        return _user_to_dict(row) if row else None
