from __future__ import annotations

import os
from pathlib import Path
from threading import RLock

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


SERVER_DIR = Path(__file__).resolve().parents[2]
LOCAL_ENV_PATH = SERVER_DIR / ".env"


def _load_local_env() -> None:
    if not LOCAL_ENV_PATH.exists():
        return

    for raw_line in LOCAL_ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _database_url() -> str:
    _load_local_env()
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL must be configured for PostgreSQL")

    if url.startswith("sqlite:"):
        if os.getenv("CICSIC_ALLOW_SQLITE_TESTS") == "1":
            return url
        raise RuntimeError("SQLite is reserved for isolated verification runs")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql+psycopg://"):
        return url
    raise RuntimeError("DATABASE_URL must use PostgreSQL")


DATABASE_URL = _database_url()


class Base(DeclarativeBase):
    pass


engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite:") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
DB_LOCK = RLock()


def init_database() -> None:
    from app.services import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
