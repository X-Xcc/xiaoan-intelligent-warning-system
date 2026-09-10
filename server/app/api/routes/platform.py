"""公安大数据与 AI 平台的只读运行态接口。

该接口把已有事件、人员和智能服务状态整理成公安业务域模型，供统一门户使用。
原有 /events/overview 保留给历史客户端，平台首页不再直接依赖旧业务字段。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.services import event_store


router = APIRouter(prefix="/platform", tags=["platform"])


DATA_DOMAINS = [
    {"key": "org", "label": "组织与警力", "description": "机构、岗位、在岗状态", "objects": ["机构", "民警", "岗位"], "status": "待接入"},
    {"key": "alarm", "label": "警情与指令", "description": "接报、分级、派警、处置回传", "objects": ["警情", "指令", "处置结果"], "status": "待接入"},
    {"key": "case", "label": "案件与证据", "description": "案件、卷宗、证据链", "objects": ["案件", "证据", "文书"], "status": "待接入"},
    {"key": "person", "label": "人员与车辆", "description": "身份核验、车辆和轨迹", "objects": ["人员", "车辆", "轨迹"], "status": "待接入"},
    {"key": "community", "label": "社区与地址", "description": "网格、重点人地事物", "objects": ["网格", "地址", "走访任务"], "status": "待接入"},
    {"key": "training", "label": "训练与健康", "description": "课程、成绩、训练档案", "objects": ["课程", "成绩", "健康指标"], "status": "待接入"},
]


BUSINESS_SYSTEMS = [
    {
        "key": "alarm",
        "name": "接处警系统",
        "shortName": "接处警",
        "description": "接警、询问、分类分级、派警和处置回传",
        "capabilities": ["语音转写", "警单摘要", "分级派警", "警情画像"],
    },
    {
        "key": "case",
        "name": "执法办案系统",
        "shortName": "执法办案",
        "description": "法律依据、取证清单、卷宗审核和类案辅助",
        "capabilities": ["法律助手", "证据校验", "文书生成", "串并分析"],
    },
    {
        "key": "community",
        "name": "社区警务系统",
        "shortName": "社区警务",
        "description": "网格画像、走访任务、隐患闭环和基层治理",
        "capabilities": ["辖区画像", "走访任务", "隐患闭环", "热力研判"],
    },
    {
        "key": "training",
        "name": "勤务训练系统",
        "shortName": "勤务训练",
        "description": "课程编辑、实战模拟、动作识别和一人一档",
        "capabilities": ["AI课程编辑", "AI教官", "训练评估", "体能识别"],
    },
    {
        "key": "mobile",
        "name": "移动勤务系统",
        "shortName": "移动勤务",
        "description": "移动核验、现场指引、任务签收和移动审批",
        "capabilities": ["身份核验", "伴随指引", "移动指令", "AI眼镜"],
    },
]


def _clean_text(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    # 旧数据可能来自历史演示库，平台接口统一使用公安业务称谓。
    return text.replace("夜市", "重点区域").replace("商圈", "重点区域").replace("小安智能预警系统", "公安平台")


def _runtime_snapshot() -> dict[str, Any]:
    source_available = True
    try:
        source = event_store.overview()
    except Exception:
        source_available = False
        source = {"stats": {}, "events": [], "ai_copilot": {}, "security_ops": {}}

    stats = source.get("stats") or {}
    events = source.get("events") or []
    open_events = [item for item in events if item.get("status") != "已完成"]
    completed = [item for item in events if item.get("status") == "已完成"]
    ops = source.get("security_ops") or {}
    agents = (source.get("ai_copilot") or {}).get("agents") or []
    skills = (source.get("ai_copilot") or {}).get("skills") or []

    normalized_events = [
        {
            "id": item.get("id"),
            "title": _clean_text(item.get("title"), "待同步警情"),
            "area": _clean_text(item.get("bay"), "辖区网格"),
            "time": item.get("time") or item.get("updatedAt") or "待同步",
            "status": item.get("status") or "待分派",
            "level": item.get("level") or "待研判",
            "owner": item.get("owner") or "未分派",
        }
        for item in events[:30]
    ]

    online_staff = int(stats.get("online_staff") or 0)
    pending_orders = int(stats.get("pending_orders") or len(open_events))
    today_events = int(stats.get("today_events") or len(events))
    completion_rate = int(stats.get("completion_rate") or (round(len(completed) / len(events) * 100) if events else 0))
    active_risks = int(((source.get("linkage") or {}).get("stats") or {}).get("activeRisks") or stats.get("urgent_events") or 0)
    catalog_objects = sum(len(item["objects"]) for item in DATA_DOMAINS)
    data_catalog_domains = [
        {**domain, "status": "已同步" if source_available else "待同步"}
        for domain in DATA_DOMAINS
    ]

    ai_ready = bool(agents or skills or (source.get("security_model") or {}).get("configured"))
    ai_recommendations = []
    if pending_orders:
        ai_recommendations.append({"title": "优先处理待处置警情", "detail": f"当前有 {pending_orders} 条任务等待责任单位签收。", "priority": "高"})
    if active_risks:
        ai_recommendations.append({"title": "关注重点风险", "detail": f"已识别 {active_risks} 条风险信号，建议联动社区网格复核。", "priority": "中"})
    if not ai_recommendations:
        ai_recommendations.append({"title": "等待业务数据接入", "detail": "接入警情、案件和训练数据后，AI值守建议将在对应工作区生成。", "priority": "提示"})

    ai_copilot = {
        "agents": agents,
        "skills": skills,
        "mcp_connectors": (source.get("ai_copilot") or {}).get("mcp_connectors") or [],
    }
    return {
        "project": "公安大数据与 AI 平台",
        "subtitle": "统一警务数据与智能应用底座",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "organization": {"name": "市公安局", "unit": "指挥中心", "role": "平台管理员"},
        "stats": {
            "today_events": today_events,
            "pending_orders": pending_orders,
            "online_staff": online_staff,
            "urgent_events": int(stats.get("urgent_events") or 0),
            "completion_rate": completion_rate,
            "avg_response_minutes": stats.get("avg_response_minutes"),
            "open_cases": int((ops.get("analysis") or {}).get("total") or 0),
            "community_tasks": int((ops.get("duty") or {}).get("total") or 0),
            "training_records": int((ops.get("identity") or {}).get("profiles") or 0),
        },
        "events": normalized_events,
        # 兼容门户当前的轻量展示字段，同时提供下方的完整平台模型。
        "linkage": {"stats": {"activeRisks": active_risks, "onlineDevices": 0, "droneTasks": 0}, "risks": [], "devices": [], "droneTasks": []},
        "security_model": source.get("security_model") or {"configured": False, "model": {"exists": False}},
        "ai_copilot": ai_copilot,
        "dataCatalog": {
            "domainCount": len(DATA_DOMAINS),
            "objectCount": catalog_objects,
            "syncStatus": "已同步" if source_available else "待同步",
            "domains": data_catalog_domains,
        },
        "businessSystems": [
            {
                **system,
                "status": "运行中" if system["key"] == "alarm" and today_events else "待接入",
                "metric": {
                    "alarm": today_events,
                    "case": int((ops.get("analysis") or {}).get("total") or 0),
                    "community": int((ops.get("duty") or {}).get("total") or 0),
                    "training": int((ops.get("identity") or {}).get("profiles") or 0),
                    "mobile": online_staff,
                }.get(system["key"], 0),
            }
            for system in BUSINESS_SYSTEMS
        ],
        "workspaces": {
            "alarm": {"queue": normalized_events[:8], "pending": pending_orders, "completionRate": completion_rate},
            "case": {"total": int((ops.get("analysis") or {}).get("total") or 0), "review": 0, "evidence": 0, "today": 0},
            "community": {"gridCount": 0, "openTasks": int((ops.get("duty") or {}).get("total") or 0), "riskCount": active_risks, "coverage": 0},
            "training": {"records": int((ops.get("identity") or {}).get("profiles") or 0), "courses": 0, "avgScore": 0, "pending": 0},
            "mobile": {"online": online_staff, "activeTasks": pending_orders, "signed": 0, "alerts": active_risks},
        },
        "aiCenter": {
            "model": {"name": "国产大模型（内网部署）", "status": "可用" if ai_ready else "待接入", "providers": ["DeepSeek", "Qwen3"]},
            "capabilities": [
                {"name": "文本理解与生成", "scope": "警单、卷宗、制度、报告", "status": "可用" if ai_ready else "待接入"},
                {"name": "语音转写与结构化", "scope": "接警、问询、移动勤务", "status": "待接入"},
                {"name": "视觉与动作识别", "scope": "训练动作、目标复核", "status": "按权限启用"},
                {"name": "知识库与类案检索", "scope": "法律条文、案例、内部制度", "status": "待接入"},
            ],
            "agents": agents,
            "skills": skills,
            "mcpConnectors": ai_copilot["mcp_connectors"],
            "recommendations": ai_recommendations,
        },
        "eventChain": [
            {"label": "接警", "count": today_events, "status": "已接入" if today_events else "待业务上报"},
            {"label": "分类分级", "count": today_events, "status": "待业务上报"},
            {"label": "派警", "count": pending_orders, "status": "已接入" if pending_orders else "待业务上报"},
            {"label": "移动签收", "count": 0, "status": "待业务上报"},
            {"label": "案件办理", "count": int((ops.get("analysis") or {}).get("total") or 0), "status": "待业务上报"},
            {"label": "社区闭环", "count": active_risks, "status": "待业务上报"},
            {"label": "训练复盘", "count": int((ops.get("identity") or {}).get("profiles") or 0), "status": "待业务上报"},
        ],
        "governance": {
            "identity": "统一身份与最小权限",
            "audit": "关键操作 100% 留痕",
            "humanReview": "AI建议必须人工确认",
            "security": "公安内网部署，数据分级授权",
        },
    }


@router.get("/overview")
def overview() -> dict[str, Any]:
    return _runtime_snapshot()
