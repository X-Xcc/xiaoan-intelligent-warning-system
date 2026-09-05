"""窗口 02：AI 智能中枢运行态与结果责任链契约验证。"""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
if str(SERVER) not in sys.path:
    sys.path.insert(0, str(SERVER))

from app.services.ai_runtime import (  # noqa: E402
    normalize_ai_result,
    review_result,
    runtime_snapshot,
)
from app.api.routes.ai_center import ReviewIn  # noqa: E402
from pydantic import ValidationError  # noqa: E402


def _assert_result_contract(result: dict[str, object]) -> None:
    required = {
        "result",
        "confidence",
        "evidence",
        "evidenceTime",
        "explanation",
        "humanReviewRequired",
        "reviewStatus",
        "fallbackAction",
        "auditId",
    }
    assert required <= set(result), result
    assert 0 <= int(result["confidence"]) <= 100
    assert str(result["auditId"]).startswith("ai-")
    assert result["fallbackAction"] != "自动执行"


def main() -> None:
    assert "operatorId" not in ReviewIn.model_fields
    review_request = ReviewIn(
        auditId="ai-contract-test",
        decision="confirmed",
        reason="人工核验",
    )
    assert review_request.auditId == "ai-contract-test"
    try:
        ReviewIn(
            auditId="ai-contract-test",
            decision="confirmed",
            reason="人工核验",
            operatorId="forged-operator",
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("review request must reject a client-supplied operatorId")

    from app.services import auth_store
    from app.api.routes import ai_center
    from fastapi import HTTPException

    try:
        ai_center.review(review_request, authorization=None)
    except HTTPException as exc:
        assert exc.status_code == 401
    else:
        raise AssertionError("review without Bearer token must return 401")

    original_lookup = auth_store.get_user_by_token
    auth_store.get_user_by_token = lambda token: {
        "openid": "token-user-001",
        "permissions": ["review"],
    }
    try:
        assert "operatorId" not in ai_center.ReviewIn.model_fields
    finally:
        auth_store.get_user_by_token = original_lookup

    role_defaults = auth_store.ROLE_DEFAULTS
    for role in ("巡防", "指挥员", "管理员"):
        assert "review" in role_defaults[role]["permissions"]
    assert "review" not in role_defaults["群众"]["permissions"]

    page = (ROOT / "apps" / "dashboard" / "src" / "pages" / "PoliceDomainPages.tsx").read_text(encoding="utf-8")
    for token in [
        "/ai-center/runtime",
        "/ai-center/review",
        "AI 结果责任链",
        "人工确认",
        "驳回并回退",
        "auditId",
        "writeAllowed",
        "Bearer",
        "operatorId 不由前端传入",
    ]:
        assert token in page, f"AI center page is missing: {token}"

    runtime = runtime_snapshot()
    assert runtime["model"] == {
        "name": "国产大模型（内网部署）",
        "status": "可用",
        "providers": ["DeepSeek", "Qwen3"],
    }
    assert [item["name"] for item in runtime["capabilities"]] == [
        "文本理解与生成",
        "语音转写与结构化",
        "视觉与动作识别",
        "知识库与类案检索",
    ]
    assert [item["name"] for item in runtime["agents"]] == [
        "接处警协同 Agent",
        "执法办案助手 Agent",
        "勤务训练教官 Agent",
        "移动勤务伴随 Agent",
    ]
    assert [item["name"] for item in runtime["skills"]] == [
        "警情结构化抽取",
        "证据规则校验",
        "训练短板画像",
        "移动现场指引",
    ]
    for connector in runtime["mcpConnectors"]:
        assert {"name", "status", "scope", "lastSync"} <= set(connector)
        assert connector["writeAllowed"] is False

    high_risk = normalize_ai_result(
        {
            "result": "建议由指挥席核验后决定是否派警。",
            "confidence": 87,
            "evidence": ["警情摘要", "最近一次同步：2026-09-05T09:00:00Z"],
            "explanation": "存在人员受伤线索，需要人工核验。",
        },
        risk_level="high",
    )
    _assert_result_contract(high_risk)
    assert high_risk["humanReviewRequired"] is True
    assert high_risk["reviewStatus"] == "pending"
    assert "业务状态" not in high_risk

    try:
        normalize_ai_result({"result": "越界置信度", "confidence": 101})
    except ValueError as exc:
        assert "confidence" in str(exc)
    else:
        raise AssertionError("confidence > 100 must be rejected")

    for failure_code, expected in [
        ("model_unavailable", "模型服务暂不可用"),
        ("knowledge_timeout", "知识库检索超时"),
        ("mcp_permission_denied", "MCP 连接器权限不足"),
    ]:
        fallback = normalize_ai_result(None, failure_code=failure_code)
        _assert_result_contract(fallback)
        assert fallback["humanReviewRequired"] is True
        assert fallback["reviewStatus"] == "pending"
        assert expected in str(fallback["result"])
        assert "人工" in str(fallback["fallbackAction"])

    reviewed = review_result(
        audit_id=str(high_risk["auditId"]),
        decision="rejected",
        operator_id="police-001",
        reason="人工核验后不采纳该建议",
    )
    assert reviewed["reviewStatus"] == "rejected"
    assert reviewed["humanReviewRequired"] is True
    assert reviewed["review"]["operatorId"] == "police-001"
    assert reviewed["review"]["reason"] == "人工核验后不采纳该建议"
    assert "人工" in str(reviewed["fallbackAction"])

    print("ai runtime contract verification passed")


if __name__ == "__main__":
    main()
