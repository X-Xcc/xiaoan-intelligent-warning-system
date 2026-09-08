import asyncio
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
import unittest
from unittest.mock import patch
from uuid import uuid4

import test_command_routes as helpers
from app.services import command_workflow as workflow
from app.services.database import SessionLocal
from app.services.models import CommandUpload, EventAuditLog, IdentityProfile, SafetyEvent


class CommandWorkflowTest(unittest.IsolatedAsyncioTestCase):
    setUp = helpers.CommandRoutesTest.setUp
    call = helpers.CommandRoutesTest.call
    create = helpers.CommandRoutesTest.create
    action = helpers.CommandRoutesTest.action
    confirmed = helpers.CommandRoutesTest.confirmed
    dispatched = helpers.CommandRoutesTest.dispatched
    onsite = helpers.CommandRoutesTest.onsite
    evidence_and_verification = helpers.CommandRoutesTest.evidence_and_verification

    async def test_dispatch_rolls_back_all_changes_when_receipt_fails(self):
        await self.confirmed()
        before = deepcopy(self.state)
        with patch.object(workflow, "_save_receipt", side_effect=RuntimeError("simulated commit failure")):
            with self.assertRaises(RuntimeError):
                workflow.execute(self.event_id, "dispatch", {
                    "requestId": "atomic", "expectedVersion": self.state["command"]["version"],
                    "recommendationId": self.state["command"]["dispatch"]["recommendationId"],
                }, workflow.actor_for_token("dispatch"))
        after = await self.call("GET", f"/events/{self.event_id}/context")
        self.assertEqual(before["event"], after["event"])

    async def test_two_competing_versions_have_one_winner(self):
        await self.create()
        actor = workflow.actor_for_token("intake")
        fields = {"expectedVersion": 1, "summaryVersion": 1, "category": "消费纠纷",
                  "text": "人工摘要", "dangerFactors": ["不详"]}

        def submit():
            try:
                return workflow.execute(self.event_id, "summary/confirm", {**fields, "requestId": uuid4().hex}, actor)
            except workflow.HTTPException as exc:
                return exc.status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: submit(), range(2)))
        self.assertEqual(sum(isinstance(item, dict) for item in results), 1)
        self.assertIn(409, results)

    async def test_receipt_lookup_can_resolve_an_uncertain_request(self):
        await self.confirmed()
        result = await self.call("GET", f"/events/{self.event_id}/receipts/{self.state['requestId']}", actor="dispatch")
        self.assertEqual(result, self.state)

    async def test_real_upload_receipt_is_owned_protected_and_deduplicated(self):
        await self.onsite()
        content = b"\x89PNG\r\n\x1a\n" + b"private-teaching-image"
        actor = workflow.actor_for_token("field")
        first = workflow.upload_evidence(self.event_id, actor, "receipt.png", "image/png", content)
        again = workflow.upload_evidence(self.event_id, actor, "receipt.png", "image/png", content)
        self.assertEqual(first["uploadId"], again["uploadId"])
        await self.action("evidence", {"uploadId": first["uploadId"], "name": "小票", "kind": "image",
                                     "discoveredAt": "2026-09-07T12:00:00+08:00"}, "field")
        for meta_index in [self.state["event"]["meta"]["evidence"], self.state["event"]["meta"]["context"]["evidence"],
                           self.state["command"]["evidenceIndex"]]:
            self.assertEqual(meta_index[0]["uploadId"], first["uploadId"])
        code, _ = await helpers.request(self.app, "GET", first["url"], token="other")
        self.assertEqual(code, 404)
        code, received = await helpers.request(self.app, "GET", first["url"], token="field")
        self.assertEqual(code, 200)
        self.assertEqual(content, received)
        await self.action("evidence", {"uploadId": first["uploadId"], "name": "duplicate", "kind": "image",
                                     "discoveredAt": "2026-09-07T12:00:00+08:00"}, "field", 409)

    async def test_cross_event_upload_and_missing_file_cannot_enter_handover(self):
        await self.onsite()
        actor = workflow.actor_for_token("field")
        first = workflow.upload_evidence(self.event_id, actor, "receipt.png", "image/png", b"\x89PNG\r\n\x1a\nprivate")
        await self.onsite()
        await self.action("evidence", {"uploadId": first["uploadId"], "name": "cross-event", "kind": "image",
                                     "discoveredAt": "2026-09-07T12:00:00+08:00"}, "field", 422)
        second = workflow.upload_evidence(self.event_id, actor, "receipt.png", "image/png", b"\x89PNG\r\n\x1a\nprivate")
        await self.action("evidence", {"uploadId": second["uploadId"], "name": "valid", "kind": "image",
                                     "discoveredAt": "2026-09-07T12:00:00+08:00"}, "field")
        await self.action("verification", {"query": "unknown"}, "field")
        await self.action(f"verification/{self.state['command']['verification']['verificationId']}/review",
                          {"decision": "fallback", "reason": "人工联系核查"}, "field")
        with SessionLocal() as session:
            upload = session.get(CommandUpload, second["uploadId"])
            workflow._evidence_path(upload.filename).unlink()
        await self.action("handover", {"summary": "材料缺失", "evidenceIds": [self.state["command"]["evidenceIndex"][0]["evidenceId"]]}, "field", 422)

    async def test_b3_review_does_not_regress_b4_and_submission_freezes_materials(self):
        await self.onsite()
        await self.action("verification", {"query": "陈XX"}, "field")
        await self.action("evidence", {"kind": "note", "name": "note", "description": "现场记录",
                                     "discoveredAt": "2026-09-07T12:00:00+08:00"}, "field")
        await self.action(f"verification/{self.state['command']['verification']['verificationId']}/review",
                          {"decision": "confirmed"}, "field")
        self.assertEqual(self.state["command"]["stage"], "B4_EVIDENCE_COLLECTING")
        await self.action("handover", {"summary": "移交", "evidenceIds": [self.state["command"]["evidenceIndex"][0]["evidenceId"]]}, "field")
        await self.action("verification", {"query": "changed"}, "field", 409)

    async def test_legacy_mobile_endpoint_accepts_versioned_command_transition(self):
        await self.dispatched()
        code, result = await helpers.request(self.app, "PATCH", f"/api/events/{self.event_id}/status", {
            "requestId": uuid4().hex, "expectedVersion": self.state["command"]["version"],
            "status": "已接收", "owner": "spoofed-owner",
        }, "field")
        self.assertEqual(code, 200)
        self.assertEqual(result["event"]["status"], "已接收")
        self.assertNotEqual(result["event"]["owner"], "spoofed-owner")

    async def test_command_realtime_notifications_are_filtered_by_current_token(self):
        await self.dispatched()
        from app.services.realtime import RealtimeHub

        class Socket:
            def __init__(self, token):
                self.query_params = {"token": token}
                self.headers = {}
                self.messages = []

            async def accept(self):
                pass

            async def send_text(self, payload):
                self.messages.append(payload)

        hub = RealtimeHub()
        owner, other, public = Socket("field"), Socket("other"), Socket("")
        for socket in [owner, other, public]:
            await hub.connect(socket)
        await hub.publish({"type": "command.updated", "eventId": self.event_id})
        self.assertEqual(len(owner.messages), 1)
        self.assertEqual(other.messages, [])
        self.assertEqual(public.messages, [])

    async def test_live_archive_lookup_does_not_confirm_ambiguous_names(self):
        await self.create(demo=False)
        await self.action("summary/confirm", {"summaryVersion": 1, "text": "manual summary",
                          "category": "消费纠纷", "dangerFactors": ["不详"]})
        await self.action("dispatch/confirm", {"staffId": "wang", "summaryVersion": 1, "locationVersion": 1}, "dispatch")
        await self.action("dispatch", {"recommendationId": self.state["command"]["dispatch"]["recommendationId"]}, "dispatch")
        for status in ["已接收", "已到达", "处理中"]:
            await self.action("status", {"status": status}, "field")
        with SessionLocal.begin() as session:
            for i in range(2):
                session.add(IdentityProfile(personKey=f"TEST-PERSON-{i}", archiveNo=f"TEST-ARCHIVE-{i}",
                    name="Shared teaching name", createdAt="2026-09-06T17:00:00Z",
                    updatedAt="2026-09-06T17:00:00Z", tags_json=[]))
        await self.action("verification", {"query": "Shared teaching name"}, "field")
        self.assertEqual(self.state["command"]["verification"]["lookupStatus"], "ambiguous")
        await self.action(f"verification/{self.state['command']['verification']['verificationId']}/review",
                          {"decision": "confirmed"}, "field", 409)
        await self.action("verification", {"query": "TEST-ARCHIVE-0"}, "field")
        record = self.state["command"]["verification"]
        self.assertEqual(record["personKey"], "TEST-PERSON-0")
        self.assertEqual(record["method"], "archive_lookup")
        self.assertEqual(record["resultStatus"], "pending")
        self.assertIsNone(record["confidence"])

    async def test_historical_intake_get_is_readonly_and_initialization_starts_at_one(self):
        await self.create(demo=False)
        with SessionLocal.begin() as session:
            row = session.get(SafetyEvent, self.event_id)
            row.meta_json = {key: value for key, value in row.meta_json.items() if key != "command"}
            row.description = "original historical transcript"
        read = await self.call("GET", f"/events/{self.event_id}/context")
        self.assertIsNone(read["command"])
        result = await self.call("PATCH", f"/events/{self.event_id}/intake", {
            "requestId": "initialize", "expectedVersion": 0, "transcript": "revised text", "locationText": "new location",
        })
        self.assertEqual(result["command"]["version"], 1)
        self.assertEqual(result["command"]["summary"]["version"], 1)
        self.assertEqual(result["command"]["intakeHistory"][0]["transcript"], "original historical transcript")


if __name__ == "__main__":
    unittest.main(verbosity=2)
