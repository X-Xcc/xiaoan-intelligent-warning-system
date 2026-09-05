from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

SOURCE_GLOBS = [
    "apps/miniprogram/src/**/*.ts",
    "apps/miniprogram/src/**/*.tsx",
    "apps/dashboard/src/**/*.ts",
    "apps/dashboard/src/**/*.tsx",
    "server/app/**/*.py",
    "README.md",
    "server/README.md",
]

BLOCKED_PATTERNS = [
    ("static mini-program event seed", re.compile(r"\binitialEvents\b")),
    ("dashboard fallback business data", re.compile(r"\bfallbackMarkets\b|\bfallback:\s*Overview\b")),
    ("demo business surface", re.compile(r"演示|模拟数据|本地初始数据|本地任务|/api/demo|routes\.demo|tags=\[\"demo\"\]")),
    ("fixed weather or crowd facts", re.compile(r"29°C|多云|客流稍多|今晚运行平稳")),
    ("fixed operations metric", re.compile(r"avg_response_minutes['\"]?\s*:\s*2\.1|2\.1 分钟|96%|188ms|212ms|4 个值守角色")),
    ("legacy sample event ids", re.compile(r"YS-260815-\d{3}")),
]


def iter_source_files() -> list[Path]:
    files: set[Path] = set()
    for pattern in SOURCE_GLOBS:
        files.update(ROOT.glob(pattern))
    return sorted(path for path in files if path.is_file())


def main() -> None:
    findings: list[str] = []
    for path in iter_source_files():
        rel = path.relative_to(ROOT)
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), start=1):
            for label, pattern in BLOCKED_PATTERNS:
                if pattern.search(line):
                    findings.append(f"{rel}:{line_no}: {label}: {line.strip()}")

    if findings:
        raise SystemExit("Found non-real user-facing data surfaces:\n" + "\n".join(findings))

    print("real_data_surfaces ok")


if __name__ == "__main__":
    main()
