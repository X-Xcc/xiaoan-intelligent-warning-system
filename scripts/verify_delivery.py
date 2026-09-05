from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


NPM_CMD = ["cmd", "/d", "/s", "/c"]


ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = ROOT / ".codex" / "delivery-verify"
WORK_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = WORK_DIR / "delivery-verify.db"
if DB_PATH.exists():
    DB_PATH.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["CICSIC_ALLOW_SQLITE_TESTS"] = "1"


def run(cmd: list[str]) -> None:
    print(f"[run] {' '.join(cmd)}")
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    run([sys.executable, "scripts/verify_real_data_surfaces.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_event_flow.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_alarm_push_flow.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_http_alarm_api.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_security_detection_integration.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_security_detection_http_api.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_multi_market_linkage.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_security_video_ai_routes.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_security_ops.py"])
    run([str(ROOT / "server" / ".venv-runtime" / "Scripts" / "python.exe"), "scripts/verify_yolo_bridge_copy.py"])
    run(NPM_CMD + ["npm run dashboard:build"])
    run(NPM_CMD + ["npm run miniprogram:build:weapp"])
    run(NPM_CMD + ["npm run miniprogram:build:alipay"])


if __name__ == "__main__":
    main()
