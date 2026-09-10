"""Private SQLite verification; never initialize or mutate the configured service DB."""
from __future__ import annotations

from copy import deepcopy
import asyncio
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with patch.dict(os.environ, {
    "DATABASE_URL": "sqlite:///:memory:",
    "CICSIC_ALLOW_SQLITE_TESTS": "1",
}):
    from sqlalchemy import create_engine, event, select, text
    from sqlalchemy.orm import sessionmaker
    from app.services import auth_store, command_workflow, database, models, system_control


@unittest.skipUnless(os.name == "posix", "0600 verification requires a POSIX filesystem")
class DeploymentAccountsTest(unittest.TestCase):
    def setUp(self):
        from app.services import deployment_accounts

        self.module = deployment_accounts
        self.temp = tempfile.TemporaryDirectory(prefix="xiaoan-account-tests-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / "accounts.json"
        self.url = "sqlite:///" + str(self.root / "isolated.db")
        self.engine = create_engine(self.url)

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

        self.addCleanup(self.engine.dispose)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False, autoflush=False)
        database.Base.metadata.create_all(self.engine)
        for owner in (database, auth_store, command_workflow, system_control):
            self.enterContext(patch.object(owner, "SessionLocal", self.sessions))
        self.enterContext(patch.object(database, "engine", self.engine))
        self.enterContext(patch.dict(os.environ, {
            "APP_ENV": "production", "CICSIC_COMMAND_DEMO": "0", "CICSIC_COMMAND_ISOLATED": "0",
        }))

    def initialize(self, staff=(), output=None):
        return self.module.initialize_accounts(output or self.output, field_staff_ids=staff)

    def report(self):
        return json.loads(self.output.read_text(encoding="utf-8"))

    def snapshot(self):
        with self.sessions() as session:
            return {
                model.__tablename__: [
                    {column.key: getattr(row, column.key) for column in mapper.column_attrs}
                    for row in session.scalars(select(model).order_by(model.openid))
                ]
                for model in (models.WechatUser, models.UserRole, models.CommandPrincipal)
                for mapper in [model.__mapper__]
            }

    def add_staff(self, identifier="staff-exact-1", name="Exact field identifier"):
        with self.sessions.begin() as session:
            session.add(models.PatrolStaff(
                id=identifier, name=name, role="Untrusted display label",
                latitude=0, longitude=0, modes=[], online=True, updatedAt="2026-01-01",
            ))

    def save_report(self, report):
        self.output.write_text(json.dumps(report), encoding="utf-8")

    def initialize_service_key(self, output=None):
        return self.module.initialize_source_access_key(output or self.root / "source-key.json")

    def service_report(self):
        return json.loads((self.root / "source-key.json").read_text(encoding="utf-8"))

    def service_snapshot(self):
        with self.sessions() as session:
            return [
                {column.key: getattr(row, column.key) for column in models.ServiceAccessKey.__mapper__.column_attrs}
                for row in session.scalars(select(models.ServiceAccessKey).order_by(models.ServiceAccessKey.keyId))
            ]

    def test_source_ingest_key_uses_existing_auth_hash_and_is_not_a_user_token(self):
        with patch.dict(os.environ, {"CICSIC_ACCESS_KEY_PEPPER": "synthetic-isolated-pepper"}):
            result = self.initialize_service_key()
            report = self.service_report()
            key = report["serviceKey"]
            self.assertTrue(result["created"])
            self.assertNotIn(key["secret"], repr(result))
            self.assertEqual(report["purpose"], "yolo-source-ingest")
            self.assertEqual(key["scopes"], ["source:ingest"])
            self.assertRegex(key["secret"], r"^cicsic_[A-Za-z0-9_-]{64}$")
            self.assertEqual(report["usage"]["environment"], "CICSIC_REVIEW_API_KEY")
            self.assertEqual(report["usage"]["header"], "X-Service-Key")
            self.assertEqual(stat.S_IMODE((self.root / "source-key.json").stat().st_mode), 0o600)
            with self.sessions() as session:
                row = session.get(models.ServiceAccessKey, key["keyId"])
                self.assertEqual(row.keyHash, system_control._hash_access_key(key["secret"]))
                self.assertNotIn(key["secret"], repr(self.service_snapshot()))
                self.assertIsNone(row.expiresAt)
                self.assertIsNone(row.lastUsedAt)
                self.assertEqual(session.query(models.WechatUser).count(), 0)
                self.assertEqual(session.query(models.PlatformSetting).count(), 0)
            self.assertTrue(system_control.verify_access_key(key["secret"], "source:ingest"))
            self.assertFalse(system_control.verify_access_key(key["secret"], "admin"))
            self.assertIsNone(auth_store.get_user_by_token(key["secret"]))
            self.assertIsNone(command_workflow.actor_for_token(key["secret"], required=False))

    def test_source_key_rerun_preserves_human_report_and_migrated_keys_and_settings(self):
        self.initialize()
        accounts_before, content = self.snapshot(), self.output.read_bytes()
        with self.sessions.begin() as session:
            session.add(models.ServiceAccessKey(
                keyId="migrated-key", name="Deployment YOLO source ingest", keyPrefix="old...",
                keyHash=system_control._hash_access_key("migrated-synthetic-key"), scopes_json=["source:ingest"],
                status="revoked", expiresAt="2000-01-01", createdAt="old", updatedAt="old",
            ))
            session.add(models.PlatformSetting(
                settingKey=system_control.PLATFORM_SETTINGS_KEY,
                config_json={"sourceAuthEnabled": True, "other": "preserve"}, updatedAt="old",
            ))
        old = self.service_snapshot()[0]
        self.initialize_service_key()
        key = self.service_report()["serviceKey"]
        self.assertTrue(system_control.verify_access_key(key["secret"], "source:ingest"))
        before = self.service_snapshot()
        path = self.root / "source-key.json"
        report_bytes, stamp = path.read_bytes(), path.stat().st_mtime_ns
        self.assertFalse(self.initialize_service_key()["created"])
        self.assertEqual(before, self.service_snapshot())
        self.assertEqual(old, next(row for row in before if row["keyId"] == "migrated-key"))
        self.assertEqual(report_bytes, path.read_bytes())
        self.assertEqual(stamp, path.stat().st_mtime_ns)
        self.assertEqual(accounts_before, self.snapshot())
        self.assertEqual(content, self.output.read_bytes())
        with self.sessions() as session:
            setting = session.get(models.PlatformSetting, system_control.PLATFORM_SETTINGS_KEY)
            self.assertEqual(setting.config_json, {"sourceAuthEnabled": True, "other": "preserve"})

    def test_source_key_drift_revocation_and_pepper_changes_fail_without_repair(self):
        self.initialize_service_key()
        report = self.service_report()
        for attribute, value in [
            ("status", "revoked"), ("scopes_json", ["source:ingest", "admin"]),
            ("keyHash", "0" * 64), ("expiresAt", "2000-01-01"),
        ]:
            with self.subTest(attribute=attribute):
                with self.sessions.begin() as session:
                    row = session.get(models.ServiceAccessKey, report["serviceKey"]["keyId"])
                    prior = deepcopy(getattr(row, attribute))
                    setattr(row, attribute, value)
                before = self.service_snapshot()
                with self.assertRaises(self.module.DeploymentAccountsError):
                    self.initialize_service_key()
                self.assertEqual(before, self.service_snapshot())
                with self.sessions.begin() as session:
                    setattr(session.get(models.ServiceAccessKey, report["serviceKey"]["keyId"]), attribute, prior)
        with patch.dict(os.environ, {"CICSIC_ACCESS_KEY_PEPPER": "different-synthetic-pepper"}):
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize_service_key()
        self.assertEqual(report, self.service_report())

    def test_source_key_reports_cannot_replace_account_reports_or_malformed_reports(self):
        self.initialize()
        before = self.output.read_bytes()
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize_service_key(self.output)
        self.assertEqual(before, self.output.read_bytes())
        self.assertEqual(self.service_snapshot(), [])
        self.initialize_service_key()
        original = self.service_report()
        path = self.root / "source-key.json"
        for key, value in (("schemaVersion", True), ("purpose", "admin"),
                           ("serviceKey", {"secret": "forged"}), ("usage", {})):
            report = deepcopy(original)
            report[key] = value
            path.write_text(json.dumps(report), encoding="utf-8")
            before = self.service_snapshot()
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize_service_key()
            self.assertEqual(report, self.service_report())
            self.assertEqual(before, self.service_snapshot())

    def test_source_key_output_failure_rolls_back_without_using_committing_create_helper(self):
        with patch.object(system_control, "create_access_key", side_effect=AssertionError("must share transaction")):
            with patch.object(self.module.os, "fsync", side_effect=OSError("synthetic-write-error")):
                with self.assertRaises(self.module.DeploymentAccountsError):
                    self.initialize_service_key()
        self.assertEqual(self.service_snapshot(), [])
        self.assertFalse((self.root / "source-key.json").exists())
        self.assertEqual(self.snapshot()["wechat_users"], [])

    def test_source_key_commit_failure_keeps_recovery_report(self):
        def fail_commit(_):
            raise RuntimeError("synthetic-commit-error")

        event.listen(self.sessions, "before_commit", fail_commit)
        try:
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize_service_key()
        finally:
            event.remove(self.sessions, "before_commit", fail_commit)
        self.assertEqual(self.service_snapshot(), [])
        self.assertTrue((self.root / "source-key.json").is_file())
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize_service_key()

    def test_source_key_hash_collision_and_missing_schema_fail_without_changes(self):
        with self.sessions.begin() as session:
            session.add(models.ServiceAccessKey(
                keyId="existing", name="Existing key", keyPrefix="cicsic_" + "T" * 9 + "...",
                keyHash=system_control._hash_access_key("cicsic_" + "T" * 64), scopes_json=["source:ingest"],
                status="active", createdAt="old", updatedAt="old",
            ))
        before = self.service_snapshot()
        with patch.object(self.module.secrets, "token_urlsafe", return_value="T" * 64):
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize_service_key()
        self.assertEqual(before, self.service_snapshot())
        models.ServiceAccessKey.__table__.drop(self.engine)
        with self.assertRaisesRegex(self.module.DeploymentAccountsError, "schema"):
            self.initialize_service_key()
        self.assertFalse((self.root / "source-key.json").exists())

    def test_service_header_is_accepted_by_real_ingest_dependency_only(self):
        from fastapi import Depends, FastAPI
        from app.api.dependencies import require_source_ingest_key

        self.initialize_service_key()
        key = self.service_report()["serviceKey"]["secret"]
        with self.sessions.begin() as session:
            session.add(models.PlatformSetting(settingKey=system_control.PLATFORM_SETTINGS_KEY,
                        config_json={"sourceAuthEnabled": True}, updatedAt="test"))
        app = FastAPI()
        app.get("/ingest", dependencies=[Depends(require_source_ingest_key)])(lambda: {"ok": True})

        async def request(headers):
            messages = []

            async def receive():
                return {"type": "http.request", "body": b"", "more_body": False}

            async def send(message):
                messages.append(message)

            await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                       "method": "GET", "scheme": "http", "path": "/ingest", "raw_path": b"/ingest",
                       "query_string": b"", "root_path": "", "headers": headers,
                       "client": ("127.0.0.1", 1), "server": ("isolated.test", 80)}, receive, send)
            return next(message["status"] for message in messages if message["type"] == "http.response.start")

        self.assertEqual(asyncio.run(request([(b"x-service-key", key.encode())])), 200)
        self.assertEqual(asyncio.run(request([(b"x-api-key", key.encode())])), 401)
        self.assertEqual(asyncio.run(request([])), 401)
        system_control.update_access_key(self.service_report()["serviceKey"]["keyId"], "revoked")
        self.assertEqual(asyncio.run(request([(b"x-service-key", key.encode())])), 401)

    def test_source_key_cli_prints_no_secrets_and_reuses_report(self):
        path = self.root / "source-key.json"
        environment = {**os.environ, "DATABASE_URL": self.url, "CICSIC_ALLOW_SQLITE_TESTS": "1",
                       "PYTHONDONTWRITEBYTECODE": "1",
                       "PYTHONPATH": str(Path(__file__).resolve().parents[1])}
        command = [sys.executable, "-B", "-m", "app.services.deployment_accounts",
                   "--source-key-output", str(path)]
        first = subprocess.run(command, env=environment, text=True, capture_output=True, timeout=30)
        self.assertEqual(first.returncode, 0, first.stderr)
        secret = self.service_report()["serviceKey"]["secret"]
        second = subprocess.run(command, env=environment, text=True, capture_output=True, timeout=30)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertNotIn(secret, first.stdout + first.stderr + second.stdout + second.stderr)
        self.assertEqual(secret, self.service_report()["serviceKey"]["secret"])

    def test_default_has_one_command_account_and_no_field_or_demo_authority(self):
        result = self.initialize()
        self.assertTrue(result["created"])
        report = self.report()
        self.assertEqual(report["schemaVersion"], 1)
        self.assertEqual(len(report["accounts"]), 1)
        account = report["accounts"][0]
        self.assertEqual(account["kind"], "command")
        self.assertEqual(account["roles"], ["intake", "dispatch", "analyze", "audit"])
        self.assertIsNone(account["staffId"])
        self.assertRegex(account["token"], r"^[A-Za-z0-9_-]{64}$")
        self.assertNotIn(account["token"], repr(result))
        actor = command_workflow.actor_for_token(account["token"])
        self.assertEqual(actor.roles, frozenset(account["roles"]))
        self.assertIsNone(actor.staff_id)
        self.assertEqual(auth_store.get_user_by_token(account["token"])["openid"], account["openid"])
        self.assertFalse(command_workflow.demo_enabled())
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)
        self.assertIn("sessionStorage.getItem", report["usage"]["get"])
        self.assertIn("sessionStorage.setItem", report["usage"]["set"])
        with self.sessions() as session:
            self.assertEqual(session.query(models.PatrolStaff).count(), 0)
            self.assertEqual(session.query(models.UserRole).count(), 1)

    def test_preserves_migrated_users_tokens_and_all_existing_permissions(self):
        with self.sessions.begin() as session:
            for name in ("admin-legacy", "cmd-legacy", "staff-legacy", "migrated"):
                session.add(models.WechatUser(openid=name, token="existing-" + name,
                                              created_at="old", last_login_at="old"))
            session.flush()
            for name in ("admin-legacy", "cmd-legacy", "staff-legacy", "migrated"):
                session.add(models.UserRole(openid=name, role="Administrator",
                    permissions_json=["custom-permission"], createdAt="old", updatedAt="old"))
            session.add(models.CommandPrincipal(openid="migrated", roles_json=["audit"], enabled=False))
        before = self.snapshot()
        self.initialize()
        after = self.snapshot()
        for table, rows in before.items():
            self.assertEqual(rows, [row for row in after[table] if row["openid"] in {
                "admin-legacy", "cmd-legacy", "staff-legacy", "migrated",
            }])
        for name in ("admin-legacy", "cmd-legacy", "staff-legacy", "migrated"):
            with self.assertRaises(command_workflow.HTTPException) as failure:
                command_workflow.actor_for_token("existing-" + name)
            self.assertEqual(failure.exception.status_code, 403)

    def test_field_accounts_are_opt_in_separate_and_bound_only_by_exact_id(self):
        self.add_staff()
        self.add_staff("staff-exact-2", "Another staff")
        self.initialize(["staff-exact-2"])
        accounts = self.report()["accounts"]
        self.assertEqual(len(accounts), 2)
        self.assertNotEqual(accounts[0]["token"], accounts[1]["token"])
        self.assertNotEqual(accounts[0]["openid"], accounts[1]["openid"])
        self.assertEqual(accounts[1]["kind"], "field")
        actor = command_workflow.actor_for_token(accounts[1]["token"])
        self.assertEqual(actor.roles, frozenset({"field"}))
        self.assertEqual(actor.staff_id, "staff-exact-2")
        with self.assertRaises(command_workflow.HTTPException):
            command_workflow.require_role(actor, "dispatch")

    def test_missing_or_display_name_staff_and_duplicate_ids_fail_without_writes(self):
        self.add_staff()
        before = self.snapshot()
        for identifiers in (["missing"], ["Exact field identifier"], ["staff-exact-1", "missing"],
                            ["staff-exact-1", "staff-exact-1"], [" staff-exact-1"], [""]):
            with self.subTest(identifiers=identifiers):
                with self.assertRaises(self.module.DeploymentAccountsError):
                    self.initialize(identifiers)
                self.assertEqual(before, self.snapshot())
                self.assertFalse(self.output.exists())

    def test_rerun_validates_without_rotation_or_rewriting_report(self):
        self.add_staff()
        self.initialize(["staff-exact-1"])
        before, content, stamp = self.snapshot(), self.output.read_bytes(), self.output.stat().st_mtime_ns
        self.assertFalse(self.initialize(["staff-exact-1"])["created"])
        self.assertEqual(before, self.snapshot())
        self.assertEqual(content, self.output.read_bytes())
        self.assertEqual(stamp, self.output.stat().st_mtime_ns)
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize()
        self.assertEqual(before, self.snapshot())

    def test_malformed_existing_reports_are_never_overwritten(self):
        self.initialize()
        original, before = self.report(), self.snapshot()
        variants = []
        for key, value in (("schemaVersion", 2), ("schemaVersion", True), ("createdAt", "bad"),
                           ("accounts", []), ("usage", {})):
            report = deepcopy(original)
            report[key] = value
            variants.append(report)
        for key, value in (("token", "invalid"), ("roles", ["intake", "field"]),
                           ("openid", "admin-legacy"), ("staffId", "missing"), ("kind", "other")):
            report = deepcopy(original)
            report["accounts"][0][key] = value
            variants.append(report)
        for report in variants:
            with self.subTest(report_field=list(report)):
                self.save_report(report)
                content = self.output.read_bytes()
                with self.assertRaises(self.module.DeploymentAccountsError):
                    self.initialize()
                self.assertEqual(content, self.output.read_bytes())
                self.assertEqual(before, self.snapshot())
        self.output.write_text('{"schemaVersion":', encoding="utf-8")
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize()
        self.assertEqual(before, self.snapshot())

    def test_existing_database_grant_or_token_drift_fails_without_restoring_permissions(self):
        self.initialize()
        account = self.report()["accounts"][0]
        changes = [
            (models.CommandPrincipal, "enabled", False),
            (models.CommandPrincipal, "roles_json", ["audit"]),
            (models.UserRole, "permissions_json", ["custom"]),
            (models.WechatUser, "token", "rotated-by-owner"),
        ]
        for model, attribute, value in changes:
            with self.subTest(attribute=attribute):
                with self.sessions.begin() as session:
                    row = session.get(model, account["openid"])
                    prior = deepcopy(getattr(row, attribute))
                    setattr(row, attribute, value)
                before = self.snapshot()
                with self.assertRaises(self.module.DeploymentAccountsError):
                    self.initialize()
                self.assertEqual(before, self.snapshot())
                with self.sessions.begin() as session:
                    setattr(session.get(model, account["openid"]), attribute, prior)

    def test_missing_schema_is_not_created_or_migrated(self):
        models.CommandPrincipal.__table__.drop(self.engine)
        with self.assertRaisesRegex(self.module.DeploymentAccountsError, "schema"):
            self.initialize()
        from sqlalchemy import inspect
        self.assertFalse(inspect(self.engine).has_table("command_principals"))
        self.assertFalse(self.output.exists())
        with self.sessions() as session:
            self.assertEqual(session.query(models.WechatUser).count(), 0)

    def test_mismatched_column_schema_fails_before_creating_accounts(self):
        with self.engine.begin() as connection:
            connection.execute(text("ALTER TABLE user_roles ADD COLUMN unexpected_required TEXT NOT NULL DEFAULT ''"))
        before = self.snapshot()
        with self.assertRaisesRegex(self.module.DeploymentAccountsError, "schema"):
            self.initialize()
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.output.exists())

    def test_private_output_rejects_symlinks_hardlinks_and_public_files(self):
        target = self.root / "keep.json"
        target.write_text("keep", encoding="utf-8")
        self.output.symlink_to(target)
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize()
        self.assertEqual(target.read_text(), "keep")
        self.output.unlink()
        self.initialize()
        os.chmod(self.output, 0o644)
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize()
        os.chmod(self.output, 0o600)
        os.link(self.output, self.root / "hardlink.json")
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize()

    def test_unsafe_or_missing_output_parent_does_not_create_accounts(self):
        before = self.snapshot()
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize(output=self.root / "missing" / "accounts.json")
        os.chmod(self.root, 0o777)
        try:
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize()
        finally:
            os.chmod(self.root, 0o700)
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.output.exists())

    def test_output_write_failure_rolls_back_accounts_and_removes_partial_report(self):
        before = self.snapshot()
        with patch.object(self.module.os, "fsync", side_effect=OSError("secret-must-not-leak")):
            with self.assertRaises(self.module.DeploymentAccountsError) as failure:
                self.initialize()
        self.assertNotIn("secret-must-not-leak", str(failure.exception))
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.output.exists())

    def test_directory_sync_failure_also_rolls_back_accounts(self):
        before = self.snapshot()
        with patch.object(self.module.os, "fsync", side_effect=[None, OSError("directory sync failed")]):
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize()
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.output.exists())

    def test_output_creation_race_never_overwrites_the_other_report(self):
        before = self.snapshot()
        writer = self.module._write_report

        def competing_writer(directory, name, report):
            self.output.write_text("another operator's file", encoding="utf-8")
            os.chmod(self.output, 0o600)
            writer(directory, name, report)

        with patch.object(self.module, "_write_report", side_effect=competing_writer):
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize()
        self.assertEqual(self.output.read_text(), "another operator's file")
        self.assertEqual(before, self.snapshot())

    def test_identity_and_token_collisions_do_not_overwrite_or_partially_commit(self):
        self.add_staff()
        with self.sessions.begin() as session:
            session.add(models.WechatUser(
                openid="deployment-" + "a" * 32, token="T" * 64, created_at="old", last_login_at="old",
            ))
        before = self.snapshot()
        with patch.object(self.module.secrets, "token_hex", return_value="a" * 32):
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize()
        with patch.object(self.module.secrets, "token_urlsafe", return_value="T" * 64):
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize()
        with patch.object(self.module.secrets, "token_urlsafe", side_effect=["N" * 64, "T" * 64]):
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize(["staff-exact-1"])
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.output.exists())

    def test_generation_uses_384_bit_tokens_and_accounts_cannot_share_a_token(self):
        self.add_staff()
        generator = self.module.secrets.token_urlsafe
        with patch.object(self.module.secrets, "token_urlsafe", wraps=generator) as tokens:
            self.initialize(["staff-exact-1"])
        self.assertEqual([call.args for call in tokens.call_args_list], [(48,), (48,)])
        accounts = self.report()["accounts"]
        with self.sessions.begin() as session:
            session.add(models.WechatUser(
                openid="foreign-account", token=accounts[0]["token"], created_at="old", last_login_at="old",
            ))
        before = self.snapshot()
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize(["staff-exact-1"])
        self.assertEqual(before, self.snapshot())

    def test_duplicate_json_keys_and_symlinked_parent_are_rejected(self):
        self.initialize()
        content = self.output.read_text()
        self.output.write_text(content.replace('"schemaVersion": 1,',
                                                '"schemaVersion": 99, "schemaVersion": 1,'))
        before = self.snapshot()
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize()
        target = self.root / "private"
        target.mkdir(mode=0o700)
        link = self.root / "linked"
        link.symlink_to(target, target_is_directory=True)
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize(output=link / "accounts.json")
        self.assertEqual(before, self.snapshot())
        self.assertFalse((target / "accounts.json").exists())

    def test_native_windows_fails_closed_without_database_changes(self):
        before = self.snapshot()
        with patch.object(self.module.os, "name", "nt"):
            with self.assertRaisesRegex(self.module.DeploymentAccountsError, "Linux"):
                self.initialize()
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.output.exists())

    def test_commit_failure_retains_private_report_for_uncertain_commit_recovery(self):
        before = self.snapshot()

        def reject_commit(_):
            raise RuntimeError("private-database-error")

        event.listen(self.sessions, "before_commit", reject_commit)
        try:
            with self.assertRaises(self.module.DeploymentAccountsError):
                self.initialize()
        finally:
            event.remove(self.sessions, "before_commit", reject_commit)
        self.assertEqual(before, self.snapshot())
        self.assertTrue(self.output.exists())
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)
        content = self.output.read_bytes()
        with self.assertRaises(self.module.DeploymentAccountsError):
            self.initialize()
        self.assertEqual(content, self.output.read_bytes())

    def test_cli_outputs_no_tokens_and_help_needs_no_database(self):
        environment = {**os.environ, "DATABASE_URL": self.url, "CICSIC_ALLOW_SQLITE_TESTS": "1",
                       "PYTHONDONTWRITEBYTECODE": "1",
                       "PYTHONPATH": str(Path(__file__).resolve().parents[1])}
        command = [sys.executable, "-B", "-m", "app.services.deployment_accounts"]
        result = subprocess.run(command + ["--output", str(self.output)], env=environment,
                                text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        for account in self.report()["accounts"]:
            self.assertNotIn(account["token"], result.stdout + result.stderr)
        environment["DATABASE_URL"] = "invalid://secret-connection-string"
        help_result = subprocess.run(command + ["--help"], env=environment,
                                     text=True, capture_output=True, timeout=30)
        self.assertEqual(help_result.returncode, 0)
        self.assertIn("--field-staff", help_result.stdout)
        bad = subprocess.run(command + ["--output", str(self.root / "other.json")],
                             env=environment, text=True, capture_output=True, timeout=30)
        self.assertNotEqual(bad.returncode, 0)
        self.assertNotIn("secret-connection-string", bad.stdout + bad.stderr)
        self.assertNotIn("Traceback", bad.stderr)

    def test_generated_accounts_complete_live_workflow_with_real_authorization(self):
        self.add_staff()
        self.add_staff("other-staff", "Another staff")
        self.initialize(["staff-exact-1", "other-staff"])
        accounts = self.report()["accounts"]
        commander = command_workflow.actor_for_token(accounts[0]["token"])
        actors = {item["staffId"]: command_workflow.actor_for_token(item["token"])
                  for item in accounts[1:]}
        field = actors["staff-exact-1"]
        state = command_workflow.create_intake(
            {"requestId": uuid4().hex, "transcript": "Private isolated workflow check", "bay": "Test site"},
            commander,
        )
        event_id = state["event"]["id"]
        self.assertEqual(state["command"]["sourceMode"], "live")

        def action(name, fields, actor=commander, child_id=None):
            nonlocal state
            state = command_workflow.execute(event_id, name, {
                "requestId": uuid4().hex, "expectedVersion": state["command"]["version"], **fields,
            }, actor, child_id=child_id)

        action("summary/confirm", {"summaryVersion": 1, "text": "Confirmed by operator",
                                  "category": "Manual intake", "dangerFactors": ["Unconfirmed"]})
        action("dispatch/confirm", {"staffId": "staff-exact-1", "summaryVersion": 1, "locationVersion": 1})
        action("dispatch", {"recommendationId": state["command"]["dispatch"]["recommendationId"]})
        with self.assertRaises(command_workflow.HTTPException) as failure:
            command_workflow.context(event_id, actors["other-staff"])
        self.assertEqual(failure.exception.status_code, 404)
        for status in ("\u5df2\u63a5\u6536", "\u5df2\u5230\u8fbe", "\u5904\u7406\u4e2d"):
            action("status", {"status": status}, field)
        action("verification", {"query": "Unmatched isolated test person"}, field)
        action("verification/review", {"decision": "no_match"}, field,
               state["command"]["verification"]["verificationId"])
        action("evidence", {"kind": "note", "name": "Test note", "description": "Isolated record",
                            "discoveredAt": "2026-01-01T00:00:00+00:00"}, field)
        action("handover", {"summary": "Manual handover",
                            "evidenceIds": [state["command"]["evidenceIndex"][0]["evidenceId"]]}, field)
        action("handover/review", {"decision": "accepted"}, commander,
               state["command"]["handover"]["handoverId"])
        action("status", {"status": "\u5df2\u5b8c\u6210", "result": "Verified handover"}, field)
        self.assertEqual(state["command"]["stage"], "B4_HANDOVER_ACCEPTED")


if __name__ == "__main__":
    unittest.main(verbosity=2)
