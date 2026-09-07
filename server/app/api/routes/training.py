"""Readiness-training pilot endpoints for the A1/A2/A3 demonstration flow."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.services import training_pilot


router = APIRouter(prefix="/training", tags=["training"])


class CompleteTaskInput(BaseModel):
    elapsedSeconds: int = Field(ge=0, le=3600)


class ReviewAssessmentInput(BaseModel):
    decision: Literal["confirmed", "revised", "rejected"]
    reason: str = Field(min_length=1, max_length=500)
    reviewerId: str = Field(min_length=1, max_length=80)

    @field_validator("reason", "reviewerId")
    @classmethod
    def require_nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("复核原因和复核人不能为空")
        return value


class TrainingExceptionInput(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    reportedBy: str = Field(min_length=1, max_length=80)

    @field_validator("reason", "reportedBy")
    @classmethod
    def require_nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("异常原因和上报人不能为空")
        return value


@router.get("/readiness")
def readiness() -> dict:
    return training_pilot.readiness_snapshot()


@router.get("/tasks")
def tasks() -> dict:
    return {"dataMode": training_pilot.DATA_MODE, "items": training_pilot.list_tasks()}


@router.post("/tasks/{task_id}/start")
def start(task_id: str) -> dict:
    try:
        task = training_pilot.start_task(task_id)
    except training_pilot.TrainingStateError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if task is None:
        raise HTTPException(status_code=404, detail="训练任务不存在")
    return {"task": task}


@router.post("/tasks/{task_id}/complete")
def complete(task_id: str, payload: CompleteTaskInput) -> dict:
    try:
        task = training_pilot.complete_task(task_id, payload.elapsedSeconds)
    except training_pilot.TrainingStateError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if task is None:
        raise HTTPException(status_code=404, detail="训练任务不存在")
    return {"task": task}


@router.post("/tasks/{task_id}/exception")
def report_exception(task_id: str, payload: TrainingExceptionInput) -> dict:
    try:
        task = training_pilot.register_exception(task_id, payload.reason, payload.reportedBy)
    except training_pilot.TrainingStateError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if task is None:
        raise HTTPException(status_code=404, detail="训练任务不存在")
    return {"task": task}


@router.get("/assessments")
def assessments() -> dict:
    return {"dataMode": training_pilot.DATA_MODE, "items": training_pilot.list_assessments()}


@router.get("/tasks/{task_id}/assessment")
def task_assessment(task_id: str) -> dict:
    assessment = training_pilot.get_assessment(task_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="评分记录不存在")
    return {"assessment": assessment}


@router.post("/tasks/{task_id}/assessment")
def assess(task_id: str) -> dict:
    try:
        assessment = training_pilot.create_assessment(task_id)
    except training_pilot.TrainingStateError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if assessment is None:
        raise HTTPException(status_code=404, detail="训练任务不存在")
    return {"assessment": assessment}


@router.post("/tasks/{task_id}/retry")
def retry(task_id: str) -> dict:
    try:
        task = training_pilot.create_retry_task(task_id)
    except training_pilot.TrainingStateError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if task is None:
        raise HTTPException(status_code=404, detail="原训练任务或评分记录不存在")
    return {"task": task}


@router.post("/assessments/{assessment_id}/review")
def review(assessment_id: str, payload: ReviewAssessmentInput) -> dict:
    try:
        assessment = training_pilot.review_assessment(assessment_id, payload.decision, payload.reason, payload.reviewerId)
    except training_pilot.TrainingStateError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if assessment is None:
        raise HTTPException(status_code=404, detail="评分记录不存在")
    return {"assessment": assessment}


@router.get("/archives")
def archives() -> dict:
    return {"dataMode": training_pilot.DATA_MODE, "items": training_pilot.list_archives()}


@router.post("/archives/{record_id}/retraining")
def create_retraining(record_id: str) -> dict:
    try:
        task = training_pilot.create_retraining_task(record_id)
    except training_pilot.TrainingStateError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if task is None:
        raise HTTPException(status_code=404, detail="训练档案不存在")
    return {"task": task}
