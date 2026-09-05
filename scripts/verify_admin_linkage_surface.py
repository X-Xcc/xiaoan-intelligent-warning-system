from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "apps" / "dashboard" / "src" / "pages" / "AdminConsolePage.tsx"
text = SOURCE.read_text(encoding="utf-8")

required_markers = {
    "alarm push acknowledgement": "/events/alarm-pushes",
    "evidence preview": "事件证据",
    "patrol route": "/events/${selectedEvent.id}/route",
    "risk detail": "风险详情",
    "drone receipt": "/security-linkage/drone-tasks/",
    "same-origin production api": "window.location.origin",
}

missing = [name for name, marker in required_markers.items() if marker not in text]
if missing:
    raise SystemExit("missing admin linkage surface: " + ", ".join(missing))

print(f"admin linkage surface markers: {len(required_markers)}/{len(required_markers)}")
