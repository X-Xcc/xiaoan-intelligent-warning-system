from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.api.access_control import require_admin_token
from app.api.dependencies import require_source_ingest_key
from app.services import event_store
from app.services.security_ai import SecurityAiUnavailable, judge_scene, review_latest_yolo_detection, review_posted_yolo_detection, vision_model_status
from app.services.security_detection import ACTION_TITLES
from app.services import security_ops


router = APIRouter(prefix="/security-ai", tags=["security-ai"])


class JudgementIn(BaseModel):
    cameraId: str | None = None
    cameraName: str | None = None
    imageUrl: str | None = None
    imageBase64: str | None = None
    imageMimeType: str | None = None
    videoUrl: str | None = None
    detection: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def has_media_or_detection(self):
        if not (self.imageUrl or self.imageBase64 or self.videoUrl or self.detection):
            raise ValueError("请提供图片、视频或检测信息")
        return self


class YoloReviewIn(BaseModel):
    sourceId: str | None = None
    eventKey: str | None = None
    cameraId: str | None = None
    cameraName: str | None = None
    timestamp: str | None = None
    actions: list[str] = Field(default_factory=list)
    personCount: int = 0
    frameCount: int = 0
    fps: float = 0
    imageFilename: str | None = None
    imageUrl: str | None = None
    imageBase64: str | None = None
    imageMimeType: str | None = None
    videoUrl: str | None = None

    @model_validator(mode="after")
    def validate_gathering(self):
        if not any(action in ACTION_TITLES for action in self.actions):
            raise ValueError("actions 里要有已支持的行为动作")
        if not (self.imageBase64 or self.imageUrl or self.videoUrl):
            raise ValueError("YOLO 上报要带截图或视频地址")
        return self


class FaceMatchIn(BaseModel):
    query: str = Field(min_length=1)
    faceFingerprint: str | None = None
    imageBase64: str | None = None


@router.get("/status")
def status():
    return vision_model_status()


@router.post("/judgements")
def create_judgement(payload: JudgementIn):
    try:
        judgement = judge_scene(payload.model_dump())
    except SecurityAiUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"judgement": judgement}


@router.post("/yolo-reviews", dependencies=[Depends(require_source_ingest_key)])
def review_yolo(payload: YoloReviewIn | None = None):
    try:
        result = review_posted_yolo_detection(payload.model_dump(exclude_none=True)) if payload else review_latest_yolo_detection()
    except SecurityAiUnavailable as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    detection = result["detection"]
    event = event_store.ingest_security_detection(detection)
    if not event:
        raise HTTPException(status_code=422, detail="YOLO 上报结果没有生成可入库事件")
    event = event_store.attach_vision_review(event["id"], result["judgement"], "画面复核服务")
    return {**result, "event": event}


@router.post("/face-match", dependencies=[Depends(require_admin_token)])
def face_match(payload: FaceMatchIn):
    return {
        "items": security_ops.compare_identity_archive(
            payload.query,
            face_fingerprint=payload.faceFingerprint,
            image_base64=payload.imageBase64,
        )
    }
