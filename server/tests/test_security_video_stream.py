"""Offline streaming lifecycle tests; no application startup, database or cameras."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import threading
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

import anyio
from fastapi import HTTPException


SERVICE_NAME = "app.services.security_video"
service = ModuleType(SERVICE_NAME)
service.SecurityVideoUnavailable = type("SecurityVideoUnavailable", (RuntimeError,), {})
for name in ("camera_items", "open_video_stream", "video_status"):
    setattr(service, name, Mock(side_effect=AssertionError("Real services forbidden")))
spec = importlib.util.spec_from_file_location(
    "security_video_stream_under_test",
    Path(__file__).resolve().parents[1] / "app/api/routes/security_video.py",
)
route = importlib.util.module_from_spec(spec)
# Stub only the service import, whose dependency chain otherwise loads the DB.
with patch.dict(sys.modules, {SERVICE_NAME: service}):
    spec.loader.exec_module(route)

SCOPE = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"}}
CONTENT_TYPE = "multipart/x-mixed-replace; boundary=frame"


class Upstream:
    def __init__(self, chunks=(), read_error=None):
        self.chunks = iter(chunks)
        self.read_error = read_error
        self.reads = 0
        self.closes = 0

    def read(self, size):
        self.reads += 1
        if self.read_error:
            raise self.read_error
        return next(self.chunks, b"")

    def close(self):
        self.closes += 1


async def wait_forever():
    await asyncio.Event().wait()


async def discard(message):
    pass


class SecurityVideoStreamTests(unittest.IsolatedAsyncioTestCase):
    def response(self, upstream):
        with patch.object(route, "open_video_stream", return_value=(upstream, CONTENT_TYPE)):
            return route.feed("synthetic-camera")

    async def test_disconnect_before_iteration_closes_upstream(self):
        upstream = Upstream([b"frame"])
        response = self.response(upstream)
        started = asyncio.Event()

        async def send(message):
            started.set()
            await wait_forever()

        async def receive():
            await started.wait()
            return {"type": "http.disconnect"}

        await asyncio.wait_for(response(SCOPE, receive, send), 2)
        self.assertEqual(upstream.reads, 0)
        self.assertEqual(upstream.closes, 1)

    async def test_midstream_disconnect_closes_upstream(self):
        upstream = Upstream([b"first", b"second"])
        response = self.response(upstream)
        delivered = asyncio.Event()

        async def send(message):
            if message.get("body"):
                delivered.set()
                await wait_forever()

        async def receive():
            await delivered.wait()
            return {"type": "http.disconnect"}

        await asyncio.wait_for(response(SCOPE, receive, send), 2)
        self.assertEqual(upstream.reads, 1)
        self.assertEqual(upstream.closes, 1)

    async def test_read_failure_closes_upstream_and_propagates(self):
        error = OSError("synthetic read failure")
        upstream = Upstream(read_error=error)
        response = self.response(upstream)
        with self.assertRaises(OSError) as raised:
            await asyncio.wait_for(response(SCOPE, wait_forever, discard), 2)
        self.assertIs(raised.exception, error)
        self.assertEqual(upstream.closes, 1)

    async def test_normal_exhaustion_closes_and_preserves_response(self):
        upstream = Upstream([b"first", b"second"])
        response = self.response(upstream)
        messages = []

        async def send(message):
            messages.append(message)

        await asyncio.wait_for(response(SCOPE, wait_forever, send), 2)
        self.assertEqual(upstream.closes, 1)
        self.assertEqual(messages[0]["status"], 200)
        self.assertEqual(dict(messages[0]["headers"])[b"content-type"], CONTENT_TYPE.encode())
        self.assertEqual([m["body"] for m in messages[1:]], [b"first", b"second", b""])
        self.assertFalse(messages[-1]["more_body"])

    async def test_send_failure_closes_upstream_and_propagates(self):
        upstream = Upstream([b"frame"])
        response = self.response(upstream)
        error = OSError("synthetic send failure")

        async def send(message):
            raise error

        with self.assertRaises(OSError) as raised:
            await asyncio.wait_for(response(SCOPE, wait_forever, send), 2)
        self.assertIs(raised.exception, error)
        self.assertEqual(upstream.closes, 1)

    async def test_cancelled_scope_still_closes_before_iteration(self):
        upstream = Upstream([b"frame"])
        response = self.response(upstream)
        with anyio.CancelScope() as scope:
            async def send(message):
                scope.cancel()
                await anyio.sleep(0)

            await response(SCOPE, wait_forever, send)
        self.assertEqual(upstream.reads, 0)
        self.assertEqual(upstream.closes, 1)

    async def test_task_cancellation_closes_and_propagates(self):
        upstream = Upstream([b"frame"])
        response = self.response(upstream)
        started = asyncio.Event()

        async def send(message):
            started.set()
            await wait_forever()

        task = asyncio.create_task(response(SCOPE, wait_forever, send))
        try:
            await asyncio.wait_for(started.wait(), 2)
        finally:
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 2)
        self.assertEqual(upstream.reads, 0)
        self.assertEqual(upstream.closes, 1)

    async def test_cancelled_read_finishes_before_close_without_orphan_worker(self):
        upstream = Upstream()
        response = self.response(upstream)
        loop = asyncio.get_running_loop()
        started = asyncio.Event()
        release = threading.Event()
        finished = threading.Event()
        scopes = []

        def read(size):
            loop.call_soon_threadsafe(started.set)
            if not release.wait(timeout=2):
                raise AssertionError("Test did not release the synthetic read")
            finished.set()
            return b"frame"

        async def run():
            with anyio.CancelScope() as scope:
                scopes.append(scope)
                await response(SCOPE, wait_forever, discard)

        with patch.object(upstream, "read", side_effect=read):
            task = asyncio.create_task(run())
            try:
                await asyncio.wait_for(started.wait(), 2)
                scopes[0].cancel()
                await asyncio.sleep(0)
                self.assertFalse(task.done())
                self.assertEqual(upstream.closes, 0)
            finally:
                release.set()
                await asyncio.wait_for(task, 2)
        self.assertTrue(finished.is_set())
        self.assertEqual(upstream.closes, 1)

    def test_unavailable_upstream_preserves_503(self):
        error = service.SecurityVideoUnavailable("synthetic unavailable source")
        with patch.object(route, "open_video_stream", side_effect=error) as open_stream:
            with self.assertRaises(HTTPException) as raised:
                route.feed("synthetic-camera")
        open_stream.assert_called_once_with("synthetic-camera")
        self.assertEqual(raised.exception.status_code, 503)
        self.assertIs(raised.exception.__cause__, error)


if __name__ == "__main__":
    unittest.main()
