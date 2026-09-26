"""Query-count regressions using disposable SQLite, never the deployment database."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.services import event_store
from app.services.database import Base
from app.services.models import EventAuditLog, SafetyEvent


class InitializationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:", poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        self.addCleanup(self.engine.dispose)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False, autoflush=False)
        factory = patch.object(event_store, "SessionLocal", self.sessions)
        factory.start()
        self.addCleanup(factory.stop)
        schema = patch.object(event_store, "init_database", side_effect=lambda: Base.metadata.create_all(self.engine))
        self.schema = schema.start()
        self.addCleanup(schema.stop)
        self.statements = []
        event.listen(self.engine, "before_cursor_execute",
                     lambda conn, cursor, statement, parameters, context, many: self.statements.append(statement))

    def test_repeated_reads_do_not_run_schema_or_metadata_maintenance(self):
        event_store.init_db()
        self.statements.clear()
        with patch.object(event_store, "_normalize_existing_metadata",
                          wraps=event_store._normalize_existing_metadata) as normalize:
            first = event_store.list_events()
            second = event_store.list_events()
        self.assertEqual(first, second)
        self.schema.assert_called_once()
        normalize.assert_not_called()
        self.assertTrue(all(sql.lstrip().upper().startswith("SELECT") for sql in self.statements))

    def test_concurrent_initialization_runs_maintenance_once(self):
        with ThreadPoolExecutor(max_workers=4) as workers:
            list(workers.map(lambda _: event_store.init_db(), range(8)))
        self.schema.assert_called_once()

    def test_failed_initialization_can_be_retried(self):
        with patch.object(event_store, "_normalize_existing_metadata", side_effect=RuntimeError("fixture failure")):
            with self.assertRaisesRegex(RuntimeError, "fixture failure"):
                event_store.init_db()
        event_store.init_db()
        with self.sessions() as session:
            self.assertIsNotNone(session.get(SafetyEvent, "YS-DEMO-001"))

    def test_timelines_are_loaded_in_one_query_and_keep_order_and_empty_lists(self):
        event_store.init_db()
        with self.sessions.begin() as session:
            for index in range(8):
                event_id = f"HELP-FIXTURE-{index}"
                session.add(SafetyEvent(
                    id=event_id, kind="help", title="fixture", bay="fixture",
                    level="low", source=next(iter(event_store.NIGHT_MARKET_SOURCES)), status="active", owner="fixture",
                    distance="unknown", time="12:00", updatedAt="12:00",
                    description="fixture", meta_json={},
                    createdAt="2026-09-18T12:00:00", updatedAtIso="2026-09-18T12:00:00",
                ))
                if index == 0:
                    for action in ("first", "second"):
                        session.add(EventAuditLog(
                            eventId=event_id, action=action, operator="fixture",
                            status="active", owner="fixture", note="fixture",
                            time="12:00", createdAt="2026-09-18T12:00:00",
                        ))
        self.statements.clear()
        items = event_store.list_events()
        timeline_queries = [sql for sql in self.statements if "FROM event_audit_logs" in sql]
        self.assertEqual(len(timeline_queries), 1)
        by_id = {item["id"]: item for item in items}
        self.assertEqual([log["action"] for log in by_id["HELP-FIXTURE-0"]["timeline"]], ["first", "second"])
        self.assertEqual(by_id["HELP-FIXTURE-1"]["timeline"], [])


if __name__ == "__main__":
    unittest.main()
