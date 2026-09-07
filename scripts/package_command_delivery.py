"""Create a checksum manifest without copying credentials or the rehearsal database."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DELIVERY = ROOT / "deliverables/command"
SOURCES = [
    "server/app/services/command_workflow.py", "server/app/api/routes/command.py",
    "server/app/services/models.py", "server/app/services/event_store.py",
    "server/app/api/routes/events.py", "server/app/services/realtime.py",
    "server/app/services/security_linkage.py", "server/app/main.py",
    "server/app/data/command/night_market_b1_b4_v1.json",
    "server/tests/test_command_routes.py", "server/tests/test_command_workflow.py",
    "apps/dashboard/src/pages/CommandOperationsPage.tsx",
    "apps/dashboard/src/pages/DashboardApp.tsx",
    "apps/dashboard/src/pages/PoliceDomainPages.tsx",
    "apps/dashboard/src/components/command/CommandStageView.tsx",
    "apps/dashboard/src/components/command/CommandControls.tsx",
    "apps/dashboard/src/components/command/CommandVoice.tsx",
    "apps/dashboard/src/lib/command-voice.ts",
    "apps/dashboard/src/lib/command-api.ts", "apps/dashboard/src/lib/command-workflow.ts",
    "apps/dashboard/src/lib/command-scenario.ts", "apps/dashboard/src/styles/command.css",
    "apps/dashboard/vite.command.config.ts",
    "apps/miniprogram/src/features/staff/StaffCommandMaterials.tsx",
    "apps/miniprogram/src/features/staff/StaffWorkspace.tsx",
    "apps/miniprogram/src/features/staff/staff-model.ts",
    "apps/miniprogram/src/utils/api.ts", "apps/miniprogram/src/types/events.ts",
    "scripts/serve_command_demo.py", "scripts/verify_command_http.py",
    "scripts/verify_command_workflow.mjs", "scripts/verify_command_component.mjs",
    "scripts/generate_command_assets.py", "scripts/build_command_fallback.mjs",
    "scripts/build_command_backup_deck.py", "scripts/package_command_delivery.py",
    "docs/小安接处警模块交付方案.md", "docs/小安接处警实现交付记录.md",
    "docs/小安瑶瑶语音交付记录.md",
    "docs/superpowers/plans/2026-09-07-command-yaoyao-voice.md",
    "scripts/verify_command_voice.mjs", "scripts/verify_command_voice_component.mjs",
    "scripts/generate_command_voice_preview.ps1", "scripts/command-voice-preview.json",
    "apps/dashboard/src/command-release.tsx", "apps/dashboard/src/styles/command-release.css",
    "scripts/build_command_release.mjs", "scripts/deploy_command_release.py",
    "docs/小安接处警服务器发布记录-20260907.md",
]


def main():
    files = [ROOT / value for value in SOURCES]
    for directory in [ROOT / "apps/dashboard/public/command", DELIVERY / "fallback",
                      ROOT / "docs/superpowers/verification/command-2026-09-07"]:
        files.extend(path for path in directory.rglob("*") if path.is_file())
    files.append(DELIVERY / "README.md")
    entries = [{"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size,
                "sha256": sha256(path.read_bytes()).hexdigest()} for path in sorted(set(files))]
    result = {"implementationVersion": "1.1", "scenarioVersion": "1.0",
              "generatedAt": datetime.now(timezone.utc).isoformat(), "formalAcceptanceComplete": False,
              "excluded": ["credentials", "tmp/command-demo", "real police data", "browser acceptance screenshots"],
              "files": entries}
    DELIVERY.mkdir(parents=True, exist_ok=True)
    (DELIVERY / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Manifest created for {len(entries)} files; credentials and demo database excluded.")


if __name__ == "__main__":
    main()
