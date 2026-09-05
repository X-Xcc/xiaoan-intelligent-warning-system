from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.services.security_video import SecurityVideoUnavailable, camera_items, open_video_stream, video_status


router = APIRouter(prefix="/security-video", tags=["security-video"])


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

    def iterator():
        try:
            while True:
                chunk = upstream.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            upstream.close()

    return StreamingResponse(iterator(), media_type=content_type)
