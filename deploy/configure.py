"""Create per-install credentials without replacing an existing deployment."""
from __future__ import annotations

import argparse
import ipaddress
import os
from pathlib import Path
import re
import secrets


def read_config(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or key in values:
            raise ValueError("Invalid or duplicate setting in deploy/.env")
        values[key] = value
    return values


def validate(values: dict[str, str]) -> None:
    for key in ("POSTGRES_PASSWORD", "CICSIC_ADMIN_TOKEN"):
        if not re.fullmatch(r"[a-f0-9]{64}", values.get(key, "")):
            raise ValueError(f"{key} must be a generated 64-character hex value; existing file was not changed")
    if not values.get("WEB_PORT", "").isdigit() or not 1024 <= int(values["WEB_PORT"]) <= 65535:
        raise ValueError("WEB_PORT must be between 1024 and 65535")
    try:
        ipaddress.IPv4Address(values.get("WEB_BIND", ""))
    except ValueError:
        raise ValueError("WEB_BIND must be an IPv4 address") from None


def configure(directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / ".env"
    if path.exists():
        validate(read_config(path))
        return path
    content = (
        "# Private deployment configuration. Keep this file with your backups.\n"
        "WEB_BIND=127.0.0.1\n"
        "WEB_PORT=8080\n"
        f"POSTGRES_PASSWORD={secrets.token_hex(32)}\n"
        f"CICSIC_ADMIN_TOKEN={secrets.token_hex(32)}\n"
    )
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        validate(read_config(path))
        return path
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(content)
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    try:
        configure(args.directory)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Configuration failed: {exc}\n")
    print("Deployment configuration is ready. Existing credentials were preserved.")
