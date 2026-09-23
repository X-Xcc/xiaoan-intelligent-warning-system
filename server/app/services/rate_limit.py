from __future__ import annotations

from collections import defaultdict, deque
from threading import RLock
from time import monotonic


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._expires: dict[str, float] = {}
        self._next_cleanup = 0.0
        self._lock = RLock()

    def check(self, key: str, limit: int, window_seconds: float) -> tuple[bool, int]:
        with self._lock:
            now = monotonic()
            # Amortize cleanup rather than scanning every client on every request.
            if now >= self._next_cleanup:
                expired = [name for name, expiry in self._expires.items() if expiry <= now]
                for name in expired:
                    del self._buckets[name]
                    del self._expires[name]
                self._next_cleanup = now + 60
            bucket = self._buckets[key]
            while bucket and bucket[0] <= now - window_seconds:
                bucket.popleft()
            self._expires[key] = (bucket[-1] if bucket else now) + window_seconds
            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])) + 1)
                return False, retry_after
            bucket.append(now)
            self._expires[key] = now + window_seconds
            return True, 0


public_write_limiter = SlidingWindowRateLimiter()
