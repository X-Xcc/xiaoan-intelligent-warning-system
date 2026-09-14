"""Sample-time regression coverage using a private in-memory database."""
from __future__ import annotations

from datetime import datetime, time
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.services import event_store, training_pilot
from app.services.database import Base
from app.services.models import EventAuditLog, SafetyEvent


SLOTS = [
    "20:13:50", "20:43:50", "21:13:50", "21:43:50",
    "22:13:50", "22:43:50", "23:13:50", "23:43:50",
]
OCCURRED_AT = "2026-09-11T20:13:50"
RECEIVED_AT = "2026-09-11T20:14:50"


class SampleTimesTest(unittest.TestCase):
    def test_command_fixture_preserves_dates_ids_and_durations(self):
        path = Path(__file__).resolve().parents[1] / "app/data/command/night_market_b1_b4_v1.json"
        fixture = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(fixture["baseTime"], "2026-09-05T20:13:50+08:00")
        self.assertEqual(
            [(item["eventId"], item["occurredAt"][:10]) for item in fixture["relatedAlerts"]],
            [("TEACH-0829-01", "2026-08-30"), ("TEACH-0902-02", "2026-09-02")],
        )
        timestamps = [datetime.fromisoformat(item["occurredAt"]) for item in fixture["relatedAlerts"]]
        timestamps.append(datetime.fromisoformat(fixture["baseTime"]))
        self.assertEqual(timestamps, sorted(timestamps))
        for stamp in timestamps:
            self.assertGreaterEqual(stamp.time(), time(20, 13, 50))
        self.assertEqual(
            [(item["startMs"], item["endMs"]) for item in fixture["intake"]["segments"]],
            [(0, 4200), (4200, 11000), (11000, 15000)],
        )
        self.assertEqual([item["estimatedSeconds"] for item in fixture["route"]["segments"]], [180, None])

    def test_readiness_sample_slots_preserve_values_and_actual_snapshot_clock(self):
        actual_time = "2026-09-13T03:04:05.123456+00:00"
        with patch.object(training_pilot, "_now", return_value=actual_time):
            snapshot = training_pilot.readiness_snapshot()
        self.assertEqual(snapshot["updatedAt"], actual_time)
        self.assertEqual([item["time"] for item in snapshot["timeTrend"]], SLOTS)
        self.assertEqual([item["value"] for item in snapshot["timeTrend"]], [18, 26, 37, 44, 51, 42, 29, 16])
        duty = snapshot["dutySituation"]
        self.assertEqual([item["time"] for item in duty["timeTrend"]], SLOTS)
        self.assertEqual([item["value"] for item in duty["timeTrend"]], [18, 26, 44, 58, 63, 49, 29, 16])
        self.assertIn("20:13:50", duty["period"])
        self.assertIn("23:43:50", duty["period"])
        self.assertEqual(
            [item["standard"]["thresholdSeconds"] for item in snapshot["recommendations"]],
            [30, 10, 60],
        )


class PlaceholderTimesTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(patch.stopall)
        patch.object(event_store, "SessionLocal", self.sessions).start()
        patch.object(event_store, "init_database", return_value=None).start()

    def assert_placeholder(self, row):
        payload = event_store._event_to_dict(row)
        self.assertEqual(payload["id"], "YS-DEMO-001")
        self.assertEqual(payload["time"], "20:13:50")
        self.assertEqual(payload["occurredAt"], OCCURRED_AT)
        self.assertEqual(payload.get("receivedAt"), RECEIVED_AT)
        self.assertEqual(payload["meta"].get("receivedAt"), RECEIVED_AT)
        self.assertIn("20:13:50", payload["description"])
        self.assertNotIn("22\uff1a27", payload["description"])
        self.assertEqual(
            (datetime.fromisoformat(RECEIVED_AT) - datetime.fromisoformat(OCCURRED_AT)).total_seconds(),
            60,
        )

    def test_new_placeholder_has_sample_occurrence_and_receipt_but_actual_creation_clock(self):
        actual_time = datetime(2026, 9, 13, 9, 2, 3)
        with patch.object(event_store, "datetime") as clock:
            clock.now.return_value = actual_time
            event_store.init_db()
        with self.sessions() as session:
            row = session.get(SafetyEvent, "YS-DEMO-001")
            self.assert_placeholder(row)
            self.assertEqual(row.createdAt, actual_time.isoformat())
            self.assertEqual(row.updatedAtIso, actual_time.isoformat())

    def test_bootstrap_refreshes_only_the_explicit_placeholder_and_preserves_audit_clocks(self):
        actual_time = "2026-09-11T09:02:03"
        with self.sessions.begin() as session:
            for event_id in ("YS-DEMO-001", "REAL-001", "OTHER-DEMO"):
                session.add(SafetyEvent(
                    id=event_id, kind="help", title="fixture", bay="manual address", level="high",
                    source="manual", status="active", owner="officer", distance="unknown",
                    time="22:00", updatedAt="09:02:03", description="old narrative",
                    meta_json={
                        "demo": event_id != "REAL-001", "occurredAt": "2026-09-11T22:00",
                        "receivedAt": "2026-09-11T22:01", "evidence": [{"url": "/retained.jpg"}],
                    },
                    createdAt=actual_time, updatedAtIso=actual_time,
                ))
            session.add(EventAuditLog(
                eventId="YS-DEMO-001", action="review", operator="human", status="active",
                owner="officer", note="retained audit", time="09:02:03", createdAt=actual_time,
            ))
        event_store.init_db()
        event_store.init_db()
        with self.sessions() as session:
            self.assertEqual(len(session.scalars(select(SafetyEvent)).all()), 3)
            placeholder = session.get(SafetyEvent, "YS-DEMO-001")
            self.assert_placeholder(placeholder)
            self.assertEqual(placeholder.meta_json["evidence"], [{"url": "/retained.jpg"}])
            self.assertEqual(placeholder.status, "active")
            self.assertEqual(placeholder.owner, "officer")
            for event_id in ("YS-DEMO-001", "REAL-001", "OTHER-DEMO"):
                row = session.get(SafetyEvent, event_id)
                self.assertEqual((row.createdAt, row.updatedAtIso, row.updatedAt), (actual_time, actual_time, "09:02:03"))
                if event_id != "YS-DEMO-001":
                    payload = event_store._event_to_dict(row)
                    self.assertEqual(row.time, "22:00")
                    self.assertEqual(row.description, "old narrative")
                    self.assertEqual(payload["occurredAt"], "2026-09-11T22:00")
                    self.assertEqual(payload.get("receivedAt"), "2026-09-11T22:01")
            audit = session.scalars(select(EventAuditLog)).one()
            self.assertEqual((audit.createdAt, audit.time, audit.note), (actual_time, "09:02:03", "retained audit"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
