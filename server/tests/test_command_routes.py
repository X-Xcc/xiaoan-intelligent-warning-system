"""Command acceptance tests run against a private database, never server/.env."""
from __future__ import annotations

import importlib.util
import atexit
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
TEMP = tempfile.TemporaryDirectory(prefix="cicsic-command-tests-")
os.environ["DATABASE_URL"] = "sqlite:///" + str(Path(TEMP.name) / "test.db").replace("\\", "/")
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"
os.environ["CICSIC_EVIDENCE_DIR"] = str(Path(TEMP.name) / "evidence")
os.environ["CICSIC_COMMAND_DEMO"] = "1"
os.environ["CICSIC_COMMAND_ISOLATED"] = "1"
os.environ["APP_ENV"] = "development"

from fastapi import FastAPI
from app.api.routes import events
from app.services import event_store, models
from app.services.database import Base, SessionLocal, engine
from app.services.models import EventAuditLog, SafetyEvent, UserRole, WechatUser

atexit.register(engine.dispose)


async def request(app, method, url, data=None, token=None, raw=None, content_type=None):
    messages = []
    parts = urlsplit(url)
    body = raw if raw is not None else json.dumps(data or {}).encode()
    headers = [(b"content-type", (content_type or "application/json").encode())]
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode()))

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        messages.append(message)

    await app(
        {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
         "method": method, "scheme": "http", "path": parts.path, "raw_path": parts.path.encode(),
         "query_string": parts.query.encode(), "root_path": "", "headers": headers,
         "client": ("127.0.0.1", 1), "server": ("offline.test", 80)},
        receive, send,
    )
    status = next(item["status"] for item in messages if item["type"] == "http.response.start")
    content = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
    try:
        return status, json.loads(content)
    except (ValueError, UnicodeDecodeError):
        return status, content


class CommandRoutesTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.app = FastAPI()
        if importlib.util.find_spec("app.api.routes.command"):
            from app.api.routes import command
            self.app.include_router(command.router, prefix="/api")
        self.app.include_router(events.router, prefix="/api")
        self.app.dependency_overrides[events.enforce_public_write_rate_limit] = lambda: None
        Base.metadata.create_all(engine)
        patch.object(event_store, "init_db", return_value=None).start()
        self.addCleanup(patch.stopall)
        self.addCleanup(lambda: Base.metadata.drop_all(engine))
        with SessionLocal() as session:
            event_store._seed_staff(session)
            for name, roles, staff in [
                ("intake", ["intake"], None), ("dispatch", ["dispatch"], None),
                ("field", ["field"], "wang"), ("other", ["field"], "li"),
                ("analysis", ["analyze"], None), ("screen", ["display"], None),
                ("admin-guessed", [], None),
            ]:
                session.add(WechatUser(openid=name, token=name, created_at="2026-09-07",
                                       last_login_at="2026-09-07"))
                session.add(UserRole(openid=name, role="管理员", permissions_json=["dispatch", "analyze"],
                                     createdAt="2026-09-07", updatedAt="2026-09-07"))
                if hasattr(models, "CommandPrincipal") and roles:
                    session.add(models.CommandPrincipal(openid=name, roles_json=roles, staffId=staff, enabled=True))
            session.commit()

    async def call(self, method, path, payload=None, actor="intake", expected=200):
        code, body = await request(self.app, method, "/api/command" + path, payload, actor)
        self.assertEqual(code, expected, body)
        return body

    async def create(self, demo=True):
        payload = {"requestId": uuid4().hex, "runKey": uuid4().hex,
                   "scenarioId": "night_market_b1_b4", "scenarioVersion": "1.0"}
        if not demo:
            payload = {"requestId": uuid4().hex, "bay": "手工地址", "transcript": "请帮忙处理消费纠纷"}
        self.state = await self.call("POST", "/demo-runs" if demo else "/intakes", payload)
        self.event_id = self.state["event"]["id"]
        return self.state

    async def action(self, action, fields=None, actor="intake", expected=200, method="POST"):
        payload = {"requestId": uuid4().hex, "expectedVersion": self.state["command"]["version"], **(fields or {})}
        result = await self.call(method, f"/events/{self.event_id}/{action}", payload, actor, expected)
        if expected == 200:
            self.state = result
        return result

    async def confirmed(self):
        await self.create()
        await self.action("summary/confirm", {"summaryVersion": 1, "category": "消费纠纷",
                          "text": "现场发生消费纠纷，需人工核查", "dangerFactors": ["不详"], "riskTags": ["纠纷升级风险"]})
        await self.action("dispatch/confirm", {"staffId": "wang", "summaryVersion": 1, "locationVersion": 1}, "dispatch")

    async def dispatched(self):
        await self.confirmed()
        await self.action("dispatch", {"recommendationId": self.state["command"]["dispatch"]["recommendationId"]}, "dispatch")

    async def onsite(self):
        await self.dispatched()
        for status in ["已接收", "已到达", "处理中"]:
            await self.action("status", {"status": status}, "field")

    async def evidence_and_verification(self):
        await self.onsite()
        await self.action("verification", {"query": "陈XX"}, "field")
        verification = self.state["command"]["verification"]["verificationId"]
        await self.action(f"verification/{verification}/review", {"decision": "confirmed"}, "field")
        await self.action("evidence", {"kind": "note", "name": "清点记录", "description": "8张票据、1本笔记本、1部备用手机",
                                     "discoveredAt": "2026-09-07T10:00:00+08:00"}, "field")

    async def test_new_module_exposes_readonly_fixture(self):
        fixture = await self.call("GET", "/scenario", actor=None)
        self.assertEqual(len(fixture["relatedAlerts"]), 2)
        with SessionLocal() as session:
            self.assertEqual(session.query(SafetyEvent).count(), 0)

    async def test_create_is_durable_idempotent_and_never_auto_assigns(self):
        payload = {"requestId": "create-once", "bay": "B区7号", "transcript": "食品索赔，有人威胁砸摊"}
        a = await self.call("POST", "/intakes", payload)
        b = await self.call("POST", "/intakes", payload)
        self.assertEqual(a, b)
        self.assertEqual(a["event"]["status"], "已提交")
        self.assertFalse(a["event"]["meta"].get("assignment"))
        await self.call("POST", "/intakes", {**payload, "bay": "other"}, expected=409)
        with SessionLocal() as session:
            self.assertEqual(session.query(SafetyEvent).count(), 1)
            self.assertEqual(session.query(models.VoiceIntake).count(), 1)

    async def test_anonymous_access_keeps_demo_isolation_required(self):
        for actor in (None, "admin-guessed", "screen"):
            result = await self.call("POST", "/intakes", {
                "requestId": str(actor), "bay": "B", "transcript": "help",
            }, actor=actor)
            self.assertEqual(result["event"]["timeline"][0]["operator"], "open-access")
        with patch.dict(os.environ, {"CICSIC_COMMAND_ISOLATED": "0"}):
            await self.call("POST", "/demo-runs", {"requestId": "x", "runKey": "x", "scenarioId": "night_market_b1_b4",
                                               "scenarioVersion": "1.0"}, expected=403)

    async def test_dispatch_requires_current_human_confirmation_and_route_get_is_pure(self):
        await self.confirmed()
        before = self.state
        route = await self.call("GET", f"/events/{self.event_id}/route-preview?staffId=wang", actor="dispatch")
        after = await self.call("GET", f"/events/{self.event_id}/context", actor="dispatch")
        self.assertEqual(before["event"], after["event"])
        self.assertEqual(route["route"]["segments"][0]["estimatedSeconds"], 180)
        self.assertEqual(route["route"]["segments"][1]["distanceMeters"], 200)
        await self.action("dispatch", {"recommendationId": "forged"}, "dispatch", 409)
        await self.action("dispatch", {"recommendationId": before["command"]["dispatch"]["recommendationId"]}, None)
        self.assertEqual(self.state["event"]["status"], "已派单")
        self.assertEqual(self.state["event"]["meta"]["assignment"]["staffId"], "wang")
        code, tasks = await request(self.app, "GET", "/api/events/staff-tasks?staff=wang", token="field")
        self.assertEqual(code, 200)
        self.assertIn(self.event_id, [item["id"] for item in tasks["items"]])

    async def test_edit_invalidates_old_dispatch_and_no_coordinates_have_no_eta(self):
        await self.confirmed()
        old = self.state["command"]["dispatch"]["recommendationId"]
        await self.action("intake", {"transcript": "地点已修订", "locationText": "另一个入口",
                                   "latitude": None, "longitude": None}, method="PATCH")
        self.assertNotEqual(self.state["command"]["summary"]["reviewStatus"], "confirmed")
        await self.action("dispatch", {"recommendationId": old}, "dispatch", 409)
        await self.action("summary/confirm", {"summaryVersion": 2, "category": "消费纠纷", "text": "修订后的摘要",
                                            "dangerFactors": ["不详"], "riskTags": []})
        route = await self.call("GET", f"/events/{self.event_id}/route-preview?staffId=wang", actor="dispatch")
        self.assertEqual(route["route"]["segments"], [])
        self.assertEqual(route["route"]["routeSource"], "manual")

    async def test_version_and_request_payload_conflicts_do_not_change_audit(self):
        await self.create()
        payload = {"requestId": "once", "expectedVersion": 1, "summaryVersion": 1,
                   "category": "消费纠纷", "text": "人工确认", "dangerFactors": ["不详"]}
        path = f"/events/{self.event_id}/summary/confirm"
        a = await self.call("POST", path, payload)
        b = await self.call("POST", path, payload)
        self.assertEqual(a, b)
        await self.call("POST", path, {**payload, "text": "changed"}, expected=409)
        await self.call("POST", path, {**payload, "requestId": "stale"}, expected=409)
        current = await self.call("GET", f"/events/{self.event_id}/context")
        self.assertEqual(len(a["event"]["timeline"]), len(current["event"]["timeline"]))

    async def test_legacy_write_paths_cannot_bypass_guards(self):
        await self.create()
        for path, method, data in [
            ("assign", "PATCH", {"staff": "wang"}), ("status", "PATCH", {"status": "已完成", "owner": "王警官"}),
            ("supplement", "PATCH", {"text": "bypass"}), ("route?staff=wang", "GET", {}),
            ("vision-review", "POST", {"judgement": {"level": "高风险"}}),
        ]:
            code, _ = await request(self.app, method, f"/api/events/{self.event_id}/{path}", data, "dispatch")
            self.assertIn(code, [403, 409, 422])
        current = await self.call("GET", f"/events/{self.event_id}/context")
        self.assertEqual(self.state["event"], current["event"])

    async def test_all_readers_can_access_command_context_and_public_lists(self):
        await self.dispatched()
        for token in [None, "other", "admin-guessed"]:
            code, _ = await request(self.app, "GET", f"/api/events/{self.event_id}", token=token)
            self.assertEqual(code, 200)
            code, result = await request(self.app, "GET", "/api/events", token=token)
            self.assertIn(self.event_id, [item["id"] for item in result["items"]])
        await self.call("GET", f"/events/{self.event_id}/context", actor="other")

    async def test_strict_status_chain_requires_result_and_accepted_handover(self):
        await self.dispatched()
        await self.action("status", {"status": "已到达"}, "field", 409)
        await self.action("status", {"status": "已接收"}, None)
        for status in ["已到达", "处理中"]:
            await self.action("status", {"status": status}, "field")
        await self.action("status", {"status": "已完成", "result": "已处理"}, "field", 409)

    async def test_no_match_and_manual_fallback_are_real_records(self):
        await self.onsite()
        await self.action("verification", {"query": "不存在的教学对象"}, "field")
        verification = self.state["command"]["verification"]
        self.assertEqual(verification["lookupStatus"], "no_match")
        path = f"verification/{verification['verificationId']}/review"
        await self.action(path, {"decision": "confirmed"}, "field", 409)
        await self.action(path, {"decision": "fallback", "reason": ""}, "field", 422)
        await self.action(path, {"decision": "no_match"}, "field")
        self.assertEqual(self.state["command"]["verification"]["resultStatus"], "no_match")
        self.assertIsNone(self.state["command"]["verification"]["confidence"])

    async def test_evidence_ownership_handover_rejection_history_and_completion(self):
        await self.evidence_and_verification()
        evidence = self.state["command"]["evidenceIndex"][0]
        self.assertEqual(evidence["registeredBy"], "open-access")
        await self.action("handover", {"summary": "移交核查", "evidenceIds": ["foreign"]}, "field", 422)
        await self.action("handover", {"summary": "移交核查", "evidenceIds": [evidence["evidenceId"]]}, "field")
        self.assertEqual(self.state["event"]["status"], "处理中")
        handover_id = self.state["command"]["handover"]["handoverId"]
        await self.action(f"handover/{handover_id}/review", {"decision": "rejected", "reason": "补充现场说明"}, None)
        await self.action("handover", {"summary": "已补正现场说明", "evidenceIds": [evidence["evidenceId"]]}, "field")
        self.assertEqual(self.state["command"]["handover"]["version"], 2)
        handover_id = self.state["command"]["handover"]["handoverId"]
        await self.action(f"handover/{handover_id}/review", {"decision": "accepted"}, "analysis")
        self.assertEqual(self.state["event"]["status"], "处理中")
        await self.action("status", {"status": "已完成", "result": "现场处置结束，材料已移交"}, "field")
        self.assertEqual(self.state["event"]["status"], "已完成")
        self.assertEqual(len(self.state["command"]["handoverHistory"]), 1)
        await self.action("evidence", {"kind": "note", "name": "late", "description": "late",
                                     "discoveredAt": "2026-09-07T10:00:00+08:00"}, "field", 409)

    async def test_evidence_rejects_arbitrary_urls_and_wrong_discoverer(self):
        await self.onsite()
        await self.action("evidence", {"kind": "image", "name": "fake", "url": "/outside.jpg",
                                     "discoveredAt": "2026-09-07T10:00:00+08:00"}, "field", 422)
        await self.action("evidence", {"kind": "note", "name": "note", "description": "text",
                                     "discoveredBy": "other", "discoveredAt": "2026-09-07T10:00:00+08:00"}, "field", 422)


if __name__ == "__main__":
    unittest.main(verbosity=2)
