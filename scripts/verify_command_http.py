"""Network smoke test. Refuses any backend except the explicitly isolated loopback demo."""
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8021/api"


def call(method, path, payload=None, token=None, raw=None, content_type="application/json", expected=200):
    headers = {"Content-Type": content_type}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(BASE + path, data=raw if raw is not None else json.dumps(payload).encode() if payload is not None else None,
                      method=method, headers=headers)
    try:
        with urlopen(request, timeout=20) as response:
            code, content = response.status, response.read()
    except HTTPError as exc:
        code, content = exc.code, exc.read()
    assert code == expected, (path, code, content[:500])
    return json.loads(content)


def main():
    assert call("GET", "/command/config")["demoEnabled"] is True
    tokens = {role: call("POST", f"/command/demo-session/{role}")["token"] for role in ["intake", "dispatch", "field", "analysis", "screen"]}
    state = call("POST", "/command/demo-runs", {
        "requestId": uuid4().hex, "runKey": "http-verification-" + uuid4().hex,
        "scenarioId": "night_market_b1_b4", "scenarioVersion": "1.0",
    }, tokens["intake"])
    event_id = state["event"]["id"]
    audits = []

    def act(action, fields, role):
        nonlocal state
        state = call("POST", f"/command/events/{event_id}/{action}", {
            **fields, "requestId": uuid4().hex, "expectedVersion": state["command"]["version"],
        }, tokens[role])
        audits.append(state["auditId"])

    act("summary/confirm", {"summaryVersion": 1, "text": "教学消费纠纷，伤情和危险因素待现场核实",
                           "category": "消费纠纷", "dangerFactors": ["不详"]}, "intake")
    preview = call("GET", f"/command/events/{event_id}/route-preview?staffId=wang", token=tokens["dispatch"])
    assert preview["route"]["segments"][0]["estimatedSeconds"] == 180
    act("dispatch/confirm", {"staffId": "wang", "summaryVersion": 1, "locationVersion": 1}, "dispatch")
    act("dispatch", {"recommendationId": state["command"]["dispatch"]["recommendationId"]}, "dispatch")
    tasks = call("GET", "/events/staff-tasks?staff=wang", token=tokens["field"])
    assert event_id in [item["id"] for item in tasks["items"]]
    for status in ["已接收", "已到达", "处理中"]:
        act("status", {"status": status}, "field")
    act("verification", {"query": "陈XX"}, "field")
    act(f"verification/{state['command']['verification']['verificationId']}/review", {"decision": "confirmed"}, "field")
    boundary = "CommandBoundary" + uuid4().hex
    image = (ROOT / "apps/dashboard/public/command/receipts.png").read_bytes()
    raw = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"eventId\"\r\n\r\n{event_id}\r\n"
           f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"receipts.png\"\r\nContent-Type: image/png\r\n\r\n").encode()
    raw += image + f"\r\n--{boundary}--\r\n".encode()
    upload = call("POST", "/events/evidence", token=tokens["field"], raw=raw, content_type=f"multipart/form-data; boundary={boundary}")["evidence"]
    act("evidence", {"name": "8张教学小票", "kind": "image", "uploadId": upload["uploadId"],
                     "description": "HTTP联调上传原始教学图片", "discoveredAt": "2026-09-06T17:00:00Z"}, "field")
    act("handover", {"summary": "教学核验线索及材料移交", "evidenceIds": [state["command"]["evidenceIndex"][0]["evidenceId"]]}, "field")
    assert state["event"]["status"] == "处理中"
    act(f"handover/{state['command']['handover']['handoverId']}/review", {"decision": "accepted"}, "analysis")
    assert state["event"]["status"] == "处理中"
    act("status", {"status": "已完成", "result": "教学现场处置完成，移交已接收"}, "field")
    persisted = call("GET", f"/command/events/{event_id}/context", token=tokens["field"])
    assert persisted["event"]["status"] == "已完成"
    call("GET", f"/events/{event_id}", expected=404)
    print(json.dumps({"result": "passed", "eventId": event_id, "status": persisted["event"]["status"],
                      "handoverId": state["command"]["handover"]["handoverId"],
                      "version": state["command"]["version"], "auditIds": audits,
                      "uploadedBytes": len(image), "mobileTaskApiVerified": True,
                      "wechatDeviceVerified": False}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
