from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select, text

from app.services.database import DATABASE_URL, DB_LOCK, SessionLocal, init_database
from app.services.models import PlatformSetting, ServiceAccessKey, SystemAuditLog


PLATFORM_SETTINGS_KEY = "platform-governance"
DEFAULT_PLATFORM_SETTINGS: dict[str, Any] = {
    "adminAuthEnabled": True,
    "sourceAuthEnabled": False,
    "publicWriteRateLimitPerMinute": 20,
    "evidenceUploadLimitMb": 20,
}
ALLOWED_SOURCE_SCOPES = {"source:ingest"}
NON_PRODUCTION_ENVIRONMENTS = {"development", "dev", "local", "test", "testing"}


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _environment_name() -> str:
    return os.getenv("APP_ENV", "production").strip().lower()


def _env_flag(name: str) -> bool | None:
    value = os.getenv(name)
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def _admin_auth_enabled(config: dict[str, Any] | None = None) -> bool:
    environment = _environment_name()
    override = _env_flag("CICSIC_ADMIN_AUTH_ENABLED")
    if environment not in NON_PRODUCTION_ENVIRONMENTS:
        return True
    if override is not None:
        return override
    values = {**DEFAULT_PLATFORM_SETTINGS, **(config or {})}
    return bool(values["adminAuthEnabled"])


def _environment_admin_token() -> str | None:
    token = os.getenv("CICSIC_ADMIN_TOKEN", "")
    if 16 <= len(token) <= 256:
        return token
    return None


def _settings_payload(config: dict[str, Any] | None) -> dict[str, Any]:
    values = {**DEFAULT_PLATFORM_SETTINGS, **(config or {})}
    return {
        "adminAuthEnabled": _admin_auth_enabled(values),
        "sourceAuthEnabled": bool(values["sourceAuthEnabled"]),
        "publicWriteRateLimitPerMinute": max(1, min(120, int(values["publicWriteRateLimitPerMinute"]))),
        "evidenceUploadLimitMb": max(1, min(100, int(values["evidenceUploadLimitMb"]))),
    }


def _admin_token_hash(token: str) -> str:
    pepper = os.getenv("CICSIC_ADMIN_TOKEN_PEPPER", "")
    return hashlib.sha256(f"{pepper}:{token}".encode("utf-8")).hexdigest()


def _raw_platform_settings() -> dict[str, Any]:
    _ensure_platform_settings()
    with SessionLocal() as session:
        row = session.get(PlatformSetting, PLATFORM_SETTINGS_KEY)
        return dict(row.config_json or {}) if row else dict(DEFAULT_PLATFORM_SETTINGS)


def _ensure_platform_settings() -> None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        if session.get(PlatformSetting, PLATFORM_SETTINGS_KEY) is None:
            session.add(
                PlatformSetting(
                    settingKey=PLATFORM_SETTINGS_KEY,
                    config_json=dict(DEFAULT_PLATFORM_SETTINGS),
                    updatedAt=_now(),
                )
            )
            session.commit()


def get_platform_settings() -> dict[str, Any]:
    _ensure_platform_settings()
    with SessionLocal() as session:
        row = session.get(PlatformSetting, PLATFORM_SETTINGS_KEY)
        return _settings_payload(row.config_json if row else None)


def save_platform_settings(config: dict[str, Any]) -> dict[str, Any]:
    _ensure_platform_settings()
    raw = _raw_platform_settings()
    merged = {**raw, **config}
    merged.pop("adminToken", None)
    settings = _settings_payload(merged)
    if settings["adminAuthEnabled"] and not admin_token_configured(merged):
        raise ValueError("开启后台访问令牌前需要先设置 Token")
    persisted = {**merged, **settings}
    with DB_LOCK, SessionLocal() as session:
        row = session.get(PlatformSetting, PLATFORM_SETTINGS_KEY)
        if row is None:
            row = PlatformSetting(settingKey=PLATFORM_SETTINGS_KEY, config_json=persisted, updatedAt=_now())
            session.add(row)
        else:
            row.config_json = persisted
            row.updatedAt = _now()
        session.commit()
        return _settings_payload(row.config_json)


def admin_token_configured(config: dict[str, Any] | None = None) -> bool:
    if _environment_admin_token():
        return True
    values = config if config is not None else _raw_platform_settings()
    return bool(values.get("adminTokenHash"))


def admin_auth_status() -> dict[str, bool]:
    settings = get_platform_settings()
    return {
        "enabled": bool(settings["adminAuthEnabled"]),
        "tokenConfigured": admin_token_configured(),
    }


def verify_admin_token(token: str | None) -> bool:
    settings = get_platform_settings()
    if not settings["adminAuthEnabled"]:
        return True
    if not token:
        return False
    env_token = _environment_admin_token()
    if env_token and hmac.compare_digest(token, env_token):
        return True
    stored_hash = str(_raw_platform_settings().get("adminTokenHash") or "")
    return bool(stored_hash) and hmac.compare_digest(_admin_token_hash(token), stored_hash)


