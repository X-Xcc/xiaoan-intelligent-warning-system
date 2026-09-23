"""Isolated runtime regression tests; no database, devices or services are started."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import services
from app.services import rate_limit, realtime


class RateLimiterTests(unittest.TestCase):
    def test_window_boundary_and_rejected_requests_do_not_extend_the_window(self):
        limiter = rate_limit.SlidingWindowRateLimiter()
        with patch.object(rate_limit, "monotonic", return_value=0):
            self.assertEqual(limiter.check("client", 1, 60), (True, 0))
        with patch.object(rate_limit, "monotonic", return_value=59):
            self.assertEqual(limiter.check("client", 1, 60), (False, 2))
        with patch.object(rate_limit, "monotonic", return_value=60):
            self.assertEqual(limiter.check("client", 1, 60), (True, 0))

    def test_inactive_clients_are_reclaimed_without_revisiting_each_key(self):
        limiter = rate_limit.SlidingWindowRateLimiter()
        with patch.object(rate_limit, "monotonic", return_value=0):
            for index in range(1000):
                limiter.check(f"old-{index}", 2, 60)
        with patch.object(rate_limit, "monotonic", return_value=121):
            limiter.check("new", 2, 60)
        self.assertEqual(set(limiter._buckets), {"new"})

    def test_cleanup_preserves_active_keys_with_different_windows(self):
        limiter = rate_limit.SlidingWindowRateLimiter()
        with patch.object(rate_limit, "monotonic", return_value=0):
            limiter.check("long", 1, 300)
            limiter.check("short", 1, 10)
        with patch.object(rate_limit, "monotonic", return_value=121):
            self.assertEqual(limiter.check("long", 1, 300), (False, 180))
        self.assertNotIn("short", limiter._buckets)
        self.assertIn("long", limiter._buckets)


class Socket:
    def __init__(self, send=None, token=""):
        self.headers = {}
        self.query_params = {"token": token}
        self.messages = []
        self.send = send

    async def accept(self):
        pass

    async def send_text(self, payload):
        if self.send:
            await self.send()
        self.messages.append(json.loads(payload))


class RealtimeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.workflow = SimpleNamespace(
            is_command=Mock(return_value=False),
            actor_for_token=Mock(side_effect=lambda token, **kwargs: token),
            can_read=Mock(side_effect=lambda actor, event: actor == "allowed"),
        )
        self.store = SimpleNamespace(get_event=Mock(return_value={"id": "private"}))
        for name, value in (("command_workflow", self.workflow), ("event_store", self.store)):
            patcher = patch.object(services, name, value, create=True)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.hub = realtime.RealtimeHub()

    async def test_disconnect_during_broadcast_does_not_mutate_iteration(self):
        sockets = [Socket(), Socket()]
        for socket in sockets:
            async def disconnect(current=socket):
                self.hub.disconnect(current)
                await asyncio.sleep(0)
            socket.send = disconnect
            await self.hub.connect(socket)
        await self.hub.publish({"type": "update"})
        self.assertEqual([len(socket.messages) for socket in sockets], [1, 1])
        self.assertFalse(self.hub._connections)

    async def test_slow_client_is_evicted_and_healthy_clients_receive_the_update(self):
        blocked = asyncio.Event()
        slow = Socket(blocked.wait)
        healthy = Socket()
        for socket in (slow, healthy):
            await self.hub.connect(socket)
        with patch.object(realtime, "SEND_TIMEOUT_SECONDS", 0.01, create=True):
            await asyncio.wait_for(self.hub.publish({"type": "update"}), timeout=0.5)
        self.assertEqual(healthy.messages, [{"type": "update"}])
        self.assertNotIn(slow, self.hub._connections)
        self.assertIn(healthy, self.hub._connections)

    async def test_protected_events_keep_per_connection_authorization(self):
        self.workflow.is_command.return_value = True
        allowed, denied = Socket(token="allowed"), Socket(token="denied")
        for socket in (allowed, denied):
            await self.hub.connect(socket)
        message = {"type": "command.updated", "eventId": "private"}
        await self.hub.publish(message)
        self.assertEqual(allowed.messages, [message])
        self.assertEqual(denied.messages, [])
        self.store.get_event.assert_called_once_with("private", include_command=True)

    async def test_no_subscribers_does_not_query_the_database(self):
        self.workflow.is_command.return_value = True
        await self.hub.publish({"type": "command.updated", "eventId": "private"})
        self.workflow.is_command.assert_not_called()
        self.store.get_event.assert_not_called()


if __name__ == "__main__":
    unittest.main()
