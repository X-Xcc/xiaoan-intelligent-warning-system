from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.services import auth_store, system_control
from app.services.ai_runtime import review_result, runtime_snapshot


router = APIRouter(prefix="/ai-center", tags=["ai-center"])


class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    auditId: str = Field(min_length=1)
    decision: str
    reason: str = Field(min_length=1)


@router.get("/runtime")
def get_runtime():
    return runtime_snapshot()


@router.post("/review")
def review(payload: ReviewIn, authorization: str | None = Header(default=None)):
    user = auth_store.open_access_user()
    if payload.decision not in {"confirmed", "rejected"}:
        raise HTTPException(status_code=422, detail="decision must be confirmed or rejected")
    try:
        result = review_result(
            audit_id=payload.auditId,
            decision=payload.decision,
            operator_id=user["openid"],
            reason=payload.reason,
        )
        system_control.record_system_audit(
            user["openid"],
            "ai.result.review",
            "ai-result",
            payload.auditId,
            {"decision": payload.decision},
        )
        return result
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="AI audit result not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
