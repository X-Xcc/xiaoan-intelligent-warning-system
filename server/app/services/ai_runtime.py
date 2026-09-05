"""统一 AI 能力运行态、结果责任链与人工复核记录。"""

from __future__ import annotations

from datetime import datetime, timezone
from threading import RLock
from typing import Any, Mapping
from uuid import uuid4


_LOCK = RLock()
_RESULTS: dict[str, dict[str, Any]] = {}
_RUNTIME_SAMPLE_AUDIT_ID: str | None = None

_FAILURE_MESSAGES = {
    "model_unavailable": "模型服务暂不可用，已转入人工处理",
    "knowledge_timeout": "知识库检索超时，已转入人工处理",
    "mcp_permission_denied": "MCP 连接器权限不足，已转入人工处理",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audit_id() -> str:
    return f"ai-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{uuid4().hex[:8]}"


def runtime_snapshot() -> dict[str, Any]:
    """返回不依赖具体供应商名称的 AI 能力目录。"""

    snapshot = {
        "model": {
            "name": "国产大模型（内网部署）",
            "status": "可用",
            "providers": ["DeepSeek", "Qwen3"],
        },
        "capabilities": [
            {"name": "文本理解与生成", "scope": "警单、卷宗、制度、报告", "status": "可用"},
            {"name": "语音转写与结构化", "scope": "接警、问询、移动勤务", "status": "待接入"},
            {"name": "视觉与动作识别", "scope": "训练动作、目标复核", "status": "按权限启用"},
            {"name": "知识库与类案检索", "scope": "法条、判例、内部制度", "status": "待接入"},
        ],
        "agents": [
            {"name": "接处警协同 Agent", "status": "active", "currentTask": "摘要、问询提示、分类分级建议", "latency": "实时"},
            {"name": "执法办案助手 Agent", "status": "active", "currentTask": "法律条文、证据清单、文书检查", "latency": "实时"},
            {"name": "勤务训练教官 Agent", "status": "active", "currentTask": "模拟评分、动作识别、短板画像", "latency": "实时"},
            {"name": "移动勤务伴随 Agent", "status": "active", "currentTask": "身份核验提示、现场指引、结果回传", "latency": "实时"},
        ],
        "skills": [
            {"name": "警情结构化抽取", "status": "active", "trigger": "接警语音进入", "confidence": 96},
            {"name": "证据规则校验", "status": "active", "trigger": "案件提交前", "confidence": 92},
            {"name": "训练短板画像", "status": "active", "trigger": "训练结束后", "confidence": 88},
            {"name": "移动现场指引", "status": "active", "trigger": "民警签收现场任务后", "confidence": 90},
        ],
        "mcpConnectors": [
            {"name": "公安主数据目录 MCP", "status": "在线", "scope": "组织 / 人员 / 地点 / 车辆（只读）", "lastSync": "刚刚", "writeAllowed": False},
            {"name": "法律与类案知识库 MCP", "status": "在线", "scope": "法条 / 判例 / 内部制度（只读）", "lastSync": "刚刚", "writeAllowed": False},
            {"name": "统一事件链 MCP", "status": "在线", "scope": "警情 / 案件 / 训练 / 移动（只读）", "lastSync": "刚刚", "writeAllowed": False},
        ],
    }
    snapshot["sampleResult"] = _runtime_sample_result()
    return snapshot


def normalize_ai_result(
    payload: Mapping[str, Any] | None,
    *,
    risk_level: str = "normal",
    failure_code: str | None = None,
) -> dict[str, Any]:
    """把任意模型输出包装成统一、可审计且可回退的结果。"""

    if payload is None:
        message = _FAILURE_MESSAGES.get(failure_code or "", "暂无可用 AI 结果，已转入人工处理")
        payload = {
            "result": message,
            "confidence": 0,
            "evidence": [],
            "evidenceTime": _now(),
            "explanation": "自动能力不可用，需由人工完成核验。",
        }

    try:
        confidence = float(payload.get("confidence", 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("confidence must be a number between 0 and 100") from exc
    if not 0 <= confidence <= 100:
        raise ValueError("confidence must be between 0 and 100")

    evidence = payload.get("evidence") or []
    if isinstance(evidence, str):
        evidence = [evidence]
    evidence = [str(item) for item in evidence]
    evidence_time = str(payload.get("evidenceTime") or "") or (_now() if not evidence else None)
    high_risk = str(risk_level).lower() in {"high", "critical", "高", "高风险"} or bool(payload.get("highRisk"))
    human_required = bool(payload.get("humanReviewRequired", False)) or high_risk or failure_code is not None
    review_status = "pending" if human_required else "not_required"
    result = {
        "result": str(payload.get("result") or "暂无可用 AI 结果"),
        "confidence": int(round(confidence)),
        "evidence": evidence,
        "evidenceTime": evidence_time,
        "explanation": str(payload.get("explanation") or ("暂无依据" if not evidence else "模型已返回结构化建议。")),
        "humanReviewRequired": human_required,
        "reviewStatus": review_status,
        "fallbackAction": str(payload.get("fallbackAction") or "转人工处理，不自动改变业务状态"),
        "auditId": _audit_id(),
    }
    with _LOCK:
        _RESULTS[result["auditId"]] = {
            "auditId": result["auditId"],
            "originalResult": dict(result),
            "createdAt": _now(),
            "review": None,
        }
    return result


def review_result(*, audit_id: str, decision: str, operator_id: str, reason: str) -> dict[str, Any]:
    """登记人工决定；不会调用任何业务状态写入接口。"""

    if decision not in {"confirmed", "rejected"}:
        raise ValueError("decision must be confirmed or rejected")
    if not operator_id.strip() or not reason.strip():
        raise ValueError("operatorId and reason are required")
    with _LOCK:
        record = _RESULTS.get(audit_id)
        if record is None:
            raise KeyError(audit_id)
        result = dict(record["originalResult"])
        result["reviewStatus"] = decision
        result["humanReviewRequired"] = True
        if decision == "rejected":
            result["fallbackAction"] = "转人工处理流程，不自动执行"
        review = {
            "operatorId": operator_id,
            "decision": decision,
            "reason": reason,
            "reviewedAt": _now(),
            "originalResult": record["originalResult"],
        }
        record["review"] = review
        record["result"] = result
        return {**result, "review": review}


def get_result(audit_id: str) -> dict[str, Any] | None:
    with _LOCK:
        record = _RESULTS.get(audit_id)
        if record is None:
            return None
        return dict(record.get("result") or record["originalResult"])


def _runtime_sample_result() -> dict[str, Any]:
    """提供可复核的本地演示结果，不连接外部模型或数据源。"""

    global _RUNTIME_SAMPLE_AUDIT_ID
    with _LOCK:
        current_id = _RUNTIME_SAMPLE_AUDIT_ID
    if current_id:
        result = get_result(current_id)
        if result is not None:
            return result
    result = normalize_ai_result(
        {
            "result": "建议由指挥席人工核验警情摘要与风险等级后再作出业务决定。",
            "confidence": 87,
            "evidence": ["警情结构化摘要", "数据时间：本地运行态"],
            "explanation": "高风险建议仅提供研判参考，不直接改变业务状态。",
            "fallbackAction": "转人工处置流程，不自动执行",
        },
        risk_level="high",
    )
    with _LOCK:
        _RUNTIME_SAMPLE_AUDIT_ID = result["auditId"]
    return result
