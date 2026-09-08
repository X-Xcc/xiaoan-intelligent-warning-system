"""Offline workflow verification: ASGI requests use a mocked store, SQL uses memory."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"
EVIDENCE_TEMP = tempfile.TemporaryDirectory(prefix="cicsic-core-evidence-")
os.environ["CICSIC_EVIDENCE_DIR"] = EVIDENCE_TEMP.name

from fastapi import FastAPI
from app.api.routes import events
from app.services import event_store, security_linkage
from app.services.database import Base, SessionLocal, engine
from app.services.models import EventAuditLog, SafetyEvent


async def request(app, method, path, payload):
    messages = []
    body = json.dumps(payload).encode()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        messages.append(message)

    await app(
        {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
         "method": method, "scheme": "http", "path": path, "raw_path": path.encode(),
         "query_string": b"", "root_path": "", "headers": [(b"content-type", b"application/json")],
         "client": ("127.0.0.1", 1), "server": ("offline.test", 80)},
        receive, send,
    )
    status = next(item["status"] for item in messages if item["type"] == "http.response.start")
    content = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
    return status, json.loads(content)


class RoutesTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(events.router)
        self.app.dependency_overrides[events.enforce_public_write_rate_limit] = lambda: None
        self.publisher = patch.object(events.realtime_hub, "publish", new_callable=AsyncMock).start()
        self.addCleanup(patch.stopall)

    async def test_manual_address_is_accepted_without_coordinates(self):
        with patch.object(event_store, "create_help_event", return_value={"id": "TEST-HELP"}) as create:
            status, _ = await request(self.app, "POST", "/events/help", {"bay": "  North entrance  "})
            self.assertEqual(status, 200)
            self.assertEqual(create.call_args.kwargs["bay"], "North entrance")
            self.assertIsNone(create.call_args.kwargs["latitude"])
            self.assertIsNone(create.call_args.kwargs["longitude"])

    async def test_invalid_or_partial_coordinates_and_blank_bay_are_rejected(self):
        invalid = [
            {"bay": " ", "latitude": 28, "longitude": 115},
            {"bay": "North", "latitude": 28},
            {"bay": "North", "longitude": 115},
            {"bay": "North", "latitude": 91, "longitude": 115},
            {"bay": "North", "latitude": 28, "longitude": -181},
            {"bay": "North", "latitude": "NaN", "longitude": 115},
        ]
        with patch.object(event_store, "create_help_event", return_value={"id": "TEST"}) as create:
            for payload in invalid:
                with self.subTest(payload=payload):
                    status, _ = await request(self.app, "POST", "/events/help", payload)
                    self.assertEqual(status, 422)
            create.assert_not_called()

    async def test_gps_coordinates_remain_supported(self):
        with patch.object(event_store, "create_help_event", return_value={"id": "TEST"}) as create:
            status, _ = await request(self.app, "POST", "/events/help", {"bay": "North", "latitude": 0, "longitude": 0})
            self.assertEqual(status, 200)
            self.assertEqual(create.call_args.kwargs["latitude"], 0)

    async def test_supplement_forwards_evidence_without_requiring_text(self):
        evidence = [{"kind": "image", "url": "/api/events/evidence/test.jpg"}]
        with patch.object(event_store, "supplement_event", return_value={"id": "TEST"}) as supplement:
            status, _ = await request(self.app, "PATCH", "/events/TEST/supplement", {"text": "", "evidence": evidence})
            self.assertEqual(status, 200)
            self.assertEqual(supplement.call_args.args, ("TEST", "", evidence))

    async def test_empty_or_invalid_evidence_supplements_are_rejected(self):
        with patch.object(event_store, "supplement_event", return_value={"id": "TEST"}) as supplement:
            for payload in [{"text": " "}, {"evidence": [{"kind": "image", "url": ""}]},
                            {"evidence": [{"kind": "image", "url": "javascript:bad"}]}]:
                status, _ = await request(self.app, "PATCH", "/events/TEST/supplement", payload)
                self.assertEqual(status, 422)
            supplement.assert_not_called()


class StoreTest(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.real_link_event_risk = security_linkage.link_event_risk
        patch.object(event_store, "init_db", return_value=None).start()
        patch.object(event_store, "_queue_event_notification", return_value=None).start()
        patch("app.services.security_linkage.link_event_risk", return_value=None).start()
        patch("app.services.security_linkage.normalize_event_context",
              side_effect=lambda raw, **kwargs: {**raw, "location": kwargs.get("alarm_location", {})}).start()
        with SessionLocal() as session:
            event_store._seed_staff(session)
            session.commit()
        self.addCleanup(patch.stopall)
        self.addCleanup(lambda: Base.metadata.drop_all(engine))

    def test_manual_help_has_no_fabricated_point_assignment_route_or_eta(self):
        created = event_store.create_help_event("North entrance")
        self.assertEqual(created["meta"].get("locationSource"), "manual")
        self.assertEqual(created["meta"].get("manualLocation"), "North entrance")
        for key in ["reporterLocation", "alarmLocation", "route", "assignment"]:
            self.assertFalse(created["meta"].get(key), key)
        self.assertNotIn("latitude", created["meta"]["context"]["location"])
        self.assertNotIn("latitude", event_store._event_location(created))
        self.assertNotIn("latitude", created["timeline"][0]["details"]["operationLocation"])
        with self.assertRaisesRegex(ValueError, "location|地点|坐标"):
            event_store.recommend_route(created["id"], "wang")
        assigned = event_store.assign_event(created["id"], "wang")
        self.assertEqual(assigned["status"], "已派单")
        self.assertFalse(assigned["meta"].get("route"))
        self.assertFalse(assigned["meta"].get("alarmLocation"))

    def test_gps_help_keeps_existing_route_and_assignment(self):
        created = event_store.create_help_event("North", latitude=28.68, longitude=115.86)
        self.assertEqual(created["meta"]["alarmLocation"]["source"], "visitor_gps")
        self.assertEqual(created["meta"]["route"]["destination"]["latitude"], 28.68)
        assigned = event_store.assign_event(created["id"], "wang")
        self.assertEqual(assigned["meta"]["assignment"]["staffId"], "wang")
        self.assertGreater(assigned["meta"]["route"]["etaMinutes"], 0)

    def test_supplement_appends_deduped_evidence_preserves_context_and_audits(self):
        old = {"kind": "image", "url": "/api/events/evidence/old.jpg"}
        new = {"kind": "video", "url": "/api/events/evidence/new.mp4"}
        created = event_store.create_help_event("North", latitude=28.68, longitude=115.86, evidence=[old])
        before = created["meta"]["context"].copy()
        updated = event_store.supplement_event(created["id"], "More information", [new])
        self.assertEqual(updated["meta"]["evidence"], [old, new])
        self.assertEqual(updated["meta"]["context"]["evidence"], [old, new])
        for key, value in before.items():
            if key != "evidence":
                self.assertEqual(updated["meta"]["context"][key], value)
        self.assertEqual(updated["status"], "已提交")
        self.assertIn("More information", updated["description"])
        self.assertEqual(updated["timeline"][-1]["details"]["evidenceIndex"]["evidence"], [old, new])
        again = event_store.supplement_event(created["id"], "", [new])
        self.assertEqual(again["meta"]["evidence"], [old, new])
        self.assertEqual(again["description"], updated["description"])
        self.assertIsNone(event_store.supplement_event("MISSING", "", [new]))

    def test_supplement_refreshes_linked_risk_evidence_after_commit(self):
        image = {"kind": "image", "url": "/api/events/evidence/later.jpg"}
        video = {"kind": "video", "url": "/api/events/evidence/later.mp4"}
        with patch.object(security_linkage, "ensure_linkage_defaults", return_value=None), \
                patch.object(security_linkage, "link_event_risk", wraps=self.real_link_event_risk) as refresh:
            created = event_store.create_help_event("North entrance")
            original_risk = security_linkage.get_risk_for_event(created["id"])
            self.assertIsNotNone(original_risk)
            self.assertEqual(original_risk["evidence"], [])
            refresh.reset_mock()

            updated = event_store.supplement_event(created["id"], "", [image])
            risk = security_linkage.get_risk_for_event(created["id"])
            self.assertEqual(risk["riskId"], original_risk["riskId"])
            self.assertEqual(risk["evidence"], [image])
            self.assertEqual(updated["meta"]["context"]["riskRecordId"], risk["riskId"])
            self.assertEqual(updated["status"], created["status"])
            refresh.assert_called_once_with(created["id"])

            event_store.supplement_event(created["id"], "", [video])
            self.assertEqual(security_linkage.get_risk_for_event(created["id"])["evidence"], [image, video])
            refresh.reset_mock()
            repeated = event_store.supplement_event(created["id"], "", [video])
            self.assertEqual(repeated["meta"]["evidence"], [image, video])
            event_store.supplement_event(created["id"], "Text only")
            refresh.assert_not_called()

    def test_risk_refresh_failure_does_not_undo_committed_evidence(self):
        created = event_store.create_help_event("North entrance")
        image = {"kind": "image", "url": "/api/events/evidence/retained.jpg"}
        with patch.object(security_linkage, "link_event_risk", side_effect=RuntimeError("Risk service unavailable")) as refresh:
            updated = event_store.supplement_event(created["id"], "", [image])
            refresh.assert_called_once_with(created["id"])
        persisted = event_store.get_event(created["id"])
        self.assertEqual(updated["meta"]["evidence"], [image])
        self.assertEqual(persisted["meta"]["context"]["evidence"], [image])
        self.assertEqual(persisted["timeline"][-1]["details"]["addedEvidence"], [image])


if __name__ == "__main__":
    try:
        unittest.main(verbosity=2)
    finally:
        EVIDENCE_TEMP.cleanup()
