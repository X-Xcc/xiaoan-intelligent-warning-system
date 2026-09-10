from __future__ import annotations

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.services.database import Base


class SafetyEvent(Base):
    __tablename__ = "safety_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    bay: Mapped[str] = mapped_column(String(80), nullable=False)
    level: Mapped[str] = mapped_column(String(24), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    owner: Mapped[str] = mapped_column(String(80), nullable=False)
    distance: Mapped[str] = mapped_column(String(40), nullable=False)
    time: Mapped[str] = mapped_column(String(16), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    meta_json: Mapped[dict] = mapped_column("meta", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAtIso: Mapped[str] = mapped_column(String(32), nullable=False)


class CommandPrincipal(Base):
    __tablename__ = "command_principals"

    openid: Mapped[str] = mapped_column(String(128), ForeignKey("wechat_users.openid"), primary_key=True)
    roles_json: Mapped[list] = mapped_column("roles", JSON, nullable=False, default=list)
    staffId: Mapped[str | None] = mapped_column(String(64), ForeignKey("patrol_staff.id"), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CommandReceipt(Base):
    __tablename__ = "command_receipts"

    scope: Mapped[str] = mapped_column(String(160), primary_key=True)
    requestId: Mapped[str] = mapped_column(String(96), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[dict] = mapped_column("response", JSON, nullable=False)


class CommandUpload(Base):
    __tablename__ = "command_uploads"

    uploadId: Mapped[str] = mapped_column(String(64), primary_key=True)
    eventId: Mapped[str] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=False)
    uploadedBy: Mapped[str] = mapped_column(String(128), nullable=False)
    filename: Mapped[str] = mapped_column(String(96), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    mimeType: Mapped[str] = mapped_column(String(80), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)


class SecurityDetection(Base):
    __tablename__ = "security_detections"

    eventKey: Mapped[str] = mapped_column(String(64), primary_key=True)
    eventId: Mapped[str | None] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=True, unique=True)
    sourceId: Mapped[str] = mapped_column(String(64), nullable=False)
    cameraId: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cameraName: Mapped[str | None] = mapped_column(String(120), nullable=True)
    timestamp: Mapped[str] = mapped_column(String(32), nullable=False)
    primaryAction: Mapped[str] = mapped_column(String(32), nullable=False)
    personCount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    frameCount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fps: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    imageFilename: Mapped[str | None] = mapped_column(String(160), nullable=True)
    sourcePath: Mapped[str | None] = mapped_column(String(512), nullable=True)
    actions_json: Mapped[list] = mapped_column("actions", JSON, nullable=False, default=list)
    payload_json: Mapped[dict] = mapped_column("payload", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class EventAuditLog(Base):
    __tablename__ = "event_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    eventId: Mapped[str] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    operator: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    owner: Mapped[str] = mapped_column(String(80), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    time: Mapped[str] = mapped_column(String(16), nullable=False)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)


class TrainingTask(Base):
    __tablename__ = "training_tasks"

    taskId: Mapped[str] = mapped_column(String(80), primary_key=True)
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    traineeId: Mapped[str] = mapped_column(String(80), nullable=False)
    teamName: Mapped[str] = mapped_column(String(120), nullable=False)
    equipment_json: Mapped[list] = mapped_column("equipment", JSON, nullable=False, default=list)
    standard_json: Mapped[dict] = mapped_column("standard", JSON, nullable=False, default=dict)
    basis_json: Mapped[list] = mapped_column("basis", JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="待训练")
    elapsedSeconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    startedAt: Mapped[str | None] = mapped_column(String(32), nullable=True)
    completedAt: Mapped[str | None] = mapped_column(String(32), nullable=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class TrainingException(Base):
    __tablename__ = "training_exceptions"

    exceptionId: Mapped[str] = mapped_column(String(96), primary_key=True)
    taskId: Mapped[str] = mapped_column(String(80), ForeignKey("training_tasks.taskId"), nullable=False, unique=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    reportedBy: Mapped[str] = mapped_column(String(80), nullable=False)
    auditId: Mapped[str] = mapped_column(String(112), nullable=False, unique=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)


class TrainingAssessment(Base):
    __tablename__ = "training_assessments"

    assessmentId: Mapped[str] = mapped_column(String(80), primary_key=True)
    taskId: Mapped[str] = mapped_column(String(80), ForeignKey("training_tasks.taskId"), nullable=False, unique=True)
    inputMode: Mapped[str] = mapped_column(String(40), nullable=False)
    score_json: Mapped[dict] = mapped_column("score", JSON, nullable=False, default=dict)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_json: Mapped[list] = mapped_column("evidence", JSON, nullable=False, default=list)
    evidenceTime: Mapped[str] = mapped_column(String(32), nullable=False)
    ruleVersion: Mapped[str] = mapped_column(String(64), nullable=False)
    humanReviewRequired: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reviewStatus: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    reviewerId: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reviewComment: Mapped[str | None] = mapped_column(Text, nullable=True)
    auditId: Mapped[str] = mapped_column(String(96), nullable=False, unique=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    reviewedAt: Mapped[str | None] = mapped_column(String(32), nullable=True)


class TrainingArchive(Base):
    __tablename__ = "training_archives"

    recordId: Mapped[str] = mapped_column(String(96), primary_key=True)
    taskId: Mapped[str] = mapped_column(String(80), ForeignKey("training_tasks.taskId"), nullable=False, unique=True)
    assessmentId: Mapped[str] = mapped_column(String(80), ForeignKey("training_assessments.assessmentId"), nullable=False, unique=True)
    traineeId: Mapped[str] = mapped_column(String(80), nullable=False)
    teamName: Mapped[str] = mapped_column(String(120), nullable=False)
    result: Mapped[str] = mapped_column(String(24), nullable=False)
    weakPoints_json: Mapped[list] = mapped_column("weakPoints", JSON, nullable=False, default=list)
    retrainingRecommendation: Mapped[str] = mapped_column(Text, nullable=False)
    auditId: Mapped[str] = mapped_column(String(96), nullable=False, unique=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)


class AlarmPush(Base):
    __tablename__ = "alarm_pushes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    eventId: Mapped[str] = mapped_column("event_id", String(64), ForeignKey("safety_events.id"), nullable=False)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    target: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    payload_json: Mapped[dict] = mapped_column("payload", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    acknowledgedAt: Mapped[str | None] = mapped_column(String(32), nullable=True)


class PatrolStaff(Base):
    __tablename__ = "patrol_staff"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(80), nullable=False)
    latitude: Mapped[float] = mapped_column(nullable=False)
    longitude: Mapped[float] = mapped_column(nullable=False)
    modes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)
    accuracy: Mapped[float | None] = mapped_column(nullable=True)


class WechatUser(Base):
    __tablename__ = "wechat_users"

    openid: Mapped[str] = mapped_column(String(128), primary_key=True)
    unionid: Mapped[str | None] = mapped_column(String(128), nullable=True)
    session_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    token: Mapped[str] = mapped_column(String(128), nullable=False)
    last_login_at: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)


class UserRole(Base):
    __tablename__ = "user_roles"

    openid: Mapped[str] = mapped_column(String(128), ForeignKey("wechat_users.openid"), primary_key=True)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    permissions_json: Mapped[list] = mapped_column("permissions", JSON, nullable=False, default=list)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class DutyPlan(Base):
    __tablename__ = "duty_plans"

    planKey: Mapped[str] = mapped_column(String(64), primary_key=True)
    planDate: Mapped[str] = mapped_column(String(16), nullable=False)
    timeSlot: Mapped[str] = mapped_column(String(40), nullable=False)
    area: Mapped[str] = mapped_column(String(120), nullable=False)
    staff_json: Mapped[list] = mapped_column("staff", JSON, nullable=False, default=list)
    hotspots_json: Mapped[list] = mapped_column("hotspots", JSON, nullable=False, default=list)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class DispatchRule(Base):
    __tablename__ = "dispatch_rules"

    ruleKey: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    triggerType: Mapped[str] = mapped_column(String(40), nullable=False)
    conditions_json: Mapped[dict] = mapped_column("conditions", JSON, nullable=False, default=dict)
    action_json: Mapped[dict] = mapped_column("action", JSON, nullable=False, default=dict)
    targetRole: Mapped[str] = mapped_column(String(40), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class VoiceIntake(Base):
    __tablename__ = "voice_intakes"

    intakeId: Mapped[str] = mapped_column(String(64), primary_key=True)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    intent: Mapped[str] = mapped_column(String(40), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    parsed_json: Mapped[dict] = mapped_column("parsed", JSON, nullable=False, default=dict)
    eventId: Mapped[str | None] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)


class NotificationRecord(Base):
    __tablename__ = "notification_records"

    noticeId: Mapped[str] = mapped_column(String(64), primary_key=True)
    eventId: Mapped[str | None] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    target: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    meta_json: Mapped[dict] = mapped_column("meta", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)
    sentAt: Mapped[str | None] = mapped_column(String(32), nullable=True)


class DataFeed(Base):
    __tablename__ = "data_feeds"

    sourceKey: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    endpoint: Mapped[str | None] = mapped_column(String(512), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    lastSyncAt: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payload_json: Mapped[dict] = mapped_column("payload", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class IdentityProfile(Base):
    __tablename__ = "identity_profiles"

    personKey: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    idNumber: Mapped[str | None] = mapped_column(String(40), nullable=True)
    archiveNo: Mapped[str | None] = mapped_column(String(64), nullable=True)
    faceFingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tags_json: Mapped[list] = mapped_column("tags", JSON, nullable=False, default=list)
    faceImage: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lastSeenAt: Mapped[str | None] = mapped_column(String(32), nullable=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class TrackRecord(Base):
    __tablename__ = "track_records"

    trackId: Mapped[str] = mapped_column(String(64), primary_key=True)
    personKey: Mapped[str | None] = mapped_column(String(64), ForeignKey("identity_profiles.personKey"), nullable=True)
    eventId: Mapped[str | None] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=True)
    cameraId: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cameraName: Mapped[str | None] = mapped_column(String(120), nullable=True)
    points_json: Mapped[list] = mapped_column("points", JSON, nullable=False, default=list)
    behavior: Mapped[str | None] = mapped_column(String(120), nullable=True)
    startAt: Mapped[str] = mapped_column(String(32), nullable=False)
    endAt: Mapped[str | None] = mapped_column(String(32), nullable=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)


class TargetLock(Base):
    __tablename__ = "target_locks"

    targetKey: Mapped[str] = mapped_column(String(64), primary_key=True)
    personKey: Mapped[str | None] = mapped_column(String(64), ForeignKey("identity_profiles.personKey"), nullable=True)
    eventId: Mapped[str | None] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    trail_json: Mapped[list] = mapped_column("trail", JSON, nullable=False, default=list)
    lockedAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class ContainmentPlan(Base):
    __tablename__ = "containment_plans"

    planId: Mapped[str] = mapped_column(String(64), primary_key=True)
    eventId: Mapped[str | None] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    targetKey: Mapped[str | None] = mapped_column(String(64), nullable=True)
    layout_json: Mapped[dict] = mapped_column("layout", JSON, nullable=False, default=dict)
    assignments_json: Mapped[list] = mapped_column("assignments", JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    reportId: Mapped[str] = mapped_column(String(64), primary_key=True)
    periodStart: Mapped[str] = mapped_column(String(32), nullable=False)
    periodEnd: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary_json: Mapped[dict] = mapped_column("summary", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class Market(Base):
    __tablename__ = "markets"

    marketId: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    district: Mapped[str | None] = mapped_column(String(80), nullable=True)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="运行中")
    meta_json: Mapped[dict] = mapped_column("meta", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class Zone(Base):
    __tablename__ = "zones"

    zoneId: Mapped[str] = mapped_column(String(80), primary_key=True)
    marketId: Mapped[str] = mapped_column(String(64), ForeignKey("markets.marketId"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    boundary_json: Mapped[dict] = mapped_column("boundary", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class Device(Base):
    __tablename__ = "devices"

    deviceId: Mapped[str] = mapped_column(String(80), primary_key=True)
    marketId: Mapped[str | None] = mapped_column(String(64), ForeignKey("markets.marketId"), nullable=True)
    zoneId: Mapped[str | None] = mapped_column(String(80), ForeignKey("zones.zoneId"), nullable=True)
    deviceType: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="离线")
    capabilities_json: Mapped[list] = mapped_column("capabilities", JSON, nullable=False, default=list)
    config_json: Mapped[dict] = mapped_column("config", JSON, nullable=False, default=dict)
    lastSeenAt: Mapped[str | None] = mapped_column(String(32), nullable=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class RiskRecord(Base):
    __tablename__ = "risk_records"

    riskId: Mapped[str] = mapped_column(String(80), primary_key=True)
    riskKey: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    riskType: Mapped[str] = mapped_column(String(80), nullable=False)
    level: Mapped[str] = mapped_column(String(24), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="观察中")
    marketIds_json: Mapped[list] = mapped_column("marketIds", JSON, nullable=False, default=list)
    zoneIds_json: Mapped[list] = mapped_column("zoneIds", JSON, nullable=False, default=list)
    eventIds_json: Mapped[list] = mapped_column("eventIds", JSON, nullable=False, default=list)
    sourceTypes_json: Mapped[list] = mapped_column("sourceTypes", JSON, nullable=False, default=list)
    evidence_json: Mapped[list] = mapped_column("evidence", JSON, nullable=False, default=list)
    metrics_json: Mapped[dict] = mapped_column("metrics", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class DroneTask(Base):
    __tablename__ = "drone_tasks"

    taskId: Mapped[str] = mapped_column(String(80), primary_key=True)
    eventId: Mapped[str | None] = mapped_column(String(64), ForeignKey("safety_events.id"), nullable=True)
    riskRecordId: Mapped[str | None] = mapped_column(String(80), ForeignKey("risk_records.riskId"), nullable=True)
    marketId: Mapped[str | None] = mapped_column(String(64), ForeignKey("markets.marketId"), nullable=True)
    zoneId: Mapped[str | None] = mapped_column(String(80), ForeignKey("zones.zoneId"), nullable=True)
    taskArea: Mapped[str] = mapped_column(String(160), nullable=False)
    waypoints_json: Mapped[list] = mapped_column("waypoints", JSON, nullable=False, default=list)
    priority: Mapped[str] = mapped_column(String(24), nullable=False, default="中")
    broadcastText: Mapped[str | None] = mapped_column(Text, nullable=True)
    videoUrl: Mapped[str | None] = mapped_column(String(512), nullable=True)
    deviceStatus: Mapped[str] = mapped_column(String(24), nullable=False, default="待命")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="待执行")
    evidence_json: Mapped[list] = mapped_column("evidence", JSON, nullable=False, default=list)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class AdminAgent(Base):
    __tablename__ = "admin_agents"

    agentKey: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    currentTask: Mapped[str] = mapped_column(Text, nullable=False)
    latency: Mapped[str] = mapped_column(String(40), nullable=False, default="实时")
    config_json: Mapped[dict] = mapped_column("config", JSON, nullable=False, default=dict)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class AdminSkill(Base):
    __tablename__ = "admin_skills"

    skillKey: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    config_json: Mapped[dict] = mapped_column("config", JSON, nullable=False, default=dict)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class VoiceBroadcastSetting(Base):
    __tablename__ = "voice_broadcast_settings"

    settingKey: Mapped[str] = mapped_column(String(64), primary_key=True)
    config_json: Mapped[dict] = mapped_column("config", JSON, nullable=False, default=dict)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    settingKey: Mapped[str] = mapped_column(String(64), primary_key=True)
    config_json: Mapped[dict] = mapped_column("config", JSON, nullable=False, default=dict)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class ServiceAccessKey(Base):
    __tablename__ = "service_access_keys"

    keyId: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    keyPrefix: Mapped[str] = mapped_column(String(40), nullable=False)
    keyHash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    scopes_json: Mapped[list] = mapped_column("scopes", JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    expiresAt: Mapped[str | None] = mapped_column(String(32), nullable=True)
    lastUsedAt: Mapped[str | None] = mapped_column(String(32), nullable=True)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
    updatedAt: Mapped[str] = mapped_column(String(32), nullable=False)


class SystemAuditLog(Base):
    __tablename__ = "system_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    resourceType: Mapped[str] = mapped_column(String(80), nullable=False)
    resourceId: Mapped[str | None] = mapped_column(String(120), nullable=True)
    detail_json: Mapped[dict] = mapped_column("detail", JSON, nullable=False, default=dict)
    createdAt: Mapped[str] = mapped_column(String(32), nullable=False)
