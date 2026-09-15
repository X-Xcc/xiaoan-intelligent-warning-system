"""Anonymous access contracts, using the isolated command-test database."""
import unittest
from unittest.mock import Mock, patch

import test_command_routes as helpers
from app.api.routes import admin, ai_center, auth, db_admin, device_bridges
from app.api.dependencies import require_source_ingest_key
from app.services import command_workflow as workflow, system_control


class OpenAccessTests(unittest.IsolatedAsyncioTestCase):
    setUp = helpers.CommandRoutesTest.setUp

    async def test_command_identity_and_writes_need_no_token(self):
        status, principal = await helpers.request(self.app, "GET", "/api/command/me")
        self.assertEqual(status, 200)
        self.assertEqual(principal["openid"], "open-access")
        self.assertTrue({"intake", "dispatch", "field", "analyze", "audit"} <= set(principal["roles"]))
        status, result = await helpers.request(self.app, "POST", "/api/command/intakes", {
            "requestId": "anonymous-intake", "bay": "Test location", "transcript": "Test intake",
        })
        self.assertEqual(status, 200, result)
        event_id = result["event"]["id"]
        status, snapshot = await helpers.request(self.app, "GET", f"/api/command/events/{event_id}/context")
        self.assertEqual(status, 200, snapshot)
        status, stale = await helpers.request(self.app, "PATCH", f"/api/command/events/{event_id}/intake", {
            "requestId": "stale-edit", "expectedVersion": 99, "transcript": "Changed",
        })
        self.assertEqual(status, 409, stale)

    async def test_admin_and_preview_ignore_saved_authorization_settings(self):
        self.app.include_router(device_bridges.router, prefix="/api")
        with patch.dict("os.environ", {"APP_ENV": "production", "CICSIC_ADMIN_AUTH_ENABLED": "1"}):
            status, result = await helpers.request(self.app, "GET", "/api/device-bridges/auth")
            self.assertEqual(status, 200)
            self.assertTrue(result["authorized"])
            self.assertFalse(result["enabled"])
            self.assertTrue(system_control.verify_admin_token(None))
            self.assertFalse(system_control.source_auth_enabled())

    async def test_identity_and_review_validation_without_login(self):
        self.app.include_router(auth.router, prefix="/api")
        self.app.include_router(ai_center.router, prefix="/api")
        status, result = await helpers.request(self.app, "GET", "/api/auth/me")
        self.assertEqual(status, 200)
        self.assertIn("review", result["user"]["permissions"])
        status, result = await helpers.request(self.app, "POST", "/api/ai-center/review", {
            "auditId": "missing", "decision": "invalid", "reason": "Test",
        })
        self.assertEqual(status, 422, result)

    async def test_database_console_needs_no_basic_credentials(self):
        self.assertEqual(db_admin._require_admin(), "open-access")

    async def test_roles_and_assignment_do_not_block_access(self):
        actor = workflow.Actor("open-access", frozenset())
        workflow.require_role(actor, "field")
        self.assertTrue(workflow.can_read(actor, {"meta": {"command": {"sourceMode": "live"}}}))

    async def test_admin_read_write_and_source_ingest_need_no_credentials(self):
        self.app.include_router(admin.router, prefix="/api")
        with patch.object(admin.admin_store, "overview", return_value={"items": []}):
            status, _ = await helpers.request(self.app, "GET", "/api/admin/overview")
            self.assertEqual(status, 200)
        status, result = await helpers.request(self.app, "PUT", "/api/admin/platform-settings", {
            "adminAuthEnabled": True, "sourceAuthEnabled": True,
            "evidenceUploadLimitMb": 21, "publicWriteRateLimitPerMinute": 30,
        })
        self.assertEqual(status, 200, result)
        self.assertEqual(result["settings"]["evidenceUploadLimitMb"], 21)
        self.assertFalse(result["settings"]["adminAuthEnabled"])
        self.assertFalse(result["settings"]["sourceAuthEnabled"])
        with patch.object(system_control, "source_auth_enabled", return_value=True):
            await require_source_ingest_key(None)
        self.assertFalse(system_control._settings_payload({
            "adminAuthEnabled": True, "sourceAuthEnabled": True,
        })["sourceAuthEnabled"])

    async def test_device_inventory_and_snapshot_without_preview_session(self):
        self.app.include_router(device_bridges.router, prefix="/api")
        manager = Mock()
        manager.list_devices.return_value = []
        manager.get_bindings.return_value = [None] * 16
        manager.runtime_info.return_value = {}
        manager.snapshot.return_value = b"synthetic-jpeg"
        with patch.object(device_bridges, "get_manager", return_value=manager):
            status, result = await helpers.request(self.app, "GET", "/api/device-bridges")
            self.assertEqual(status, 200, result)
            status, result = await helpers.request(self.app, "GET", "/api/device-bridges/camera/snapshot")
            self.assertEqual(status, 200)
            self.assertEqual(result, b"synthetic-jpeg")


if __name__ == "__main__":
    unittest.main()
