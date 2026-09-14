"""Offline regression tests for evidence, archive privacy and key expiry.

Run this module in its own process. Only temporary files and SQLite are used;
the application lifespan, devices and external services are never started.
"""
from __future__ import annotations

import asyncio
import base64
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit


SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))

# A synthetic one-pixel PNG and small container-header fixtures, not recordings.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8"
    "/x8AAwMCAO+aGZkAAAAASUVORK5CYII="
)
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
WEBP = b"RIFF\x16\x00\x00\x00WEBPVP8L\x09\x00\x00\x00\x2f\x00\x00\x00\x00\x07\x10\x11\x11\x00"
MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
WEBM = b"\x1a\x45\xdf\xa3\x87\x42\x82\x84webm"
ADMIN_TOKEN = "synthetic-review-admin-token"
PROFILE = {
    "id": "synthetic-profile", "name": "Synthetic Subject",
    "idNumber": "SYNTHETIC-ID", "faceImage": "synthetic-image",
    "faceFingerprint": "synthetic-fingerprint",
}


async def request(app, method, path, *, body=b"", headers=None):
    parts = urlsplit(path)
    messages = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": body, "more_body": False}
        await asyncio.Event().wait()

    async def send(message):
        messages.append(message)

    await app(
        {
            "type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
            "http_version": "1.1", "method": method, "scheme": "http",
            "path": parts.path, "raw_path": parts.path.encode(),
            "query_string": parts.query.encode(), "root_path": "",
            "headers": [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()],
            "client": ("127.0.0.1", 1), "server": ("offline.test", 80),
        },
        receive, send,
    )
    start = next(item for item in messages if item["type"] == "http.response.start")
    content = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
    return start["status"], {key.decode(): value.decode() for key, value in start["headers"]}, content


class BackendReviewTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.resources = ExitStack()
        cls.addClassCleanup(cls.resources.close)
        root = Path(cls.resources.enter_context(tempfile.TemporaryDirectory(prefix="cicsic-review-")))
        cls.resources.enter_context(patch.dict(os.environ, {
            "DATABASE_URL": "sqlite:///:memory:", "CICSIC_ALLOW_SQLITE_TESTS": "1",
            "CICSIC_EVIDENCE_DIR": str(root / "import-evidence"), "APP_ENV": "test",
            "CICSIC_ADMIN_TOKEN": ADMIN_TOKEN, "CICSIC_ADMIN_AUTH_ENABLED": "true",
        }))
        # Do not import credentials or local service endpoints from server/.env.
        read_text = Path.read_text

        def isolated_read_text(path, *args, **kwargs):
            if path == SERVER / ".env":
                return ""
            return read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", isolated_read_text):
            cls.events = importlib.import_module("app.api.routes.events")
            cls.security_ai = importlib.import_module("app.api.routes.security_ai")
            cls.security_ops = importlib.import_module("app.services.security_ops")
            cls.linkage = importlib.import_module("app.services.security_linkage")
            cls.database = importlib.import_module("app.services.database")
            cls.models = importlib.import_module("app.services.models")

    def setUp(self):
        from fastapi import FastAPI
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool

        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory(prefix="cicsic-review-case-")))
        self.evidence = self.root / "evidence"
        self.evidence.mkdir()
        self.stack.enter_context(patch.object(self.events, "EVIDENCE_DIR", self.evidence))
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        self.stack.callback(self.engine.dispose)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.models.ServiceAccessKey.__table__.create(self.engine)
        self.control = self.events.system_control
        for module in (self.control, self.events.event_store):
            self.stack.enter_context(patch.object(module, "SessionLocal", self.sessions))
        self.stack.enter_context(patch.object(self.control, "init_database", return_value=None))
        self.stack.enter_context(patch.object(self.events.event_store, "init_db", return_value=None))
        self.stack.enter_context(patch.object(self.control, "_raw_platform_settings", return_value={}))
        self.stack.enter_context(patch.object(
            self.control, "get_platform_settings",
            return_value={"adminAuthEnabled": True, "evidenceUploadLimitMb": 1, "publicWriteRateLimitPerMinute": 120},
        ))
        self.app = FastAPI()
        self.app.include_router(self.events.router, prefix="/api")
        self.app.include_router(self.security_ai.router, prefix="/api")
        self.app.dependency_overrides[self.events.enforce_public_write_rate_limit] = lambda: None
        self.app.dependency_overrides[self.events.optional_actor] = lambda: None
        self.stack.enter_context(patch("socket.create_connection", side_effect=AssertionError("Network forbidden")))

    async def upload(self, content, mime, name="synthetic.bin", event_id=None):
        boundary = "synthetic-review-boundary"
        body = b""
        if event_id:
            body += (
                f'--{boundary}\r\nContent-Disposition: form-data; name="eventId"\r\n\r\n{event_id}\r\n'
            ).encode()
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
        return await request(self.app, "POST", "/api/events/evidence", body=body,
                             headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})

    async def test_rejects_html_svg_unknown_and_mime_spoofing_without_writing(self):
        cases = [
            (b"<html><script>alert(1)</script></html>", "text/html"),
            (b"<svg onload='alert(1)'/>", "image/svg+xml"),
            (b"<html><script>alert(1)</script></html>", "image/png"),
            (b"<html><script>alert(1)</script></html>", "video/mp4"),
            (PNG, "image/jpeg"), (PNG, "application/octet-stream"),
            (b"", "image/png"), (b"\x89PNG\r\n\x1a\n", "image/png"),
            (b"\x00\x00\x00\x18ftypavif\x00\x00\x00\x00avifmif1", "video/mp4"),
            (b"\x1a\x45\xdf\xa3\x8b\x42\x82\x88matroska", "video/webm"),
        ]
        for content, mime in cases:
            with self.subTest(mime=mime, content=content[:20]):
                code, _, _ = await self.upload(content, mime, "synthetic.html")
                self.assertEqual(code, 415)
                self.assertEqual(list(self.evidence.iterdir()), [])

    async def test_citizen_media_upload_uses_canonical_extensions_and_round_trips(self):
        for content, mime, extension in (
            (PNG, "image/png", ".png"), (JPEG, "image/jpeg", ".jpg"),
            (WEBP, "image/webp", ".webp"), (MP4, "video/mp4", ".mp4"),
            (WEBM, "video/webm", ".webm"),
        ):
            with self.subTest(mime=mime):
                code, _, body = await self.upload(content, mime, "../../synthetic.html")
                self.assertEqual(code, 200, body)
                evidence = json.loads(body)["evidence"]
                name = evidence["url"].rsplit("/", 1)[1]
                self.assertRegex(name, rf"^[0-9a-f]{{32}}\{extension}$")
                self.assertEqual(evidence["mimeType"], mime)
                self.assertEqual(evidence["kind"], "video" if mime.startswith("video/") else "image")
                self.assertEqual(evidence["size"], len(content))
                self.assertEqual((self.evidence / name).read_bytes(), content)
                code, headers, downloaded = await request(self.app, "GET", evidence["url"])
                self.assertEqual(code, 200)
                self.assertEqual(downloaded, content)
                self.assertEqual(headers["content-type"], mime)
                self.assertEqual(headers["x-content-type-options"], "nosniff")
                self.assertTrue(headers["content-disposition"].startswith("inline"))
                self.assertIn("sandbox", headers["content-security-policy"])

    async def test_size_limit_is_enforced_and_existing_files_are_unchanged(self):
        old = self.evidence / "legacy.html"
        old.write_bytes(b"synthetic legacy content")
        code, _, _ = await self.upload(PNG + b"x" * (1024 * 1024), "image/png")
        self.assertEqual(code, 413)
        self.assertEqual(old.read_bytes(), b"synthetic legacy content")
        self.assertEqual(list(self.evidence.iterdir()), [old])
        code, _, _ = await self.upload(PNG + b"x" * (1024 * 1024 - len(PNG)), "image/png")
        self.assertEqual(code, 200)

    async def test_filename_collision_never_overwrites_existing_upload(self):
        name = "a" * 32 + ".png"
        target = self.evidence / name
        target.write_bytes(b"synthetic existing evidence")
        with patch.object(self.events, "uuid4", return_value=SimpleNamespace(hex="a" * 32)):
            code, _, _ = await self.upload(PNG, "image/png")
        self.assertEqual(code, 409)
        self.assertEqual(target.read_bytes(), b"synthetic existing evidence")
        self.assertEqual(list(self.evidence.iterdir()), [target])

    async def test_mime_parameters_and_legacy_jpeg_extension_keep_safe_media_type(self):
        code, _, body = await self.upload(PNG, "IMAGE/PNG; charset=binary")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["evidence"]["mimeType"], "image/png")
        (self.evidence / "legacy.JPEG").write_bytes(JPEG)
        code, headers, content = await request(self.app, "GET", "/api/events/evidence/legacy.JPEG")
        self.assertEqual(code, 200)
        self.assertEqual(headers["content-type"], "image/jpeg")
        self.assertEqual(content, JPEG)

    async def test_public_upload_rate_limit_is_still_enforced(self):
        from app.services.rate_limit import public_write_limiter

        self.app.dependency_overrides.pop(self.events.enforce_public_write_rate_limit)
        with patch.object(public_write_limiter, "check", return_value=(False, 7)) as check:
            code, headers, _ = await self.upload(PNG, "image/png")
        self.assertEqual(code, 429)
        self.assertEqual(headers["retry-after"], "7")
        self.assertEqual(list(self.evidence.iterdir()), [])
        check.assert_called_once()

    async def test_legacy_active_or_misnamed_files_are_safe_downloads_without_mutation(self):
        for name, content in (
            ("legacy.html", b"<html><script>alert(1)</script></html>"),
            ("legacy.svg", b"<svg onload='alert(1)'/>"),
            ("spoof.png", b"<html><script>alert(1)</script></html>"),
            ("misnamed.html", PNG),
        ):
            with self.subTest(name=name):
                target = self.evidence / name
                target.write_bytes(content)
                before = target.stat().st_mtime_ns
                code, headers, downloaded = await request(self.app, "GET", "/api/events/evidence/" + name)
                self.assertEqual(code, 200)
                self.assertEqual(downloaded, content)
                self.assertEqual(headers["content-type"], "application/octet-stream")
                self.assertTrue(headers["content-disposition"].startswith("attachment"))
                self.assertEqual(headers["x-content-type-options"], "nosniff")
                self.assertIn("sandbox", headers["content-security-policy"])
                self.assertIn("no-store", headers["cache-control"])
                self.assertEqual(target.read_bytes(), content)
                self.assertEqual(target.stat().st_mtime_ns, before)

    async def test_missing_directory_and_traversal_paths_return_404(self):
        (self.root / "outside.png").write_bytes(PNG)
        (self.evidence / "directory").mkdir()
        for name in ("missing.png", "directory", "../outside.png", "..\\outside.png", "directory:stream"):
            with self.subTest(name=name):
                code, _, _ = await request(self.app, "GET", "/api/events/evidence/" + name)
                self.assertEqual(code, 404)

    async def test_command_upload_resolves_public_actor_and_download_validates_record(self):
        from fastapi import HTTPException

        with patch.object(self.events.command_workflow, "upload_evidence", return_value={}) as upload:
            code, _, _ = await self.upload(PNG, "image/png", event_id="synthetic-command")
            self.assertEqual(code, 200)
            self.assertEqual(upload.call_args.args[1].openid, "open-access")
        for name in ("cmd-synthetic.png", "CMD-SYNTHETIC.png"):
            (self.evidence / name).write_bytes(PNG)
            with patch.object(self.events.command_workflow, "authorize_file",
                              side_effect=HTTPException(404, "denied")) as authorize:
                code, _, _ = await request(self.app, "GET", "/api/events/evidence/" + name)
                self.assertEqual(code, 404)
                authorize.assert_called_once()

    async def test_authorized_command_upload_keeps_existing_service_contract(self):
        actor = object()
        self.app.dependency_overrides[self.events.optional_actor] = lambda: actor
        expected = {"uploadId": "synthetic-command-upload", "mimeType": "image/png"}
        with patch.object(self.events.command_workflow, "upload_evidence", return_value=expected) as upload:
            code, _, body = await self.upload(PNG, "image/png", "synthetic.png", "synthetic-command")
            self.assertEqual(code, 200)
            self.assertEqual(json.loads(body)["evidence"], expected)
            upload.assert_called_once_with("synthetic-command", actor, "synthetic.png", "image/png", PNG)
        self.assertEqual(list(self.evidence.iterdir()), [])
        (self.evidence / "cmd-synthetic.png").write_bytes(PNG)
        with patch.object(self.events.command_workflow, "authorize_file", return_value="image/png") as authorize:
            code, headers, content = await request(self.app, "GET", "/api/events/evidence/cmd-synthetic.png")
            self.assertEqual(code, 200)
            self.assertEqual(content, PNG)
            self.assertEqual(headers["content-type"], "image/png")
            self.assertEqual(headers["cache-control"], "private, no-store")
            authorize.assert_called_once_with("cmd-synthetic.png", actor)

    async def test_archive_route_accepts_missing_invalid_and_unprivileged_tokens(self):
        for headers in ({}, {"X-Admin-Token": "invalid"},
                        {"Authorization": "Bearer synthetic-ordinary-user"}):
            with self.subTest(headers=headers), patch.object(
                self.security_ops, "compare_identity_archive", return_value=[PROFILE],
            ) as compare:
                code, _, body = await request(
                    self.app, "POST", "/api/security-ai/face-match",
                    body=b'{"query":"synthetic"}', headers={"Content-Type": "application/json", **headers},
                )
                self.assertEqual(code, 200)
                self.assertEqual(json.loads(body)["items"], [PROFILE])
                compare.assert_called_once()

    async def test_archive_route_preserves_existing_authorized_lookup(self):
        with patch.object(self.security_ops, "compare_identity_archive", return_value=[PROFILE]) as compare:
            code, _, body = await request(
                self.app, "POST", "/api/security-ai/face-match",
                body=b'{"query":"synthetic"}',
                headers={"Content-Type": "application/json", "X-Admin-Token": ADMIN_TOKEN},
            )
            self.assertEqual(code, 200)
            self.assertEqual(json.loads(body)["items"], [PROFILE])
            compare.assert_called_once_with("synthetic", face_fingerprint=None, image_base64=None)

    async def test_public_overview_omits_archive_rows_without_mutating_summary(self):
        summary = {"identity": {"profiles": 1, "tracks": 0, "locks": 0, "items": [PROFILE]},
                   "identityProfiles": [PROFILE], "skills": [], "agents": []}
        with ExitStack() as stack:
            for name in ("list_events", "list_staff", "list_alarm_pushes", "list_night_markets"):
                stack.enter_context(patch.object(self.events.event_store, name, return_value=[]))
            stack.enter_context(patch.object(self.events.event_store, "_average_response_minutes", return_value=None))
            stack.enter_context(patch.object(self.events.event_store, "status_summary",
                                            return_value={"configured": False, "detections": {"total": 0}}))
            stack.enter_context(patch.object(self.security_ops, "summary", return_value=summary))
            stack.enter_context(patch.object(self.linkage, "overview", return_value={}))
            code, _, body = await request(self.app, "GET", "/api/events/overview")
            self.assertEqual(code, 200)
            overview = json.loads(body)
            self.assertEqual(overview["security_ops"]["identity"]["profiles"], 1)
            self.assertFalse(overview["security_ops"]["identity"].get("items"))
            self.assertNotIn("identityProfiles", overview["security_ops"])
            for value in PROFILE.values():
                self.assertNotIn(value.encode(), body)
            self.assertEqual(summary["identity"]["items"], [PROFILE])
            self.assertEqual(summary["identityProfiles"], [PROFILE])

    def make_key(self, expires_at, status="active", scopes=None):
        secret = "synthetic-access-key"
        row = self.models.ServiceAccessKey(
            keyId="synthetic-key", name="Synthetic", keyPrefix="synthetic",
            keyHash=self.control._hash_access_key(secret), scopes_json=scopes or ["source:ingest"],
            status=status, expiresAt=expires_at, lastUsedAt=None,
            createdAt="2026-01-01", updatedAt="2026-01-01",
        )
        with self.sessions() as session:
            session.query(self.models.ServiceAccessKey).delete()
            session.add(row)
            session.commit()
        return secret

    def test_expiry_accepts_future_offsets_z_and_legacy_local_naive_dates(self):
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=2)
        dates = [
            future.isoformat(), future.isoformat().replace("+00:00", "Z"),
            future.astimezone(timezone(timedelta(hours=8))).isoformat(),
            future.astimezone(timezone(timedelta(hours=-7))).isoformat(),
            (datetime.now() + timedelta(days=2)).isoformat(), None,
        ]
        for expires_at in dates:
            with self.subTest(expires_at=expires_at):
                secret = self.make_key(expires_at)
                self.assertTrue(self.control.verify_access_key(secret, "source:ingest"))
                with self.sessions() as session:
                    self.assertIsNotNone(session.get(self.models.ServiceAccessKey, "synthetic-key").lastUsedAt)

    def test_expiry_rejects_expired_invalid_revoked_and_wrong_scope_without_usage_update(self):
        past = datetime.now(timezone.utc) - timedelta(days=2)
        for expires_at in (
            past.isoformat(), past.isoformat().replace("+00:00", "Z"),
            past.astimezone(timezone(timedelta(hours=8))).isoformat(),
            past.astimezone(timezone(timedelta(hours=-7))).isoformat(),
            (datetime.now() - timedelta(days=2)).isoformat(), "not-a-date",
        ):
            with self.subTest(expires_at=expires_at):
                secret = self.make_key(expires_at)
                self.assertFalse(self.control.verify_access_key(secret, "source:ingest"))
                with self.sessions() as session:
                    self.assertIsNone(session.get(self.models.ServiceAccessKey, "synthetic-key").lastUsedAt)
        self.assertFalse(self.control.verify_access_key(self.make_key(None, status="revoked"), "source:ingest"))
        self.assertFalse(self.control.verify_access_key(self.make_key(None), "unknown:scope"))

    def test_expiry_exact_boundary_compares_instants_and_preserves_local_naive_time(self):
        fixed = datetime(2026, 9, 9, 12, 0, tzinfo=timezone(timedelta(hours=8)))

        class FixedDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return fixed.astimezone(tz) if tz else fixed.replace(tzinfo=None)

        with patch.object(self.control, "datetime", FixedDatetime):
            for offset in (None, 0, 8, -7):
                for seconds in (-1, 0, 1):
                    if offset is None:
                        expires_at = fixed.replace(tzinfo=None)
                    else:
                        expires_at = fixed.astimezone(timezone(timedelta(hours=offset)))
                    value = (expires_at + timedelta(seconds=seconds)).isoformat()
                    with self.subTest(expires_at=value):
                        secret = self.make_key(value)
                        self.assertEqual(self.control.verify_access_key(secret, "source:ingest"), seconds > 0)


if __name__ == "__main__":
    unittest.main()
