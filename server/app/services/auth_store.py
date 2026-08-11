from __future__ import annotations

import sqlite3
from datetime import datetime
from secrets import token_urlsafe
from typing import Any

from app.services.event_store import DB_PATH, _LOCK


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db() -> None:
    with _LOCK, _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wechat_users (
              openid TEXT PRIMARY KEY,
              unionid TEXT,
              session_key TEXT,
              token TEXT NOT NULL,
              last_login_at TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )


def _row_to_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "openid": row["openid"],
        "unionid": row["unionid"],
        "lastLoginAt": row["last_login_at"],
    }


def upsert_wechat_user(openid: str, session_key: str | None = None, unionid: str | None = None) -> dict[str, Any]:
    init_auth_db()
    now = datetime.now().isoformat(timespec="seconds")
    token = token_urlsafe(32)
    with _LOCK, _connect() as conn:
        current = conn.execute("SELECT created_at FROM wechat_users WHERE openid = ?", (openid,)).fetchone()
        conn.execute(
            """
            INSERT INTO wechat_users (openid, unionid, session_key, token, last_login_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(openid) DO UPDATE SET
              unionid = excluded.unionid,
              session_key = excluded.session_key,
              token = excluded.token,
              last_login_at = excluded.last_login_at
            """,
            (openid, unionid, session_key, token, now, current["created_at"] if current else now),
        )
        row = conn.execute("SELECT * FROM wechat_users WHERE openid = ?", (openid,)).fetchone()

    return {
        "token": token,
        "user": _row_to_user(row),
    }


def get_user_by_token(token: str) -> dict[str, Any] | None:
    init_auth_db()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM wechat_users WHERE token = ?", (token,)).fetchone()
    return _row_to_user(row) if row else None
