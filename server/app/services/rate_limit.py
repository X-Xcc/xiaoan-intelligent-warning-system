from __future__ import annotations

from collections import defaultdict, deque
from threading import RLock
from time import monotonic


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = RLock()

    def check(self, key: str, limit: int, window_seconds: float) -> tuple[bool, int]:
        now = monotonic()
        with self._lock:
            bucket = self._buckets[key]
            while bucket and bucket[0] <= now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])) + 1)
                return False, retry_after
            bucket.append(now)
            return True, 0


public_write_limiter = SlidingWindowRateLimiter()
