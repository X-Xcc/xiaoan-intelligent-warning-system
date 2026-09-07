"""Loopback-only command rehearsal server with a dedicated disposable data directory."""
from pathlib import Path
import argparse
import os
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "tmp/command-demo"
DATA.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = "sqlite:///" + (DATA / "command.sqlite3").as_posix()
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"
os.environ["CICSIC_EVIDENCE_DIR"] = str(DATA / "evidence")
os.environ["APP_ENV"] = "development"
os.environ["CICSIC_COMMAND_DEMO"] = "1"
os.environ["CICSIC_COMMAND_ISOLATED"] = "1"
sys.path.insert(0, str(ROOT / "server"))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import command, events, auth
from app.services import event_store
from app.services.database import SessionLocal, init_database
from app.services.models import CommandPrincipal, UserRole, WechatUser
from app.services.command_workflow import now

app = FastAPI(title="小安接处警隔离联调", version="1.0")
app.add_middleware(CORSMiddleware, allow_origin_regex=r"http://(127\.0\.0\.1|localhost)(:\d+)?",
                   allow_methods=["*"], allow_headers=["*"])
tokens = {}


def initialize():
    init_database()
    with SessionLocal.begin() as session:
        event_store._seed_staff(session)
        session.flush()
        for key, roles, staff_id in [
            ("intake", ["intake"], None), ("dispatch", ["dispatch"], None), ("field", ["field"], "wang"),
            ("analysis", ["analyze"], None), ("screen", ["display"], None),
        ]:
            openid = "command-demo-" + key
            token = secrets.token_urlsafe(32)
            tokens[key] = token
            user = session.get(WechatUser, openid)
            if user:
                user.token, user.last_login_at = token, now()
            else:
                session.add(WechatUser(openid=openid, token=token, last_login_at=now(), created_at=now()))
            role = session.get(UserRole, openid)
            if not role:
                session.add(UserRole(openid=openid, role="巡防" if staff_id else "教学",
                    display_name="王队" if staff_id else key, permissions_json=["review", "track"] if staff_id else [],
                    createdAt=now(), updatedAt=now()))
            grant = session.get(CommandPrincipal, openid)
            if not grant:
                session.add(CommandPrincipal(openid=openid, roles_json=roles, staffId=staff_id, enabled=True))


@app.post("/api/command/demo-session/{persona}")
def demo_session(persona: str, request: Request):
    if request.client.host not in {"127.0.0.1", "::1"} or persona not in tokens:
        raise HTTPException(403, "仅允许本机教学账号")
    return {"token": tokens[persona], "staffName": "王队" if persona == "field" else None,
            "sourceMode": "desensitized_demo"}


app.include_router(command.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(auth.router, prefix="/api")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8021)
    args = parser.parse_args()
    initialize()
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=args.port)
