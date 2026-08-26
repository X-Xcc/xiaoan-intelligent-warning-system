from __future__ import annotations

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.services.database import Base


class SafetyEvent(Base):
    __tablename__ = "safety_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    bay: Mapped[str] = mapped_column(String(80), nullable=False)
    level: Mapped[str] = mapped_column(String(24), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    owner: Mapped[str] = mapped_column(String(80), nullable=False)
    distance: Mapped[str] = mapped_column(String(40), nullable=False)
    time: Mapped[str] = mapped_column(String(16), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    meta_json: Mapped[dict] = mapped_column("meta", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAtIso: Mapped[str] = mapped_column(String(32), nullable=False)


class EventAuditLog(Base):
    __tablename__ = "event_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    eventId: Mapped[str] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    operator: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    owner: Mapped[str] = mapped_column(String(80), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    time: Mapped[str] = mapped_column(String(16), nullable=False)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)


class WechatUser(Base):
    __tablename__ = "wechat_users"

    openid: Mapped[str] = mapped_column(String(128), primary_key=True)
    unionid: Mapped[str | None] = mapped_column(String(128), nullable=True)
    session_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    token: Mapped[str] = mapped_column(String(128), nullable=False)
    last_login_at: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)
