"""Create explicit local business credentials without changing migrated accounts.

Run inside the API process, using its existing DATABASE_URL, after the API has
initialized the schema. On Windows, the native restore script creates the
private directory with an ACL limited to the installing user and SYSTEM first.
On Linux, create a private persistent directory first:

    mkdir -m 700 /private/accounts
    python -m app.services.deployment_accounts --output /private/accounts/users.json

Opt in to separate field accounts with repeated --field-staff EXACT_PATROL_ID.
No staff are created, and no role is inferred from a name or existing UserRole.
Repeat the SAME arguments to validate an existing report, without rotating tokens.
The JSON contains get/set/clear instructions for the existing command UI.

A separate report provisions the YOLO notifier's source:ingest service key:

    python -m app.services.deployment_accounts --source-key-output /private/accounts/source-key.json

Restore helpers may call initialize_source_access_key(path) and read
report["serviceKey"]["secret"] into the detector's CICSIC_REVIEW_API_KEY.
The HTTP header is X-Service-Key. This report never rewrites business accounts.
Use the API's same CICSIC_ACCESS_KEY_PEPPER. Existing keys and governance settings
are preserved; creating a key does not enable or disable source authentication.

This is a local operator tool, not a login endpoint, WeChat identity migration,
or a replacement for the system-management token. Keep the report out of Git,
web roots, logs and shared folders; distribute each token only to its operator.
The report and its directory entry are fsynced before the DB transaction commits.
Write failures roll back new rows. A completed report is retained on a commit
error, because the server may have committed before a connection was lost.
After an interrupted run, rerun unchanged to validate; on mismatch, preserve the
report and reconcile the database manually. Never delete the report blindly.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys


SCHEMA_VERSION = 1
MAX_REPORT_BYTES = 1024 * 1024
COMMAND_ROLES = ["intake", "dispatch", "analyze", "audit"]
USER_ROLES = {
    "command": {
        "role": "deployment-command", "display_name": "Deployment command",
        "permissions_json": ["dispatch", "review", "track", "plan", "notify", "analyze"],
    },
    "field": {
        "role": "deployment-field", "display_name": "Deployment field",
        "permissions_json": ["dispatch", "review", "track", "view_progress"],
    },
}
USAGE = {
    "read": "Load accounts[*].token from this private JSON into memory. Do not print it.",
    "set": (
        "Use the existing Command Operations access-token login. For a trusted local "
        "client on the application origin: sessionStorage.setItem('command-token', token); "
        "location.reload(); where token is the selected account's private token."
    ),
    "get": (
        "const token = sessionStorage.getItem('command-token'); "
        "GET /api/auth/me and GET /api/command/me with Authorization: Bearer <token>."
    ),
    "clear": "sessionStorage.removeItem('command-token'); location.reload();",
    "write": (
        "Use the normal command UI or POST /api/command/intakes with a unique requestId, "
        "transcript and bay. Later actions require requestId and current expectedVersion. "
        "All requests use Authorization: Bearer <token>; never put tokens in URLs."
    ),
    "field": (
        "Select the separate field account by exact staffId. Field access is limited "
        "to assigned events; the command account has no field role."
    ),
    "security": (
        "These are dedicated local bearer credentials, not WeChat login credentials "
        "or system-management tokens. No demo mode is enabled. Use HTTPS off-host, "
        "keep this report private, and never paste tokens into shared terminals or logs."
    ),
}
SOURCE_KEY_NAME = "Deployment YOLO source ingest"
SOURCE_KEY_SCOPES = ["source:ingest"]
SOURCE_KEY_USAGE = {
    "environment": "CICSIC_REVIEW_API_KEY",
    "header": "X-Service-Key",
    "endpoint": "/api/security-ai/yolo-reviews",
    "security": (
        "Server-to-server only. Read serviceKey.secret into the detector environment "
        "without printing it. Never include it in browser config, URLs or Git. "
        "Initialize with the API's CICSIC_ACCESS_KEY_PEPPER. This tool does not change "
        "sourceAuthEnabled or any other governance setting."
    ),
}


class DeploymentAccountsError(RuntimeError):
    """An operator-safe error: never include SQL, credentials or report contents."""


def _staff_ids(values):
    if isinstance(values, (str, bytes)):
        raise DeploymentAccountsError("Use explicit --field-staff identifiers, not names.")
    values = list(values)
    if any(not isinstance(value, str) or not value or value != value.strip()
           or len(value) > 64 or any(ord(char) < 32 for char in value) for value in values):
        raise DeploymentAccountsError("Each --field-staff must be an exact nonempty PatrolStaff.id.")
    if len(set(values)) != len(values):
        raise DeploymentAccountsError("Duplicate --field-staff identifiers are not allowed.")
    return sorted(values)


@contextmanager
def _private_directory(output):
    path = Path(output).absolute()
    for parent in (path.parent, *path.parent.parents):
        metadata = parent.lstat()
        if (not stat.S_ISDIR(metadata.st_mode)
                or getattr(metadata, "st_file_attributes", 0) & 0x400):
            raise DeploymentAccountsError("Output ancestors must be real directories, not symlinks.")
    if os.name == "nt":
        if not path.parent.is_dir():
            raise DeploymentAccountsError("Private output parent must exist before account initialization.")
        # The native PowerShell restore entry point creates a protected NTFS ACL.
        yield path.parent, path.name
        return
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        metadata = os.fstat(directory)
        if metadata.st_uid != os.geteuid() or stat.S_IMODE(metadata.st_mode) != 0o700:
            raise DeploymentAccountsError("Output parent must be owned by this user with mode 0700.")
        yield directory, path.name
    finally:
        os.close(directory)


def _check_file(metadata):
    basic_private_file = (stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1
                          and not (getattr(metadata, "st_file_attributes", 0) & 0x400))
    if not basic_private_file:
        raise DeploymentAccountsError("Output must be a private, owned, single-link regular file.")
    if os.name == "posix" and (metadata.st_uid != os.geteuid() or stat.S_IMODE(metadata.st_mode) != 0o600):
        raise DeploymentAccountsError("Output must be a private, owned, single-link 0600 regular file.")


def _unique_json(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise DeploymentAccountsError("Existing output contains duplicate JSON keys.")
        result[key] = value
    return result


def _read_report(directory, name):
    if isinstance(directory, Path):
        path = directory / name
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            return None
        _check_file(metadata)
        with path.open("rb") as stream:
            content = stream.read(MAX_REPORT_BYTES + 1)
        if len(content) > MAX_REPORT_BYTES:
            raise DeploymentAccountsError("Existing output exceeds the supported report size.")
        return json.loads(content, object_pairs_hook=_unique_json)
    try:
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    except FileNotFoundError:
        return None
    with os.fdopen(descriptor, "rb") as stream:
        _check_file(os.fstat(stream.fileno()))
        content = stream.read(MAX_REPORT_BYTES + 1)
    if len(content) > MAX_REPORT_BYTES:
        raise DeploymentAccountsError("Existing output exceeds the supported report size.")
    return json.loads(content, object_pairs_hook=_unique_json)


def _write_report(directory, name, report):
    content = (json.dumps(report, indent=2, ensure_ascii=True) + "\n").encode("utf-8")
    if len(content) > MAX_REPORT_BYTES:
        raise DeploymentAccountsError("Requested account report is too large.")
    if isinstance(directory, Path):
        path = directory / name
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_BINARY, 0o600)
        identity = os.fstat(descriptor)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                _check_file(os.fstat(stream.fileno()))
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        except BaseException:
            if path.exists():
                current = path.stat()
                if (current.st_dev, current.st_ino) == (identity.st_dev, identity.st_ino):
                    path.unlink()
            raise
        return
    descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=directory)
    identity = os.fstat(descriptor)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            _check_file(os.fstat(stream.fileno()))
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.fsync(directory)
    except BaseException:
        # Only remove the exact file this invocation created, never a replacement.
        current = os.stat(name, dir_fd=directory, follow_symlinks=False)
        if (current.st_dev, current.st_ino) == (identity.st_dev, identity.st_ino):
            os.unlink(name, dir_fd=directory)
        raise


def _check_schema(connection, models, *, model_types=None):
    from sqlalchemy import inspect, UniqueConstraint

    inspector = inspect(connection)
    for model in (model_types if model_types is not None else
                  (models.WechatUser, models.UserRole, models.CommandPrincipal, models.PatrolStaff)):
        table = model.__table__
        message = f"Database schema mismatch for {table.name}; initialize/upgrade the API first."
        if not inspector.has_table(table.name):
            raise DeploymentAccountsError(message)
        columns = {column["name"]: column for column in inspector.get_columns(table.name)}
        if set(columns) != set(table.columns.keys()):
            raise DeploymentAccountsError(message)
        for expected in table.columns:
            actual = columns[expected.name]
            if (not isinstance(actual["type"], type(expected.type))
                    or getattr(actual["type"], "length", None) != getattr(expected.type, "length", None)
                    or actual["nullable"] != expected.nullable):
                raise DeploymentAccountsError(message)
        if set(inspector.get_pk_constraint(table.name)["constrained_columns"]) != {
            column.name for column in table.primary_key
        }:
            raise DeploymentAccountsError(message)
        actual_foreign_keys = {
            (tuple(key["constrained_columns"]), key["referred_table"], tuple(key["referred_columns"]))
            for key in inspector.get_foreign_keys(table.name)
        }
        expected_foreign_keys = {
            ((key.parent.name,), key.column.table.name, (key.column.name,))
            for key in table.foreign_keys
        }
        if actual_foreign_keys != expected_foreign_keys:
            raise DeploymentAccountsError(message)
        actual_unique = {tuple(key["column_names"]) for key in inspector.get_unique_constraints(table.name)}
        actual_unique.update(tuple(key["column_names"]) for key in inspector.get_indexes(table.name)
                             if key.get("unique"))
        expected_unique = {tuple(column.name for column in key.columns) for key in table.constraints
                           if isinstance(key, UniqueConstraint)}
        if actual_unique != expected_unique:
            raise DeploymentAccountsError(message)


def _check_staff(session, models, identifiers):
    from sqlalchemy import select

    for identifier in identifiers:
        staff = session.scalar(select(models.PatrolStaff).where(
            models.PatrolStaff.id == identifier).with_for_update())
        if staff is None:
            raise DeploymentAccountsError("A requested PatrolStaff.id does not exist; no accounts created.")


def _check_existing(session, models, report, identifiers):
    from sqlalchemy import select

    message = "Existing output does not match the requested accounts/database; nothing was changed."
    if (not isinstance(report, dict) or set(report) != {"schemaVersion", "createdAt", "accounts", "usage"}
            or type(report["schemaVersion"]) is not int or report["schemaVersion"] != SCHEMA_VERSION
            or report["usage"] != USAGE or not isinstance(report["createdAt"], str)):
        raise DeploymentAccountsError(message)
    try:
        if datetime.fromisoformat(report["createdAt"]).tzinfo is None:
            raise ValueError
    except ValueError:
        raise DeploymentAccountsError(message) from None
    accounts = report["accounts"]
    if not isinstance(accounts, list) or len(accounts) != len(identifiers) + 1:
        raise DeploymentAccountsError(message)
    seen_ids, seen_tokens = set(), set()
    for account, staff_id in zip(accounts, [None, *identifiers]):
        kind = "command" if staff_id is None else "field"
        roles = COMMAND_ROLES if kind == "command" else ["field"]
        if (not isinstance(account, dict) or set(account) != {"kind", "openid", "token", "roles", "staffId"}
                or account["kind"] != kind or account["staffId"] != staff_id or account["roles"] != roles
                or not isinstance(account["openid"], str)
                or not re.fullmatch(r"deployment-[a-f0-9]{32}", account["openid"])
                or not isinstance(account["token"], str)
                or not re.fullmatch(r"[A-Za-z0-9_-]{64}", account["token"])):
            raise DeploymentAccountsError(message)
        if account["openid"] in seen_ids or account["token"] in seen_tokens:
            raise DeploymentAccountsError(message)
        seen_ids.add(account["openid"])
        seen_tokens.add(account["token"])
        user = session.get(models.WechatUser, account["openid"])
        role = session.get(models.UserRole, account["openid"])
        principal = session.get(models.CommandPrincipal, account["openid"])
        owners = session.scalars(select(models.WechatUser.openid).where(
            models.WechatUser.token == account["token"])).all()
        if (not user or owners != [account["openid"]] or not secrets.compare_digest(user.token, account["token"])
                or user.unionid is not None or user.session_key is not None
                or user.created_at != report["createdAt"] or not role
                or any(getattr(role, key) != value for key, value in USER_ROLES[kind].items())
                or role.createdAt != report["createdAt"] or not principal
                or principal.enabled is not True or principal.roles_json != roles or principal.staffId != staff_id):
            raise DeploymentAccountsError(message)


def _create_accounts(session, models, identifiers):
    from sqlalchemy import select

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    accounts = []
    for staff_id in [None, *identifiers]:
        kind = "command" if staff_id is None else "field"
        openid, token = "deployment-" + secrets.token_hex(16), secrets.token_urlsafe(48)
        # Never call the auth upsert helpers: their role inference/rotation is unwanted here.
        if (any(session.get(model, openid) is not None for model in
                (models.WechatUser, models.UserRole, models.CommandPrincipal))
                or session.scalar(select(models.WechatUser.openid).where(models.WechatUser.token == token))):
            raise DeploymentAccountsError("Generated identity/token collision; no accounts created.")
        roles = list(COMMAND_ROLES) if kind == "command" else ["field"]
        session.add(models.WechatUser(openid=openid, token=token, unionid=None, session_key=None,
                                      created_at=stamp, last_login_at=stamp))
        session.flush()
        session.add(models.UserRole(openid=openid, **USER_ROLES[kind], createdAt=stamp, updatedAt=stamp))
        session.add(models.CommandPrincipal(openid=openid, roles_json=roles, staffId=staff_id, enabled=True))
        session.flush()
        accounts.append({"kind": kind, "openid": openid, "token": token, "roles": roles, "staffId": staff_id})
    return {"schemaVersion": SCHEMA_VERSION, "createdAt": stamp, "accounts": accounts, "usage": dict(USAGE)}


def initialize_accounts(output: str | Path, *, field_staff_ids=()) -> dict:
    """Create or validate one private report. Return counts/status only, never tokens."""
    try:
        identifiers = _staff_ids(field_staff_ids)
        with _private_directory(output) as (directory, name):
            # Import lazily so CLI help works even if DATABASE_URL is absent/invalid.
            from app.services.database import DB_LOCK, SessionLocal
            from app.services import models

            with DB_LOCK, SessionLocal() as session:
                with session.begin():
                    _check_schema(session.connection(), models)
                    _check_staff(session, models, identifiers)
                    report = _read_report(directory, name)
                    created = report is None
                    if created:
                        report = _create_accounts(session, models, identifiers)
                        _write_report(directory, name, report)
                    else:
                        _check_existing(session, models, report, identifiers)
        return {"created": created, "commandAccounts": 1, "fieldAccounts": len(identifiers)}
    except DeploymentAccountsError:
        raise
    except Exception:
        # SQLAlchemy errors may carry INSERT parameters or a connection URL.
        raise DeploymentAccountsError(
            "Account initialization failed. Check database/schema and private output permissions. "
            "If a complete report exists, keep it and rerun unchanged to verify; "
            "on mismatch reconcile manually. Credentials and raw errors are not logged."
        ) from None


def _create_source_key(session, models, control):
    from sqlalchemy import select

    key_id = "sak-" + secrets.token_hex(16)
    secret = "cicsic_" + secrets.token_urlsafe(48)
    key_hash = control._hash_access_key(secret)
    if (session.get(models.ServiceAccessKey, key_id) is not None
            or session.scalar(select(models.ServiceAccessKey.keyId).where(
                models.ServiceAccessKey.keyHash == key_hash))):
        raise DeploymentAccountsError("Generated service key collision; no key created.")
    stamp = control._now()
    # create_access_key() commits its own session; keep file/row failure handling together.
    session.add(models.ServiceAccessKey(
        keyId=key_id, name=SOURCE_KEY_NAME, keyPrefix=secret[:16] + "...",
        keyHash=key_hash, scopes_json=list(SOURCE_KEY_SCOPES), status="active",
        expiresAt=None, lastUsedAt=None, createdAt=stamp, updatedAt=stamp,
    ))
    session.flush()
    return {
        "schemaVersion": SCHEMA_VERSION, "purpose": "yolo-source-ingest", "createdAt": stamp,
        "serviceKey": {"keyId": key_id, "secret": secret, "scopes": list(SOURCE_KEY_SCOPES)},
        "usage": dict(SOURCE_KEY_USAGE),
    }


def _check_source_key(session, models, control, report):
    message = "Existing source-key report/database does not match; no key or permission was changed."
    if (not isinstance(report, dict)
            or set(report) != {"schemaVersion", "purpose", "createdAt", "serviceKey", "usage"}
            or type(report["schemaVersion"]) is not int or report["schemaVersion"] != SCHEMA_VERSION
            or report["purpose"] != "yolo-source-ingest" or report["usage"] != SOURCE_KEY_USAGE
            or not isinstance(report["createdAt"], str)):
        raise DeploymentAccountsError(message)
    try:
        datetime.fromisoformat(report["createdAt"])
    except ValueError:
        raise DeploymentAccountsError(message) from None
    key = report["serviceKey"]
    if (not isinstance(key, dict) or set(key) != {"keyId", "secret", "scopes"}
            or not isinstance(key["keyId"], str) or not re.fullmatch(r"sak-[a-f0-9]{32}", key["keyId"])
            or not isinstance(key["secret"], str) or not re.fullmatch(r"cicsic_[A-Za-z0-9_-]{64}", key["secret"])
            or key["scopes"] != SOURCE_KEY_SCOPES):
        raise DeploymentAccountsError(message)
    row = session.get(models.ServiceAccessKey, key["keyId"])
    # verify_access_key() writes lastUsedAt and commits; validation must remain read-only.
    if (not row or row.name != SOURCE_KEY_NAME or row.keyPrefix != key["secret"][:16] + "..."
            or not secrets.compare_digest(row.keyHash, control._hash_access_key(key["secret"]))
            or row.scopes_json != SOURCE_KEY_SCOPES or row.status != "active"
            or row.expiresAt is not None or row.createdAt != report["createdAt"]):
        raise DeploymentAccountsError(message)


def initialize_source_access_key(output: str | Path) -> dict:
    """Create/validate a separate 0600 notifier report; return status only, never secrets."""
    try:
        with _private_directory(output) as (directory, name):
            from app.services.database import DB_LOCK, SessionLocal
            from app.services import models, system_control

            with DB_LOCK, SessionLocal() as session:
                with session.begin():
                    _check_schema(session.connection(), models, model_types=(models.ServiceAccessKey,))
                    report = _read_report(directory, name)
                    created = report is None
                    if created:
                        report = _create_source_key(session, models, system_control)
                        _write_report(directory, name, report)
                    else:
                        _check_source_key(session, models, system_control, report)
        return {"created": created, "serviceKeys": 1}
    except DeploymentAccountsError:
        raise
    except Exception:
        raise DeploymentAccountsError(
            "Source-key initialization failed. Check database/schema, API pepper and private output permissions. "
            "Keep any complete report for unchanged retry or manual reconciliation. Secrets are not logged."
        ) from None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    output = parser.add_mutually_exclusive_group(required=True)
    output.add_argument("--output", help="Business-account JSON in an existing owned 0700 directory")
    output.add_argument("--source-key-output", help="Separate source:ingest JSON in an owned 0700 directory")
    parser.add_argument("--field-staff", action="append", default=[], metavar="PATROL_STAFF_ID",
                        help="Explicit existing PatrolStaff.id; repeat for separate field accounts")
    arguments = parser.parse_args(argv)
    if arguments.source_key_output and arguments.field_staff:
        parser.error("--field-staff applies only to --output business accounts")
    try:
        result = (initialize_source_access_key(arguments.source_key_output) if arguments.source_key_output else
                  initialize_accounts(arguments.output, field_staff_ids=arguments.field_staff))
    except DeploymentAccountsError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    action = "created" if result["created"] else "verified"
    if arguments.source_key_output:
        print(f"Service key {action}: source:ingest. Credentials are only in the private JSON.")
    else:
        print(f"Accounts {action}: "
              f"1 command, {result['fieldAccounts']} field. Credentials are only in the private JSON.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