def _hash_access_key(secret: str) -> str:
    pepper = os.getenv("CICSIC_ACCESS_KEY_PEPPER", "")
    return hashlib.sha256(f"{pepper}:{secret}".encode("utf-8")).hexdigest()


def _access_key_payload(row: ServiceAccessKey) -> dict[str, Any]:
    return {
        "keyId": row.keyId,
        "name": row.name,
        "keyPrefix": row.keyPrefix,
        "scopes": list(row.scopes_json or []),
        "status": row.status,
        "expiresAt": row.expiresAt,
        "lastUsedAt": row.lastUsedAt,
        "createdAt": row.createdAt,
        "updatedAt": row.updatedAt,
    }


def list_access_keys() -> list[dict[str, Any]]:
    init_database()
    with SessionLocal() as session:
        rows = session.scalars(select(ServiceAccessKey).order_by(ServiceAccessKey.createdAt.desc())).all()
        return [_access_key_payload(row) for row in rows]


def create_access_key(name: str, scopes: list[str], expires_at: str | None = None) -> dict[str, Any]:
    init_database()
    normalized_scopes = sorted({scope for scope in scopes if scope in ALLOWED_SOURCE_SCOPES})
    if not normalized_scopes:
        raise ValueError("至少需要选择一个有效权限")
    secret = f"cicsic_{secrets.token_urlsafe(32)}"
    now = _now()
    row = ServiceAccessKey(
        keyId=f"sak-{uuid4().hex[:16]}",
        name=name.strip()[:120],
        keyPrefix=f"{secret[:16]}...",
        keyHash=_hash_access_key(secret),
        scopes_json=normalized_scopes,
        status="active",
        expiresAt=expires_at,
        lastUsedAt=None,
        createdAt=now,
        updatedAt=now,
    )
    with DB_LOCK, SessionLocal() as session:
        session.add(row)
        session.commit()
        payload = _access_key_payload(row)
    return {**payload, "secret": secret}


def update_access_key(key_id: str, status: str) -> dict[str, Any]:
    if status not in {"active", "revoked"}:
        raise ValueError("密钥状态不支持")
    init_database()
    with DB_LOCK, SessionLocal() as session:
        row = session.get(ServiceAccessKey, key_id)
        if row is None:
            raise KeyError(key_id)
        row.status = status
        row.updatedAt = _now()
        session.commit()
        return _access_key_payload(row)


def verify_access_key(secret: str | None, scope: str) -> bool:
    if not secret or scope not in ALLOWED_SOURCE_SCOPES:
        return False
    init_database()
    key_hash = _hash_access_key(secret)
    with DB_LOCK, SessionLocal() as session:
        row = session.scalar(select(ServiceAccessKey).where(ServiceAccessKey.keyHash == key_hash))
        if row is None or not hmac.compare_digest(row.keyHash, key_hash):
            return False
        if row.status != "active" or scope not in (row.scopes_json or []):
            return False
        if row.expiresAt:
            try:
                if datetime.fromisoformat(row.expiresAt) <= datetime.now():
                    return False
            except ValueError:
                return False
        row.lastUsedAt = _now()
        session.commit()
        return True


def source_auth_enabled() -> bool:
    return bool(get_platform_settings()["sourceAuthEnabled"])


def record_system_audit(
    actor: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> dict[str, Any]:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        row = SystemAuditLog(
            actor=(actor or "管理台")[:120],
            action=action[:80],
            resourceType=resource_type[:80],
            resourceId=resource_id[:120] if resource_id else None,
            detail_json=detail or {},
            createdAt=_now(),
        )
        session.add(row)
        session.commit()
        return _system_audit_payload(row)


def _system_audit_payload(row: SystemAuditLog) -> dict[str, Any]:
    return {
        "id": row.id,
        "actor": row.actor,
        "action": row.action,
        "resourceType": row.resourceType,
        "resourceId": row.resourceId,
        "detail": dict(row.detail_json or {}),
        "createdAt": row.createdAt,
    }


def list_system_audit_logs(limit: int = 100) -> list[dict[str, Any]]:
    init_database()
    with SessionLocal() as session:
        rows = session.scalars(
            select(SystemAuditLog).order_by(SystemAuditLog.createdAt.desc(), SystemAuditLog.id.desc()).limit(max(1, min(limit, 500)))
        ).all()
        return [_system_audit_payload(row) for row in rows]


def runtime_status() -> dict[str, Any]:
    database_status = "ready"
    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except Exception:
        database_status = "unavailable"
    return {
        "status": "ready" if database_status == "ready" else "degraded",
        "database": {"status": database_status, "engine": "sqlite" if DATABASE_URL.startswith("sqlite:") else "postgresql"},
        "settings": get_platform_settings() if database_status == "ready" else None,
        "checkedAt": _now(),
    }
