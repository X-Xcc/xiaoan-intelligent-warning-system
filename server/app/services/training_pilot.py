"""Persisted, desensitized sample workflow for the readiness-training pilot."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import TrainingArchive, TrainingAssessment, TrainingException, TrainingTask


RULE_VERSION = "READINESS-RULE-2026.09-V1"
DATA_MODE = "desensitized_sample"


class TrainingStateError(ValueError):
    """A training mutation conflicts with the persisted workflow state."""


SAMPLE_TASKS = [
    {
        "taskId": "TRAIN-READINESS-001",
        "subject": "单警装备快速取用",
        "traineeId": "OFFICER-017",
        "teamName": "巡逻组 A",
        "equipment": ["执勤腰带", "对讲机", "执法记录仪"],
        "standard": {"label": "30 秒内取用完毕", "thresholdSeconds": 30},
        "basis": ["高峰时段警情响应用时波动", "规则 READINESS-RULE-2026.09-V1"],
    },
    {
        "taskId": "TRAIN-READINESS-002",
        "subject": "弱光队形转换",
        "traineeId": "OFFICER-018",
        "teamName": "巡逻组 A",
        "equipment": ["照明设备", "对讲机", "反光标识"],
        "standard": {"label": "10 秒内完成转换", "thresholdSeconds": 10},
        "basis": ["弱光区域风险占比较高", "规则 READINESS-RULE-2026.09-V1"],
    },
    {
        "taskId": "TRAIN-READINESS-003",
        "subject": "防爆警戒圈设置",
        "traineeId": "OFFICER-019",
        "teamName": "巡逻组 A",
        "equipment": ["警戒带", "反光锥", "扩音器"],
        "standard": {"label": "30 米警戒圈 60 秒内设定", "thresholdSeconds": 60, "targetMeters": 30},
        "basis": ["聚集类风险处置复盘", "规则 READINESS-RULE-2026.09-V1"],
    },
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _task_payload(task: TrainingTask, exception: TrainingException | None = None) -> dict[str, Any]:
    return {
        "taskId": task.taskId,
        "subject": task.subject,
        "traineeId": task.traineeId,
        "teamName": task.teamName,
        "equipment": task.equipment_json,
        "standard": task.standard_json,
        "basis": task.basis_json,
        "status": task.status,
        "elapsedSeconds": task.elapsedSeconds,
        "startedAt": task.startedAt,
        "completedAt": task.completedAt,
        "createdAt": task.createdAt,
        "exception": None if exception is None else {
            "exceptionId": exception.exceptionId,
            "reason": exception.reason,
            "reportedBy": exception.reportedBy,
            "auditId": exception.auditId,
            "createdAt": exception.createdAt,
        },
    }


def _assessment_payload(assessment: TrainingAssessment) -> dict[str, Any]:
    return {
        "assessmentId": assessment.assessmentId,
        "taskId": assessment.taskId,
        "inputMode": assessment.inputMode,
        "score": assessment.score_json,
        "confidence": assessment.confidence,
        "evidence": assessment.evidence_json,
        "evidenceTime": assessment.evidenceTime,
        "ruleVersion": assessment.ruleVersion,
        "humanReviewRequired": assessment.humanReviewRequired,
        "reviewStatus": assessment.reviewStatus,
        "reviewerId": assessment.reviewerId,
        "reviewComment": assessment.reviewComment,
        "auditId": assessment.auditId,
    }


def _ensure_sample_tasks(session: Any) -> None:
    existing = set(session.scalars(select(TrainingTask.taskId)).all())
    now = _now()
    for sample in SAMPLE_TASKS:
        if sample["taskId"] in existing:
            continue
        session.add(TrainingTask(
            taskId=sample["taskId"],
            subject=sample["subject"],
            traineeId=sample["traineeId"],
            teamName=sample["teamName"],
            equipment_json=sample["equipment"],
            standard_json=sample["standard"],
            basis_json=sample["basis"],
            status="待训练",
            createdAt=now,
            updatedAt=now,
        ))
    session.commit()


def readiness_snapshot() -> dict[str, Any]:
    return {
        "dataMode": DATA_MODE,
        "updatedAt": _now(),
        "ruleVersion": RULE_VERSION,
        "riskComposition": [
            {"label": "处置响应", "value": 42, "tone": "high"},
            {"label": "弱光协同", "value": 31, "tone": "medium"},
            {"label": "聚集防护", "value": 27, "tone": "medium"},
        ],
        "heatZones": [
            {"name": "站前重点区域", "level": "高", "basis": "脱敏样例警情聚合"},
            {"name": "东侧弱光通道", "level": "中", "basis": "脱敏巡查记录"},
        ],
        "timeTrend": [
            {"time": "18:00", "value": 18},
            {"time": "20:00", "value": 37},
            {"time": "22:00", "value": 51},
            {"time": "00:00", "value": 29},
        ],
        "recommendations": [
            {"subject": item["subject"], "taskId": item["taskId"], "basis": item["basis"], "standard": item["standard"]}
            for item in SAMPLE_TASKS
        ],
        "dutySituation": {
            "title": "A1 勤务态势大屏",
            "location": "绳金塔夜市",
            "period": "今晚 18:00–01:00",
            "composition": [
                {"label": "滋事纠纷", "value": 41, "color": "#e5ad45"},
                {"label": "手机扒窃", "value": 28, "color": "#38b2ac"},
                {"label": "其他", "value": 27, "color": "#87949b"},
                {"label": "可疑物品", "value": 4, "color": "#dc3545"},
            ],
            "timeTrend": [
                {"time": "18:00", "value": 18},
                {"time": "19:00", "value": 26},
                {"time": "20:00", "value": 44},
                {"time": "21:00", "value": 58},
                {"time": "22:00", "value": 63},
                {"time": "23:00", "value": 49},
                {"time": "00:00", "value": 29},
                {"time": "01:00", "value": 16},
            ],
            "zones": [
                {"id": "A", "name": "夜市入口", "level": "medium", "share": 24,
                 "x": 40, "y": 88, "description": "脱敏样例：入口人流汇入示意，非实时监测。"},
                {"id": "B", "name": "烧烤摊聚集区", "level": "high", "share": 46,
                 "x": 51, "y": 78, "description": "脱敏样例：深红主热区，聚集与纠纷风险展示，非实时警情。"},
                {"id": "C", "name": "后巷摊位区", "level": "medium", "share": 20,
                 "x": 54, "y": 84, "description": "脱敏样例：后巷弱光区域示意，非实时监测。"},
                {"id": "D", "name": "亲子餐饮区", "level": "low", "share": 10,
                 "x": 47, "y": 69, "description": "脱敏样例：餐饮区分布示意，非实时监测。"},
            ],
            "recommendations": [
                {
                    "taskId": item["taskId"],
                    "subject": subject,
                    "basis": f"脱敏样例演示：{item['basis'][0]}；演示阈值，非生产训练或执法规范。",
                    "standard": item["standard"]["label"],
                }
                for item, subject in zip(SAMPLE_TASKS, ("单警装备训练", "弱光执法战术训练", "防爆先期处置"))
            ],
        },
        "notice": "当前为脱敏样例态势与确定性规则演示，不代表生产警情或模型实时判断；占比、时段、区域及训练阈值均为样例，不构成训练或执法规范。",
    }


def list_tasks() -> list[dict[str, Any]]:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        _ensure_sample_tasks(session)
        rows = session.scalars(select(TrainingTask).order_by(TrainingTask.taskId.asc())).all()
        exceptions = {
            item.taskId: item
            for item in session.scalars(select(TrainingException)).all()
        }
        return [_task_payload(task, exceptions.get(task.taskId)) for task in rows]


def start_task(task_id: str) -> dict[str, Any] | None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        _ensure_sample_tasks(session)
        task = session.get(TrainingTask, task_id)
        if task is None:
            return None
        if task.status in {"待复核", "已归档"}:
            source_assessment = session.scalar(select(TrainingAssessment).where(TrainingAssessment.taskId == task_id))
            if source_assessment is None or task.completedAt is None:
                raise TrainingStateError("任务完成并生成评分后才能复测")
            prefix = f"{task_id}-RETEST-"
            existing_ids = set(session.scalars(select(TrainingTask.taskId).where(TrainingTask.taskId.startswith(prefix))).all())
            attempt = 1
            retry_task_id = f"{prefix}{attempt:02d}"
            while retry_task_id in existing_ids:
                attempt += 1
                retry_task_id = f"{prefix}{attempt:02d}"
            now = _now()
            task = TrainingTask(
                taskId=retry_task_id,
                subject=task.subject,
                traineeId=task.traineeId,
                teamName=task.teamName,
                equipment_json=task.equipment_json,
                standard_json=task.standard_json,
                basis_json=[*task.basis_json, f"复测来源：{task_id}", f"前次评分审计：{source_assessment.auditId}"],
                status="训练中",
                startedAt=now,
                createdAt=now,
                updatedAt=now,
            )
            session.add(task)
            session.commit()
            return _task_payload(task)
        if task.status == "训练中":
            return _task_payload(task)
        if task.status != "待训练":
            raise TrainingStateError("仅待训练任务可以开始，请为待复训任务创建复测")
        task.status = "训练中"
        task.startedAt = _now()
        task.updatedAt = task.startedAt
        session.commit()
        return _task_payload(task)


def complete_task(task_id: str, elapsed_seconds: int) -> dict[str, Any] | None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        _ensure_sample_tasks(session)
        task = session.get(TrainingTask, task_id)
        if task is None:
            return None
        if task.completedAt is not None:
            if task.elapsedSeconds == elapsed_seconds:
                return _task_payload(task)
            raise TrainingStateError("训练已完成，不能修改完成用时")
        if task.status != "训练中":
            raise TrainingStateError("仅训练中的任务可以完成")
        now = _now()
        task.status = "待复核"
        task.startedAt = task.startedAt or now
        task.completedAt = now
        task.elapsedSeconds = elapsed_seconds
        task.updatedAt = now
        session.commit()
        return _task_payload(task)


def register_exception(task_id: str, reason: str, reported_by: str) -> dict[str, Any] | None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        _ensure_sample_tasks(session)
        task = session.get(TrainingTask, task_id)
        if task is None:
            return None
        if not reason.strip() or not reported_by.strip():
            raise TrainingStateError("异常原因和上报人不能为空")
        exception = session.scalar(select(TrainingException).where(TrainingException.taskId == task_id))
        now = _now()
        if exception is None:
            exception = TrainingException(
                exceptionId=f"EXCEPTION-{task_id}",
                taskId=task_id,
                reason=reason,
                reportedBy=reported_by,
                auditId=f"AUDIT-EXCEPTION-{task_id}",
                createdAt=now,
            )
            session.add(exception)
        else:
            exception.reason = reason
            exception.reportedBy = reported_by
            exception.createdAt = now
        task.updatedAt = now
        session.commit()
        return _task_payload(task, exception)


def list_assessments() -> list[dict[str, Any]]:
    """Read persisted results without seeding tasks or generating assessments."""
    init_database()
    with DB_LOCK, SessionLocal() as session:
        rows = session.scalars(
            select(TrainingAssessment).order_by(TrainingAssessment.createdAt.desc(), TrainingAssessment.taskId.asc())
        ).all()
        return [_assessment_payload(row) for row in rows]


def get_assessment(task_id: str) -> dict[str, Any] | None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        assessment = session.scalar(select(TrainingAssessment).where(TrainingAssessment.taskId == task_id))
        return None if assessment is None else _assessment_payload(assessment)


def create_assessment(task_id: str) -> dict[str, Any] | None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        _ensure_sample_tasks(session)
        task = session.get(TrainingTask, task_id)
        if task is None:
            return None
        existing = session.scalar(select(TrainingAssessment).where(TrainingAssessment.taskId == task_id))
        if existing is not None:
            return _assessment_payload(existing)
        if task.status != "待复核" or task.completedAt is None or task.elapsedSeconds is None:
            raise TrainingStateError("训练完成后才能生成评分")
        elapsed = task.elapsedSeconds
        threshold = int(task.standard_json.get("thresholdSeconds", 30))
        time_score = max(0, min(100, 100 - max(0, elapsed - threshold) * 5))
        standardization = 92 if elapsed <= threshold else 84
        coordination = 88 if elapsed <= threshold else 78
        total = round(standardization * 0.4 + time_score * 0.35 + coordination * 0.25)
        now = _now()
        assessment = TrainingAssessment(
            assessmentId=f"ASSESS-{task_id}",
            taskId=task_id,
            inputMode="pre_recorded_desensitized_sample",
            score_json={"standardization": standardization, "completionTime": time_score, "coordination": coordination, "total": total},
            confidence=0.86,
            evidence_json=["sample://readiness-training/pre-recorded-segment", f"elapsedSeconds:{elapsed}", f"thresholdSeconds:{threshold}"],
            evidenceTime=now,
            ruleVersion=RULE_VERSION,
            humanReviewRequired=True,
            reviewStatus="pending",
            auditId=f"AUDIT-READINESS-{task_id}",
            createdAt=now,
        )
        session.add(assessment)
        session.commit()
        return _assessment_payload(assessment)


def create_retry_task(task_id: str) -> dict[str, Any] | None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        _ensure_sample_tasks(session)
        source_task = session.get(TrainingTask, task_id)
        if source_task is None:
            return None
        if source_task.status not in {"待复核", "已归档", "待复训"} or source_task.completedAt is None:
            raise TrainingStateError("训练完成后才能创建复测")
        source_assessment = session.scalar(select(TrainingAssessment).where(TrainingAssessment.taskId == task_id))
        if source_assessment is None:
            return None

        prefix = f"{task_id}-RETEST-"
        existing_ids = set(session.scalars(select(TrainingTask.taskId).where(TrainingTask.taskId.startswith(prefix))).all())
        attempt = 1
        retry_task_id = f"{prefix}{attempt:02d}"
        while retry_task_id in existing_ids:
            attempt += 1
            retry_task_id = f"{prefix}{attempt:02d}"

        now = _now()
        retry_task = TrainingTask(
            taskId=retry_task_id,
            subject=source_task.subject,
            traineeId=source_task.traineeId,
            teamName=source_task.teamName,
            equipment_json=source_task.equipment_json,
            standard_json=source_task.standard_json,
            basis_json=[*source_task.basis_json, f"复测来源：{task_id}", f"前次评分审计：{source_assessment.auditId}"],
            status="待训练",
            createdAt=now,
            updatedAt=now,
        )
        session.add(retry_task)
        session.commit()
        return _task_payload(retry_task)


def review_assessment(assessment_id: str, decision: str, reason: str, reviewer_id: str) -> dict[str, Any] | None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        assessment = session.get(TrainingAssessment, assessment_id)
        if assessment is None:
            return None
        task = session.get(TrainingTask, assessment.taskId)
        if task is None:
            return None
        if decision not in {"confirmed", "revised", "rejected"}:
            raise TrainingStateError("复核决定无效")
        if not reason.strip() or not reviewer_id.strip():
            raise TrainingStateError("复核原因和复核人不能为空")
        if assessment.reviewStatus != "pending":
            if assessment.reviewStatus == decision:
                return _assessment_payload(assessment)
            raise TrainingStateError("评分已完成复核，不能更改最终决定")
        if task.status != "待复核" or task.completedAt is None:
            raise TrainingStateError("仅已完成且待复核的训练可以复核")
        archive = session.scalar(select(TrainingArchive).where(TrainingArchive.taskId == task.taskId))
        if archive is not None:
            raise TrainingStateError("训练已归档，不能重新复核")
        now = _now()
        assessment.reviewStatus = decision
        assessment.reviewComment = reason
        assessment.reviewerId = reviewer_id
        assessment.reviewedAt = now
        task.status = "已归档" if decision in {"confirmed", "revised"} else "待复训"
        task.updatedAt = now
        if decision in {"confirmed", "revised"}:
            score = assessment.score_json
            weak_points = ["完成用时"] if score.get("completionTime", 0) < 90 else ["协同一致性"]
            session.add(TrainingArchive(
                recordId=f"RECORD-{task.taskId}",
                taskId=task.taskId,
                assessmentId=assessment.assessmentId,
                traineeId=task.traineeId,
                teamName=task.teamName,
                result="合格" if score.get("total", 0) >= 80 else "待补训",
                weakPoints_json=weak_points,
                retrainingRecommendation=f"样例补训建议（非训练规范）：围绕“{task.subject}”安排针对性练习，具体安排由教官确认。",
                auditId=f"ARCHIVE-{assessment.auditId}",
                createdAt=now,
            ))
        session.commit()
        return _assessment_payload(assessment)


def list_archives() -> list[dict[str, Any]]:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        rows = session.scalars(select(TrainingArchive).order_by(TrainingArchive.createdAt.desc())).all()
        return [
            {
                "recordId": row.recordId,
                "taskId": row.taskId,
                "assessmentId": row.assessmentId,
                "traineeId": row.traineeId,
                "teamName": row.teamName,
                "result": row.result,
                "weakPoints": row.weakPoints_json,
                "retrainingRecommendation": row.retrainingRecommendation,
                "auditId": row.auditId,
                "createdAt": row.createdAt,
            }
            for row in rows
        ]


def create_retraining_task(record_id: str) -> dict[str, Any] | None:
    init_database()
    with DB_LOCK, SessionLocal() as session:
        archive = session.get(TrainingArchive, record_id)
        if archive is None:
            return None
        source_task = session.get(TrainingTask, archive.taskId)
        if source_task is None:
            return None
        retraining_id = f"RETRAIN-{source_task.taskId}"
        retraining = session.get(TrainingTask, retraining_id)
        if retraining is None:
            # Legacy IDs are ambiguous; reuse one only when its archive basis agrees.
            legacy = session.get(TrainingTask, f"RETRAIN-{source_task.taskId.rsplit('-', 1)[-1]}")
            if legacy is not None and f"来源档案 {archive.recordId}" in legacy.basis_json:
                retraining = legacy
        if retraining is None:
            now = _now()
            retraining = TrainingTask(
                taskId=retraining_id,
                subject=f"补训：{source_task.subject}",
                traineeId=source_task.traineeId,
                teamName=source_task.teamName,
                equipment_json=source_task.equipment_json,
                standard_json=source_task.standard_json,
                basis_json=[*source_task.basis_json, f"来源档案 {archive.recordId}"],
                status="待训练",
                createdAt=now,
                updatedAt=now,
            )
            session.add(retraining)
            session.commit()
        return _task_payload(retraining)
