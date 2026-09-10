"""Restore verified private files into a fresh Windows-native deployment, then verify the database."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil

from source_snapshot import API_SETTINGS, DETECTOR_SETTINGS, copy_stable_tree
from configure import read_config


def dotenv(values: dict[str, str]) -> str:
    lines = ["# Private restored settings. Do not upload or share this file."]
    for key, value in sorted(values.items()):
        if not key.replace("_", "").isalnum() or not isinstance(value, str) or any(c in value for c in "\r\n\0"):
            raise ValueError("Invalid runtime setting")
        lines.append(key + "=" + json.dumps(value, ensure_ascii=False).replace("$", "$$"))
    return "\n".join(lines) + "\n"


def runtime_settings(payload: Path, server: Path | None = None) -> tuple[dict, dict]:
    values = json.loads((payload / "runtime.json").read_text(encoding="utf-8"))
    api = {key: value for key, value in values.get("api", {}).items() if key in API_SETTINGS}
    browser = values.get("browser", {})
    for original, restored in (("VITE_AMAP_KEY", "XIAOAN_AMAP_KEY"),
                               ("VITE_AMAP_SECURITY_JS_CODE", "XIAOAN_AMAP_SECURITY_JS_CODE")):
        if browser.get(original):
            api[restored] = browser[original]
    detection_dirs = sorted((payload / "detections").iterdir()) if (payload / "detections").exists() else []
    if detection_dirs and server is not None:
        api["SECURITY_DETECTION_DATA_DIRS"] = os.pathsep.join(
            str(server / "security-data" / directory.name) for directory in detection_dirs
        )
    detector = {key: value for key, value in values.get("detector", {}).items() if key in DETECTOR_SETTINGS}
    return api, detector


def empty_directory(path: Path) -> None:
    if path.is_symlink() or (path.exists() and (not path.is_dir() or any(path.iterdir()))):
        raise ValueError("Restore target is not empty; nothing may be overwritten")


def file_mapping(server: Path, detector: Path) -> dict[str, Path]:
    return {
        "evidence": server / "data/event-evidence",
        "bridge": server / ".secrets/device-bridges",
        "detections": server / "security-data",
        "detector-data": detector / "data",
        "detector-config": detector / "runtime",
        "detector-models": detector / "models",
        "detector-results": detector / "results",
        "training/datasets": detector / "detection/datasets",
        "training/runs": detector / "runs",
    }


def install_files(payload: Path, setup: Path, server: Path, detector: Path) -> dict:
    metadata = json.loads((payload / "snapshot.json").read_text())
    if metadata.get("version") != 1 or not (payload / "database.dump").is_file():
        raise ValueError("Unsupported or incomplete snapshot")
    mapping = file_mapping(server, detector)
    api_values, detector_values = runtime_settings(payload, server)
    rendered = {"runtime.env": dotenv(api_values), "detector.env": dotenv(detector_values)}
    for destination in mapping.values():
        empty_directory(destination)
    for name in rendered:
        current = setup / name
        if current.exists() and any(line.strip() and not line.startswith("#") for line in current.read_text().splitlines()):
            raise ValueError("Existing private settings must not be overwritten")
    restored = {}
    for relative, destination in mapping.items():
        restored[relative] = copy_stable_tree(payload / relative, destination)
        if os.name == "posix":
            for item in (destination, *destination.rglob("*")):
                if os.geteuid() == 0:
                    os.chown(item, 10001, 10001)
    for name, content in rendered.items():
        temporary = setup / (name + ".restoring")
        with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600),
                       "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
        os.replace(temporary, setup / name)
    return restored


def verify_files(payload: Path, server: Path, detector: Path) -> dict:
    count = total = 0
    for relative, destination in file_mapping(server, detector).items():
        source = payload / relative
        expected = {path.relative_to(source): path for path in source.rglob("*") if path.is_file()}
        actual = {path.relative_to(destination): path for path in destination.rglob("*") if path.is_file()}
        if set(expected) != set(actual):
            raise ValueError("Restored file list differs from the private snapshot")
        for name, original in expected.items():
            copied = actual[name]
            if copied.is_symlink() or original.stat().st_size != copied.stat().st_size:
                raise ValueError("Restored file metadata differs")
            with original.open("rb") as first, copied.open("rb") as second:
                if hashlib.file_digest(first, "sha256").digest() != hashlib.file_digest(second, "sha256").digest():
                    raise ValueError("Restored file checksum differs")
            count += 1
            total += copied.stat().st_size
    return {"files": count, "bytes": total}


def verify_database(payload: Path) -> dict:
    import psycopg
    from psycopg import sql
    metadata = json.loads((payload / "snapshot.json").read_text())
    url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(url, options="-c default_transaction_read_only=on") as connection:
        with connection.cursor() as cursor:
            cursor.execute("select tablename from pg_tables where schemaname='public'")
            tables = {row[0] for row in cursor.fetchall()}
            if tables != set(metadata["tables"]):
                raise ValueError("Restored table list differs from snapshot")
            for table, expected in metadata["tables"].items():
                cursor.execute(sql.SQL("select count(*) from {}").format(sql.Identifier("public", table)))
                if cursor.fetchone()[0] != expected:
                    raise ValueError("Restored row counts differ from snapshot")
    return {"tables": len(tables), "rows": sum(metadata["tables"].values())}


def connect_detector(setup: Path, key_report: Path) -> None:
    report = json.loads(key_report.read_text(encoding="utf-8"))
    settings = {
        "CICSIC_REVIEW_API_KEY": report["serviceKey"]["secret"],
        "CICSIC_REVIEW_URL": os.getenv("XIAOAN_API_BASE_URL", "http://127.0.0.1:8010").rstrip("/")
        + "/api/security-ai/yolo-reviews",
        "CICSIC_REVIEW_ENABLED": "true",
    }
    path = setup / "detector.env"
    current = read_config(path)
    for key, value in settings.items():
        if key in current and current[key] not in (value, json.dumps(value)):
            raise ValueError("Existing detector linkage settings differ; refusing to replace them")
    missing = {key: value for key, value in settings.items() if key not in current}
    if missing:
        with path.open("a", encoding="utf-8", newline="\n") as stream:
            stream.write("\n" + dotenv(missing))


def provision() -> dict:
    from app.services.database import SessionLocal
    from app.services.models import PatrolStaff
    from app.services.deployment_accounts import initialize_accounts, initialize_source_access_key
    from sqlalchemy import select
    directory = Path(os.getenv("XIAOAN_DEPLOYMENT_ACCOUNTS_DIR", "/app/server/.secrets/deployment-accounts"))
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with SessionLocal() as session:
        identifiers = list(session.scalars(select(PatrolStaff.id)).all())
    result = initialize_accounts(directory / "accounts.json", field_staff_ids=identifiers)
    source_report = directory / "source-key.json"
    initialize_source_access_key(source_report)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("files", "verify-files", "verify-db", "accounts", "connect-detector"))
    parser.add_argument("--payload", type=Path, default=Path("/payload"))
    parser.add_argument("--setup", type=Path, default=Path("/setup"))
    parser.add_argument("--server", type=Path, default=Path("/app/server"))
    parser.add_argument("--detector", type=Path, default=Path("/detector"))
    args = parser.parse_args()
    try:
        if args.action == "files":
            result = install_files(args.payload, args.setup, args.server, args.detector)
            print("PASS: private files and runtime settings restored into empty directories")
        elif args.action == "verify-files":
            result = verify_files(args.payload, args.server, args.detector)
            print(f"PASS: SHA256 matched for {result['files']} restored files")
        elif args.action == "verify-db":
            result = verify_database(args.payload)
            print(f"PASS: {result['tables']} tables and {result['rows']} rows match the snapshot")
        elif args.action == "accounts":
            provision()
            print("PASS: dedicated business accounts initialized; tokens remain in the private report")
        else:
            connect_detector(args.setup, args.server / ".secrets/deployment-accounts/source-key.json")
            print("PASS: detector linkage configured; credentials remain in private files")
    except Exception as error:
        parser.exit(1, f"Restore failed: {type(error).__name__}; private diagnostics withheld.\n")


if __name__ == "__main__":
    main()
