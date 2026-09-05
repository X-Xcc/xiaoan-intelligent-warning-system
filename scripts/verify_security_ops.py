from __future__ import annotations

import sys
from datetime import datetime

sys.path.insert(0, r"D:\CICSIC\server")

from sqlalchemy import delete, select

from app.services import security_ops
from app.services.database import DB_LOCK, SessionLocal, init_database
from app.services.models import (
    AnalysisReport,
    ContainmentPlan,
    DataFeed,
    DispatchRule,
    DutyPlan,
    EventAuditLog,
    IdentityProfile,
    NotificationRecord,
    SafetyEvent,
    TargetLock,
    TrackRecord,
    UserRole,
    VoiceIntake,
    WechatUser,
)


def main() -> None:
    init_database()
    marker = datetime.now().strftime("%Y%m%d%H%M%S")
    openid = f"verify-{marker}"
    person_key = f"verify-person-{marker}"
    feed_key = f"verify-feed-{marker}"
    rule_key = f"verify-rule-{marker}"
    event_id = None
    report_id = None

    try:
        with DB_LOCK, SessionLocal() as session:
            session.add(
                WechatUser(
                    openid=openid,
                    unionid=None,
                    session_key=None,
                    token=f"token-{marker}",
                    last_login_at=datetime.now().isoformat(timespec="seconds"),
                    created_at=datetime.now().isoformat(timespec="seconds"),
                )
            )
            session.commit()

        role = security_ops.upsert_role(openid, "指挥员")
        assert role["role"] == "指挥员"
        assert "dispatch" in role["permissions"]

        plans = security_ops.generate_duty_plans()
        assert len(plans) == 3

        rule = security_ops.save_dispatch_rule(
            "验收规则",
            "keyword",
            {"keywords": ["打架"]},
            {"autoAssign": False, "channel": ["popup"]},
            "指挥员",
            True,
            rule_key,
        )
        assert rule["ruleKey"] == rule_key

        voice = security_ops.record_voice_intake(
            "主街烧烤区有人打架，请尽快处理",
            "主街烧烤区",
            auto_assign=False,
        )
        assert voice["intent"] == "fight"
        event_id = voice["event"]["id"]
        notices = security_ops.list_notifications(limit=100)
        assert any(item["eventId"] == event_id for item in notices)

        profile = security_ops.upsert_identity_profile(
            "验收目标",
            archive_no=person_key,
            tags=["重点关注"],
            person_key=person_key,
        )
        assert profile["personKey"] == person_key
        matches = security_ops.compare_identity_archive("验收目标")
        assert matches and matches[0]["personKey"] == person_key

        track = security_ops.record_track(
            person_key,
            [{"latitude": 28.682, "longitude": 115.8585, "at": datetime.now().isoformat(timespec="seconds")}],
            camera_id="cam-verify",
            camera_name="验收摄像头",
            event_id=event_id,
            behavior="打架",
        )
        assert track["personKey"] == person_key

        target = security_ops.lock_target("验收目标", person_key, event_id, "验收锁定")
        assert target["status"] == "锁定中"

        plan = security_ops.create_containment_plan(event_id, target["targetKey"])
        assert len(plan["assignments"]) == 3

        feed = security_ops.upsert_data_feed(feed_key, "camera", "验收摄像头", status="待接入")
        assert feed["sourceKey"] == feed_key
        synced = security_ops.sync_data_feed(feed_key, {"kind": "camera", "name": "验收摄像头", "count": 1})
        assert synced["status"] == "在线"

        summary = security_ops.summary()
        assert summary["overviewStats"]["today_events"] >= 1
        assert summary["duty"]["total"] >= 3
        assert summary["identity"]["profiles"] >= 1

        report = security_ops.generate_analysis_report("verify", marker, marker)
        with SessionLocal() as session:
            report_row = session.scalars(
                select(AnalysisReport).where(AnalysisReport.periodStart == marker, AnalysisReport.periodEnd == marker)
            ).first()
            report_id = report_row.reportId if report_row else None
        assert report["eventCount"] >= 1
        assert report_id
        print("security_ops ok")
    finally:
        with DB_LOCK, SessionLocal() as session:
            if report_id:
                session.execute(delete(AnalysisReport).where(AnalysisReport.reportId == report_id))
            session.execute(delete(ContainmentPlan).where(ContainmentPlan.eventId == event_id))
            session.execute(delete(TargetLock).where(TargetLock.personKey == person_key))
            session.execute(delete(TrackRecord).where(TrackRecord.personKey == person_key))
            session.execute(delete(IdentityProfile).where(IdentityProfile.personKey == person_key))
            session.execute(delete(NotificationRecord).where(NotificationRecord.eventId == event_id))
            session.execute(delete(VoiceIntake).where(VoiceIntake.eventId == event_id))
            if event_id:
                session.execute(delete(EventAuditLog).where(EventAuditLog.eventId == event_id))
                session.execute(delete(SafetyEvent).where(SafetyEvent.id == event_id))
            session.execute(delete(DataFeed).where(DataFeed.sourceKey == feed_key))
            session.execute(delete(DispatchRule).where(DispatchRule.ruleKey == rule_key))
            session.execute(delete(UserRole).where(UserRole.openid == openid))
            session.execute(delete(WechatUser).where(WechatUser.openid == openid))
            session.commit()


if __name__ == "__main__":
    main()
