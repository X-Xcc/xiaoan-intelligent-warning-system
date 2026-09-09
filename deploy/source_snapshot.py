"""Read-only logical database and file snapshot for private machine migration."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
from urllib.parse import unquote, urlsplit

API_SETTINGS = {
    "CICSIC_ACCESS_KEY_PEPPER", "CICSIC_ADMIN_TOKEN_PEPPER",
    "SECURITY_VLM_BASE_URL", "SECURITY_VLM_API_KEY", "SECURITY_VLM_MODEL",
    "WECHAT_APPID", "WECHAT_APP_SECRET", "DB_ADMIN_USER", "DB_ADMIN_PASSWORD",
}
DETECTOR_SETTINGS = {
    "API_KEY", "ADMIN_USERNAME", "ADMIN_PASSWORD", "JWT_SECRET", "CAM_PASSWORD",
}


def read_env(path: Path) -> dict[str, str]:
    result = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, separator, value = line.partition("=")
            if separator:
                result[key.strip()] = value.strip().strip("'\"")
    return result


def private_json(path: Path, value) -> None:
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600),
                   "w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)


def checked_run(arguments, *, env=None, input=None):
    process = subprocess.run(arguments, env=env, input=input, capture_output=True)
    if process.returncode:
        raise RuntimeError(f"{Path(str(arguments[0])).name} failed; credentials and diagnostics withheld")
    return process.stdout.decode("utf-8").strip()


def pg_environment(database_url: str) -> dict[str, str]:
    url = urlsplit(database_url.replace("postgresql+psycopg://", "postgresql://"))
    if url.scheme not in ("postgresql", "postgres") or not url.hostname or not url.path.strip("/"):
        raise ValueError("An explicit PostgreSQL source URL is required")
    return dict(os.environ, PGHOST=url.hostname, PGPORT=str(url.port or 5432),
                PGDATABASE=unquote(url.path[1:]), PGUSER=unquote(url.username or ""),
                PGPASSWORD=unquote(url.password or ""), PGCONNECT_TIMEOUT="10",
                PGOPTIONS="-c default_transaction_read_only=on")


def copy_stable_tree(source: Path, target: Path) -> dict[str, int]:
    if not source.exists():
        target.mkdir(parents=True, exist_ok=True, mode=0o700)
        return {"files": 0, "bytes": 0}
    if source.is_symlink() or not source.is_dir():
        raise ValueError("Snapshot roots must be real directories")
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    count = total = 0
    for path in sorted(source.rglob("*")):
        if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
            raise ValueError("Snapshot input contains a link; select its real source explicitly")
        relative = path.relative_to(source)
        destination = target / relative
        before = path.stat()
        if stat.S_ISDIR(before.st_mode):
            destination.mkdir(parents=True, exist_ok=True, mode=0o700)
            continue
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("Snapshot input contains a special file")
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        shutil.copyfile(path, destination)
        destination.chmod(0o600)
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise RuntimeError("Source file changed during backup; retry when writes are paused")
        count += 1
        total += after.st_size
    return {"files": count, "bytes": total}


def snapshot(root: Path, output: Path, pg_bin: Path, *, environment=None,
             detector_root: Path | None = None, include_training=False) -> dict:
    root = root.resolve(strict=True)
    output = output.resolve()
    if output.exists() or output == root or root in output.parents:
        raise ValueError("Use a new private output directory outside the source project")
    values = {}
    for relative in (".env", "server/.env", ".env.local", "server/.env.local"):
        values.update(read_env(root / relative))
    if environment:
        values.update(environment)
    pg_env = pg_environment(values.get("DATABASE_URL", ""))
    suffix = ".exe" if os.name == "nt" else ""
    psql = str(pg_bin / ("psql" + suffix))
    pg_dump = str(pg_bin / ("pg_dump" + suffix))
    def sql(query):
        return checked_run([psql, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query],
                           env=pg_env)
    version = sql("show server_version_num")
    tables = sql("select tablename from pg_tables where schemaname='public' order by tablename").splitlines()
    def counts():
        return {table: int(sql('select count(*) from public."' + table.replace('"', '""') + '"'))
                for table in tables}
    before_counts = counts()
    output.mkdir(parents=True, mode=0o700)
    try:
        checked_run([pg_dump, "--format=custom", "--no-owner", "--no-acl",
                     "--file", str(output / "database.dump")], env=pg_env)
        (output / "database.dump").chmod(0o600)
        paths = {
            "evidence": Path(values.get("CICSIC_EVIDENCE_DIR") or root / "server/data/event-evidence"),
            "bridge": Path(values.get("CICSIC_BRIDGE_DATA_DIR") or root / "server/.secrets/device-bridges"),
        }
        file_counts = {name: copy_stable_tree(path, output / name) for name, path in paths.items()}
        detection_dirs = (values.get("SECURITY_DETECTION_DATA_DIRS") or str(root / "server/security-data")).split(os.pathsep)
        for index, directory in enumerate(detection_dirs):
            file_counts[f"detection-{index}"] = copy_stable_tree(Path(directory), output / "detections" / str(index))
        browser = read_env(root / "apps/dashboard/.env.production")
        runtime = {"api": {key: values[key] for key in API_SETTINGS if values.get(key)},
                   "browser": {key: browser[key] for key in ("VITE_AMAP_KEY", "VITE_AMAP_SECURITY_JS_CODE")
                               if browser.get(key)},
                   "miniprogram": read_env(root / "apps/miniprogram/.env.production")}
        if detector_root is not None:
            detector_root = detector_root.resolve(strict=True)
            runtime["detector"] = {key: value for key, value in read_env(detector_root / ".env").items()
                                   if key in DETECTOR_SETTINGS}
            file_counts["detector-data"] = copy_stable_tree(detector_root / "server/data", output / "detector-data")
            file_counts["detector-results"] = copy_stable_tree(detector_root / "results", output / "detector-results")
            private_config = output / "detector-config"
            private_config.mkdir(mode=0o700)
            cameras = detector_root / "server/detection/cameras.json"
            if not cameras.is_file():
                raise ValueError("Authoritative detector camera configuration is missing")
            json.loads(cameras.read_text(encoding="utf-8-sig"))
            shutil.copyfile(cameras, private_config / "cameras.json")
            for relative, name in (("detection/cameras.json", "original-python-cameras.txt"),
                                   ("detection/thresholds.json", "thresholds.json"),
                                   ("server/bin/go2rtc.yaml", "original-go2rtc.yaml")):
                path = detector_root / relative
                if path.is_file():
                    shutil.copyfile(path, private_config / name)
            file_counts["detector-models"] = copy_stable_tree(detector_root / "models", output / "detector-models")
            if include_training:
                file_counts["training-datasets"] = copy_stable_tree(detector_root / "detection/datasets", output / "training" / "datasets")
                file_counts["training-runs"] = copy_stable_tree(detector_root / "runs", output / "training" / "runs")
        if counts() != before_counts:
            raise RuntimeError("Source row counts changed while exporting; retry during a quiet period")
        metadata = {"version": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
                    "postgresVersion": int(version), "tables": before_counts, "files": file_counts,
                    "trainingIncluded": include_training}
        private_json(output / "runtime.json", runtime)
        private_json(output / "snapshot.json", metadata)
        return metadata
    except BaseException:
        # Preserve partial private snapshots for inspection, but never mark them complete.
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pg-bin", type=Path, required=True)
    parser.add_argument("--detector-root", type=Path)
    parser.add_argument("--include-training", action="store_true")
    args = parser.parse_args()
    try:
        metadata = snapshot(args.source_root, args.output, args.pg_bin,
                            detector_root=args.detector_root, include_training=args.include_training)
    except Exception as error:
        parser.exit(1, f"Snapshot failed: {type(error).__name__}. No source was modified.\n")
    print(json.dumps({"tables": len(metadata["tables"]), "rows": sum(metadata["tables"].values()),
                      "files": sum(group["files"] for group in metadata["files"].values())}))


if __name__ == "__main__":
    main()
