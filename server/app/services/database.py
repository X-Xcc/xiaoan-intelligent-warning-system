from __future__ import annotations

import os
from pathlib import Path
from threading import Lock

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "jiangtan.db"


def _database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"

    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")


class Base(DeclarativeBase):
    pass


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    pool_pre_ping=not IS_SQLITE,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
DB_LOCK = Lock()


def init_database() -> None:
    from app.services import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
