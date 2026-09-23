from __future__ import annotations

from typing import BinaryIO

import anyio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from starlette.types import Receive, Scope, Send

from app.services.security_video import SecurityVideoUnavailable, camera_items, open_video_stream, video_status


router = APIRouter(prefix="/security-video", tags=["security-video"])


class _VideoStreamResponse(StreamingResponse):
    def __init__(self, upstream: BinaryIO, media_type: str):
        self._upstream = upstream
        super().__init__(self._chunks(), media_type=media_type)

    def _chunks(self):
        while True:
            chunk = self._upstream.read(65536)
            if not chunk:
                break
            yield chunk

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            # Starlette waits for in-flight threadpool reads before cleanup.
            with anyio.CancelScope(shield=True):
                await run_in_threadpool(self._upstream.close)


@router.get("/cameras")
def cameras():
    try:
        items = camera_items()
        upstream_online = True
    except SecurityVideoUnavailable:
        status = video_status()
        items = status["cameras"]
        upstream_online = False
    return {"items": items, "upstreamOnline": upstream_online}


@router.get("/status")
def status():
    return video_status()


@router.get("/feed")
def feed(cam: str = "0"):
    try:
        upstream, content_type = open_video_stream(cam)
    except SecurityVideoUnavailable as exc:
        raise HTTPException(status_code=503, detail="视频源现在不可用") from exc

    return _VideoStreamResponse(upstream, media_type=content_type)
