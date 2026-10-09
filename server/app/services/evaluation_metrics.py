from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.services.database import SessionLocal, init_database
from app.services.models import DroneTask, EventAuditLog, SafetyEvent, SecurityDetection


DEMO_METRICS = {
    "classification": {
        "precision": 0.924,
        "recall": 0.887,
        "f1": 0.905,
        "sampleCount": 1248,
        "labelSource": "人工复核样本 + 事件闭环标签",
    },
    "latency": {"p50Ms": 842, "p95Ms": 1460},
    "operations": {
        "repeatRate": 0.082,
        "dispatchSuccessRate": 0.963,
        "arrivalMinutes": 4.8,
        "locationErrorMeters": 18.6,
        "droneSuccessRate": 0.917,
        "closureRate": 0.91,
    },
}


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                pass
    return None


def _local_dt(value: Any) -> datetime | None:
    parsed = _parse_dt(value)
    if parsed is not None and parsed.tzinfo is None:
        return parsed.astimezone()
    return parsed


def _number(payload: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _percent(value: float) -> float:
    return round(value * 100, 1)


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _iso_date(value: Any) -> str:
    parsed = _parse_dt(value)
    return parsed.date().isoformat() if parsed else str(value or "未知日期")[:10]


def _field_from_payload(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload:
            return payload[key]
    nested = payload.get("evaluation")
    if isinstance(nested, dict):
        for key in keys:
            if key in nested:
                return nested[key]
    return None


def _build_demo_daily() -> list[dict[str, Any]]:
    return [
        {"date": "2026-09-23", "cameras": [{"camera": "北入口-01", "falseAlarms": 5}, {"camera": "主街-03", "falseAlarms": 3}, {"camera": "后巷-02", "falseAlarms": 2}]},
        {"date": "2026-09-24", "cameras": [{"camera": "北入口-01", "falseAlarms": 4}, {"camera": "主街-03", "falseAlarms": 4}, {"camera": "后巷-02", "falseAlarms": 1}]},
        {"date": "2026-09-25", "cameras": [{"camera": "北入口-01", "falseAlarms": 3}, {"camera": "主街-03", "falseAlarms": 2}, {"camera": "后巷-02", "falseAlarms": 2}]},
        {"date": "2026-09-26", "cameras": [{"camera": "北入口-01", "falseAlarms": 5}, {"camera": "主街-03", "falseAlarms": 2}, {"camera": "后巷-02", "falseAlarms": 1}]},
        {"date": "2026-09-27", "cameras": [{"camera": "北入口-01", "falseAlarms": 2}, {"camera": "主街-03", "falseAlarms": 3}, {"camera": "后巷-02", "falseAlarms": 1}]},
        {"date": "2026-09-28", "cameras": [{"camera": "北入口-01", "falseAlarms": 3}, {"camera": "主街-03", "falseAlarms": 2}, {"camera": "后巷-02", "falseAlarms": 1}]},
        {"date": "2026-09-29", "cameras": [{"camera": "北入口-01", "falseAlarms": 2}, {"camera": "主街-03", "falseAlarms": 2}, {"camera": "后巷-02", "falseAlarms": 1}]},
    ]


def _demo_payload() -> dict[str, Any]:
    return {
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "period": {"key": "7d", "label": "近 7 天"},
        "dataStatus": "演示口径",
        "dataNote": "当前库内尚无完整人工复核标签，指标以系统演示样本展示；接入复核标签后自动切换为实时统计。",
        "classification": DEMO_METRICS["classification"],
        "latency": DEMO_METRICS["latency"],
        "operations": DEMO_METRICS["operations"],
        "dailyFalseAlarms": _build_demo_daily(),
    }


def build_evaluation_metrics(period: str = "7d") -> dict[str, Any]:
    """Aggregate evaluation indicators from existing event, detection and linkage tables.

    The current data model stores optional evaluation labels in detection payloads. When
    those labels are absent, the dashboard deliberately returns a clearly marked demo
    snapshot instead of presenting inferred values as production accuracy.
    """
    init_database()
    days = 30 if period == "30d" else 7
    cutoff = datetime.now().astimezone() - timedelta(days=days)
    with SessionLocal() as session:
        detections = session.scalars(select(SecurityDetection).order_by(SecurityDetection.timestamp.asc())).all()
        events = session.scalars(select(SafetyEvent).order_by(SafetyEvent.createdAt.asc())).all()
        audits = session.scalars(select(EventAuditLog).order_by(EventAuditLog.createdAt.asc())).all()
        drone_tasks = session.scalars(select(DroneTask).order_by(DroneTask.createdAt.asc())).all()

    rows = []
    for row in detections:
        timestamp = _local_dt(row.timestamp or row.createdAt)
        if timestamp and timestamp < cutoff:
            continue
        payload = dict(row.payload_json or {})
        rows.append((row, payload, timestamp))

    labels = {"tp": 0, "fp": 0, "fn": 0}
    latency_values: list[float] = []
    false_alarm_by_day_camera: dict[tuple[str, str], int] = defaultdict(int)
    repeated = 0
    for row, payload, timestamp in rows:
        camera = row.cameraName or row.cameraId or row.sourceId or "未命名摄像头"
        for key in labels:
            value = _field_from_payload(payload, key, key.upper())
            if isinstance(value, (int, float)):
                labels[key] += int(value)
        latency = _number(payload, "recognitionLatencyMs", "latencyMs", "inferenceLatencyMs")
        if latency is not None:
            latency_values.append(latency)
        is_false = _field_from_payload(payload, "isFalseAlarm", "falseAlarm", "reviewLabel")
        false_value = is_false is True or str(is_false).lower() in {"true", "false_alarm", "误报"}
        if false_value:
            false_alarm_by_day_camera[(_iso_date(timestamp), camera)] += 1
        repeat_flag = _field_from_payload(payload, "isRepeat", "repeat", "duplicate")
        if repeat_flag is True or str(repeat_flag).lower() in {"true", "duplicate", "重复"}:
            repeated += 1

    has_labels = sum(labels.values()) > 0
    if not has_labels:
        result = _demo_payload()
        result["period"] = {"key": period, "label": "近 30 天" if period == "30d" else "近 7 天"}
        return result

    precision = labels["tp"] / max(1, labels["tp"] + labels["fp"])
    recall = labels["tp"] / max(1, labels["tp"] + labels["fn"])
    f1 = 2 * precision * recall / max(1e-9, precision + recall)
    audit_by_event: dict[str, list[EventAuditLog]] = defaultdict(list)
    for audit in audits:
        audit_by_event[audit.eventId].append(audit)
    arrival_durations: list[float] = []
    successful_dispatches = 0
    closed = 0
    for event in events:
        event_dt = _local_dt(event.createdAt)
        if event_dt and event_dt < cutoff:
            continue
        logs = audit_by_event.get(event.id, [])
        dispatch = next((item for item in logs if item.action in {"派单", "接收"}), None)
        arrival = next((item for item in logs if item.action == "到达" or item.status == "已到达"), None)
        if dispatch:
            successful_dispatches += 1
            # Dispatch success is counted from the first persisted dispatch/receipt audit.
        if arrival and event_dt and (dt := _local_dt(arrival.createdAt)):
            arrival_durations.append(max(0, (dt - event_dt).total_seconds() / 60))
        if event.status == "已完成":
            closed += 1
    total_events = max(1, len([event for event in events if not _local_dt(event.createdAt) or _local_dt(event.createdAt) >= cutoff]))
    drone_total = len([task for task in drone_tasks if not _local_dt(task.createdAt) or _local_dt(task.createdAt) >= cutoff])
    drone_success = len([task for task in drone_tasks if task.status in {"已完成", "成功"} and (not _local_dt(task.createdAt) or _local_dt(task.createdAt) >= cutoff)])
    daily_map: dict[str, dict[str, Any]] = defaultdict(lambda: {"date": "", "cameras": []})
    for (date, camera), count in sorted(false_alarm_by_day_camera.items()):
        daily_map[date]["date"] = date
        daily_map[date]["cameras"].append({"camera": camera, "falseAlarms": count})

    return {
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "period": {"key": period, "label": "近 30 天" if period == "30d" else "近 7 天"},
        "dataStatus": "实时统计",
        "dataNote": f"基于 {sum(labels.values())} 条带人工复核标签的检测样本实时汇总。",
        "classification": {"precision": _percent(precision) / 100, "recall": _percent(recall) / 100, "f1": _percent(f1) / 100, "sampleCount": sum(labels.values()), "labelSource": "检测复核标签"},
        "latency": {"p50Ms": round(_percentile(latency_values, 0.5) or 0), "p95Ms": round(_percentile(latency_values, 0.95) or 0)},
        "operations": {
            "repeatRate": repeated / max(1, len(rows)),
            "dispatchSuccessRate": successful_dispatches / total_events,
            "arrivalMinutes": round(_percentile(arrival_durations, 0.5) or 0, 1),
            "locationErrorMeters": round(sum((_number(dict(row.payload_json or {}), "locationErrorMeters", "positionErrorMeters") or 0) for row, _, _ in rows) / max(1, len(rows)), 1),
            "droneSuccessRate": drone_success / max(1, drone_total),
            "closureRate": closed / total_events,
        },
        "dailyFalseAlarms": [{"date": date, "cameras": item["cameras"]} for date, item in sorted(daily_map.items())],
    }
