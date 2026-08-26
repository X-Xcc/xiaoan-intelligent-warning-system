from __future__ import annotations

import html
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import func, select

from app.services.database import SessionLocal
from app.services.models import EventAuditLog, SafetyEvent, WechatUser


router = APIRouter(prefix="/db-admin", tags=["db-admin"])
security = HTTPBasic()


def _require_admin(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    expected_user = os.getenv("DB_ADMIN_USER", "admin")
    expected_password = os.getenv("DB_ADMIN_PASSWORD", "jiangtan-db-admin")
    user_ok = secrets.compare_digest(credentials.username, expected_user)
    password_ok = secrets.compare_digest(credentials.password, expected_password)
    if not (user_ok and password_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid database admin credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


def _e(value: object) -> str:
    return html.escape("" if value is None else str(value))


def _table(headers: list[str], rows: list[list[object]]) -> str:
    head = "".join(f"<th>{_e(item)}</th>" for item in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{_e(item)}</td>" for item in row) + "</tr>"
        for row in rows
    )
    return f"<div class='table-wrap'><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>"


@router.get("", response_class=HTMLResponse)
def db_admin(_: str = Depends(_require_admin)) -> str:
    with SessionLocal() as session:
        event_count = session.scalar(select(func.count()).select_from(SafetyEvent)) or 0
        log_count = session.scalar(select(func.count()).select_from(EventAuditLog)) or 0
        user_count = session.scalar(select(func.count()).select_from(WechatUser)) or 0
        events = session.scalars(select(SafetyEvent).order_by(SafetyEvent.createdAt.desc()).limit(50)).all()
        logs = session.scalars(select(EventAuditLog).order_by(EventAuditLog.createdAt.desc(), EventAuditLog.id.desc()).limit(50)).all()
        users = session.scalars(select(WechatUser).order_by(WechatUser.last_login_at.desc()).limit(50)).all()

    event_rows = [
        [
            event.id,
            event.kind,
            event.title,
            event.bay,
            event.level,
            event.status,
            event.owner,
            event.time,
            event.createdAt,
        ]
        for event in events
    ]
    log_rows = [
        [
            log.id,
            log.eventId,
            log.action,
            log.operator,
            log.status,
            log.owner,
            log.time,
            log.createdAt,
            log.note,
        ]
        for log in logs
    ]
    user_rows = [
        [
            user.openid,
            user.unionid,
            user.last_login_at,
            user.created_at,
        ]
        for user in users
    ]

    return f"""
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>夜市智防数据库管理</title>
  <style>
    :root {{ color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }}
    body {{ margin: 0; background: #eef4f2; color: #17211f; }}
    header {{ padding: 28px 34px; background: #0d6f67; color: white; }}
    h1 {{ margin: 0 0 8px; font-size: 28px; }}
    header p {{ margin: 0; color: rgba(255,255,255,.78); }}
    main {{ padding: 26px 34px 48px; display: grid; gap: 22px; }}
    .metrics {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }}
    .metric, section {{ background: white; border: 1px solid #dce8e4; border-radius: 10px; box-shadow: 0 10px 26px rgba(21, 48, 43, .08); }}
    .metric {{ padding: 18px; }}
    .metric span {{ display: block; color: #60736f; font-size: 13px; }}
    .metric strong {{ display: block; margin-top: 7px; font-size: 30px; color: #0b6c63; }}
    section {{ overflow: hidden; }}
    .section-head {{ display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-bottom: 1px solid #e4eeea; }}
    h2 {{ margin: 0; font-size: 18px; }}
    .hint {{ color: #637771; font-size: 13px; }}
    .table-wrap {{ overflow: auto; max-height: 520px; }}
    table {{ width: 100%; border-collapse: collapse; min-width: 980px; font-size: 13px; }}
    th, td {{ padding: 11px 12px; border-bottom: 1px solid #edf3f1; text-align: left; vertical-align: top; }}
    th {{ position: sticky; top: 0; background: #f8fbfa; color: #536963; font-weight: 700; }}
    td {{ color: #1d2f2b; }}
    @media (max-width: 760px) {{
      header, main {{ padding-left: 16px; padding-right: 16px; }}
      .metrics {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <header>
    <h1>夜市智防数据库管理</h1>
    <p>只读查看云端 PostgreSQL 数据，数据库端口未开放公网。</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><span>事件工单</span><strong>{event_count}</strong></div>
      <div class="metric"><span>流转日志</span><strong>{log_count}</strong></div>
      <div class="metric"><span>微信用户</span><strong>{user_count}</strong></div>
    </div>
    <section>
      <div class="section-head"><h2>safety_events</h2><span class="hint">最近 50 条</span></div>
      {_table(["编号", "类型", "标题", "网格", "风险", "状态", "负责人", "时间", "创建时间"], event_rows)}
    </section>
    <section>
      <div class="section-head"><h2>event_audit_logs</h2><span class="hint">最近 50 条</span></div>
      {_table(["ID", "事件编号", "动作", "操作人", "状态", "负责人", "时间", "创建时间", "备注"], log_rows)}
    </section>
    <section>
      <div class="section-head"><h2>wechat_users</h2><span class="hint">最近 50 条</span></div>
      {_table(["openid", "unionid", "最后登录", "创建时间"], user_rows)}
    </section>
  </main>
</body>
</html>
"""
