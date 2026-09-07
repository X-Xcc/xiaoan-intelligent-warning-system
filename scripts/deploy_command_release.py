"""Scoped production deployment. Run only on the explicitly selected server."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
from urllib.request import urlopen
from uuid import uuid4

from sqlalchemy.engine import make_url

PACKAGE = Path(__file__).resolve().parent
ROOT = Path("/opt/public-security-web")
LIVE = ROOT / "project/server"
WEB = Path("/www/wwwroot/public-security-web")
PYTHON = ROOT / "venv/bin/python"
SERVICE = "public-security-web-api"


def run(*args, **kwargs):
    return subprocess.run(list(args), check=True, **kwargs)


def sha(path):
    return sha256(path.read_bytes()).hexdigest()


def load_env():
    env = dict(os.environ)
    for line in Path("/etc/public-security-web-api.env").read_text().splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    env["APP_ENV"] = "production"
    for key in ["CICSIC_COMMAND_DEMO", "CICSIC_COMMAND_ISOLATED", "CICSIC_ALLOW_SQLITE_TESTS"]:
        env.pop(key, None)
    return env


def pg_env(env, database=None):
    url = make_url(env["DATABASE_URL"])
    result = dict(env)
    result.update(PGHOST=url.host or "127.0.0.1", PGPORT=str(url.port or 5432),
                  PGUSER=url.username, PGPASSWORD=url.password or "", PGDATABASE=database or url.database)
    return result


def verify_package():
    hashes = json.loads((PACKAGE / "backend-files.json").read_text())
    baseline = json.loads((PACKAGE / "backend-baseline.json").read_text())
    for name, expected in hashes.items():
        assert sha(PACKAGE / "backend/app" / name) == expected, name
        target = LIVE / "app" / name
        assert (sha(target) if target.exists() else None) == baseline[name], f"Live baseline changed: {name}"
    assert not (WEB / "command").exists(), "Command entry already exists; review before overwriting"
    assert not (WEB / "command-release-assets").exists(), "Release assets already exist"
    return hashes


def backup_and_prepare():
    assert os.geteuid() == 0
    assert Path("/etc/hostname").read_text().strip() == "iZbp1fl0yjclpxg8me1kfjZ"
    verify_package()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = ROOT / "backups" / ("command-" + stamp)
    backup.mkdir(parents=True, mode=0o700)
    backup.chmod(0o700)
    for source, name in [(LIVE, "server-before.tar.gz"), (WEB, "web-before.tar.gz")]:
        with tarfile.open(backup / name, "w:gz") as archive:
            archive.add(source, arcname=source.name)
    env = load_env()
    run("pg_dump", "--format=custom", "--file", str(backup / "database-before.dump"), env=pg_env(env))
    run("pg_restore", "--list", str(backup / "database-before.dump"), stdout=subprocess.DEVNULL)
    shutil.copytree(LIVE / "app", PACKAGE / "preflight/server/app")
    shutil.copytree(PACKAGE / "backend/app", PACKAGE / "preflight/server/app", dirs_exist_ok=True)
    (PACKAGE / "backup.json").write_text(json.dumps({"path": str(backup), "preparedAt": stamp}))
    print(json.dumps({"backup": str(backup), "prepared": True}), flush=True)


def preflight():
    backup = Path(json.loads((PACKAGE / "backup.json").read_text())["path"])
    env = load_env()
    url = make_url(env["DATABASE_URL"])
    database = "command_preflight_" + uuid4().hex[:16]
    run("runuser", "-u", "postgres", "--", "createdb", "--owner", url.username, database)
    try:
        run("pg_restore", "--no-owner", "--no-acl", "--exit-on-error", "--dbname", database,
            str(backup / "database-before.dump"), env=pg_env(env, database))
        env["DATABASE_URL"] = url.set(database=database).render_as_string(hide_password=False)
        env["CICSIC_EVIDENCE_DIR"] = str(PACKAGE / "preflight/evidence")
        os.environ.update(env)
        sys.path.insert(0, str(PACKAGE / "preflight/server"))
        sys.path.append(str(PACKAGE / "test-runtime"))
        from fastapi.testclient import TestClient
        from app.main import app
        from app.services.database import SessionLocal, engine
        from app.services.models import WechatUser, CommandPrincipal
        from app.services.command_workflow import now
        with TestClient(app) as client:
            tokens = {}
            with SessionLocal.begin() as session:
                for role in ["intake", "dispatch", "field", "analyze"]:
                    token, openid = uuid4().hex, "deploy-check-" + uuid4().hex
                    tokens[role] = token
                    session.add(WechatUser(openid=openid, token=token, last_login_at=now(), created_at=now()))
                    session.flush()
                    session.add(CommandPrincipal(openid=openid, roles_json=[role],
                                                 staffId="wang" if role == "field" else None, enabled=True))
            def call(method, path, role=None, **kwargs):
                headers = {"Authorization": "Bearer " + tokens[role]} if role else {}
                response = client.request(method, "/api" + path, headers=headers, **kwargs)
                assert response.status_code == 200, (path, response.status_code, response.text[:400])
                return response.json()
            assert call("GET", "/command/config")["demoEnabled"] is False
            assert client.post("/api/command/demo-session/intake").status_code == 404
            state = call("POST", "/command/intakes", "intake", json={
                "requestId": uuid4().hex, "transcript": "发布验证教学纠纷，待现场人工核实。",
                "bay": "发布验证教学地点", "latitude": 28.65, "longitude": 115.89})
            event_id = state["event"]["id"]
            def act(action, role, fields):
                nonlocal state
                state = call("POST", f"/command/events/{event_id}/{action}", role, json={
                    **fields, "requestId": uuid4().hex, "expectedVersion": state["command"]["version"]})
            act("summary/confirm", "intake", {"summaryVersion": state["command"]["summary"]["version"],
                "text": "教学纠纷，风险待核实", "category": "消费纠纷", "dangerFactors": ["待核实"]})
            call("GET", f"/command/events/{event_id}/route-preview?staffId=wang", "dispatch")
            act("dispatch/confirm", "dispatch", {"staffId": "wang", "summaryVersion": state["command"]["summary"]["version"],
                "locationVersion": state["command"]["intake"]["locationVersion"]})
            act("dispatch", "dispatch", {"recommendationId": state["command"]["dispatch"]["recommendationId"]})
            for status in ["已接收", "已到达", "处理中"]:
                act("status", "field", {"status": status})
            act("verification", "field", {"query": "发布验证不匹配档案"})
            act(f"verification/{state['command']['verification']['verificationId']}/review",
                "field", {"decision": "fallback", "reason": "发布验证转人工"})
            with (PACKAGE / "command/receipts.png").open("rb") as image:
                upload = call("POST", "/events/evidence", "field", data={"eventId": event_id},
                              files={"file": ("receipts.png", image, "image/png")})["evidence"]
            act("evidence", "field", {"kind": "image", "name": "发布验证教学图片",
                "uploadId": upload["uploadId"], "description": "隔离数据库验证", "discoveredAt": now()})
            act("handover", "field", {"summary": "发布验证移交",
                "evidenceIds": [item["evidenceId"] for item in state["command"]["evidenceIndex"]]})
            assert state["event"]["status"] == "处理中"
            act(f"handover/{state['command']['handover']['handoverId']}/review", "analyze", {"decision": "accepted"})
            act("status", "field", {"status": "已完成", "result": "隔离数据库发布验证完成"})
            assert client.get(f"/api/events/{event_id}").status_code == 404
            assert state["event"]["status"] == "已完成"
            result = {"postgresCloneFlow": "passed", "productionWrites": False,
                      "version": state["command"]["version"], "eventId": event_id}
            (PACKAGE / "preflight-passed.json").write_text(json.dumps(result))
            print(json.dumps(result), flush=True)
        engine.dispose()
    finally:
        run("runuser", "-u", "postgres", "--", "dropdb", "--force", database)


def wait_health():
    for _ in range(40):
        try:
            with urlopen("http://127.0.0.1:8011/api/command/config", timeout=3) as response:
                if json.load(response)["demoEnabled"] is False:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError("Production command health check failed")


def activate():
    assert (PACKAGE / "preflight-passed.json").exists()
    hashes = verify_package()
    changed = []
    try:
        run("systemctl", "stop", SERVICE)
        for name in hashes:
            target = LIVE / "app" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(PACKAGE / "backend/app" / name, target)
            target.chmod(0o644)
            changed.append(name)
        run("systemctl", "start", SERVICE)
        wait_health()
        shutil.copytree(PACKAGE / "command-release-assets", WEB / "command-release-assets")
        shutil.copytree(PACKAGE / "command", WEB / "command")
        for name in hashes:
            assert sha(LIVE / "app" / name) == hashes[name]
        with urlopen("http://127.0.0.1/public-security/command/", timeout=10) as response:
            assert "command-release-assets" in response.read().decode()
        run("systemctl", "is-active", SERVICE, "cicsic-api")
        result = {"activated": True, "entry": "/public-security/command/",
                  "backup": json.loads((PACKAGE / "backup.json").read_text())["path"],
                  "backendFiles": len(changed)}
        (PACKAGE / "activated.json").write_text(json.dumps(result))
        print(json.dumps(result), flush=True)
    except Exception:
        rollback()
        raise


def rollback():
    backup = Path(json.loads((PACKAGE / "backup.json").read_text())["path"])
    baseline = json.loads((PACKAGE / "backend-baseline.json").read_text())
    run("systemctl", "stop", SERVICE)
    with tarfile.open(backup / "server-before.tar.gz", "r:gz") as archive:
        for name, original in baseline.items():
            target = LIVE / "app" / name
            if original is None:
                if target.exists():
                    target.unlink()
            else:
                data = archive.extractfile("server/app/" + name).read()
                assert sha256(data).hexdigest() == original
                target.write_bytes(data)
    for target in [WEB / "command", WEB / "command-release-assets"]:
        assert target.parent == WEB
        if target.exists():
            shutil.rmtree(target)
    run("systemctl", "start", SERVICE)
    print("Code rolled back. Additive database tables retained; no business data was overwritten.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["prepare", "preflight", "activate", "rollback"])
    action = parser.parse_args().action
    {"prepare": backup_and_prepare, "preflight": preflight, "activate": activate, "rollback": rollback}[action]()
