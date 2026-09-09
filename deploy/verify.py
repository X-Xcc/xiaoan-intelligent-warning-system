"""Write synthetic acceptance data to an explicitly selected disposable deployment."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import secrets
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from configure import read_config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--record", type=Path, required=True)
    parser.add_argument("--check-persistence", action="store_true")
    parser.add_argument("--allow-test-writes", action="store_true")
    args = parser.parse_args()
    if not args.allow_test_writes or urlsplit(args.base_url).hostname not in ("localhost", "127.0.0.1"):
        parser.error("Use a disposable loopback deployment and explicitly pass --allow-test-writes")
    base = args.base_url.rstrip("/")
    token = read_config(args.env_file)["CICSIC_ADMIN_TOKEN"]

    def call(path, payload=None, method=None, admin=False, expected=200, raw=None, content_type=None):
        headers = {"X-Admin-Token": token} if admin else {}
        body = raw
        if payload is not None:
            body = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        if content_type:
            headers["Content-Type"] = content_type
        request = Request(base + path, data=body, headers=headers, method=method)
        try:
            response = urlopen(request, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            content = response.read()
            assert response.status == expected, f"{path}: expected {expected}, got {response.status}"
            if "application/json" in response.headers.get("Content-Type", ""):
                return json.loads(content)
            return content

    status = call("/api/health/ready")
    assert status["status"] == "ready" and status["database"] == {"status": "ready", "engine": "postgresql"}
    assert b"<html" in call("/").lower()
    assert b"<html" in call("/admin/bridges").lower()
    call("/api/admin/runtime-status", expected=401)
    call("/api/device-bridges/", expected=401)
    call("/api/admin/runtime-status", admin=True)
    inventory = call("/api/device-bridges/", admin=True)
    assert all(inventory["runtime"][key] for key in ("av", "opencv", "go2")), inventory["runtime"]
    print("PASS: web, deep links, PostgreSQL readiness, admin authorization, video dependencies")

    if args.check_persistence:
        record = json.loads(args.record.read_text())
    else:
        marker = "Deployment verification " + secrets.token_hex(6)
        event = call("/api/events/help", {"bay": marker, "description": "Synthetic acceptance test. No real incident."})["event"]
        boundary = "xiaoan" + secrets.token_hex(12)
        evidence = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"verification.txt\"\r\n"
            f"Content-Type: text/plain\r\n\r\n{marker}\r\n--{boundary}--\r\n"
        ).encode()
        uploaded = call("/api/events/evidence", raw=evidence,
                        content_type=f"multipart/form-data; boundary={boundary}")["evidence"]
        device = call("/api/device-bridges/", {
            "name": marker, "kind": "rtsp", "host": "127.0.0.1", "port": 8554,
            "username": "synthetic", "password": secrets.token_hex(16),
            "rtspPath": "/verification", "channel": 1, "stream": "sub", "autoStart": False,
        }, admin=True)["device"]
        assert "password" not in device and device["hasPassword"]
        bindings = [device["id"], *([None] * 15)]
        call("/api/device-bridges/bindings", {"bindings": bindings}, method="PUT", admin=True)
        settings = call("/api/admin/platform-settings", admin=True)["settings"]
        settings = {key: settings[key] for key in ("adminAuthEnabled", "sourceAuthEnabled", "publicWriteRateLimitPerMinute", "evidenceUploadLimitMb")}
        settings["publicWriteRateLimitPerMinute"] = 23
        call("/api/admin/platform-settings", settings, method="PUT", admin=True)
        record = {"marker": marker, "event": event["id"], "device": device["id"], "evidence": uploaded["url"]}
        args.record.write_text(json.dumps(record), encoding="utf-8")

    assert call(f'/api/events/{record["event"]}')["event"]["bay"] == record["marker"]
    assert call(record["evidence"]) == record["marker"].encode()
    device = call(f'/api/device-bridges/{record["device"]}', admin=True)["device"]
    assert device["hasPassword"] and device["name"] == record["marker"]
    assert call("/api/device-bridges/", admin=True)["bindings"][0] == record["device"]
    assert call("/api/admin/platform-settings", admin=True)["settings"]["publicWriteRateLimitPerMinute"] == 23
    label = "after container recreation" if args.check_persistence else "after writes"
    print(f"PASS: event, evidence file, encrypted device registry, wall bindings and settings {label}")


if __name__ == "__main__":
    main()
