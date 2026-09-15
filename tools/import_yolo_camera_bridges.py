"""Import YOLO camera profiles through the running, encrypted bridge API.

Default: offline dry-run. Pass --apply to create missing profiles without login,
and --bind-empty to fill vacant slots. --token-file supports older deployments.
RTSP is the default. USB records are always skipped; --include-http-alternatives
opts into HTTP snapshot/MJPEG profiles from explicit camera records and URL fields.
--conflict-side current/incoming selects Git conflict hunks in memory only.
Application properties, disabled snapshot defaults and example files are not read.
--allow-short-local-token explicitly accepts an existing 4-15 character token
file for HTTP loopback only; the default minimum remains 16 when a file is supplied.
No devices are started or tested. Run with no concurrent registry/wall editors:
the existing API has no transaction or compare-and-swap for wall bindings.
After an interrupted apply, rerun the same command; completed creates are kept.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import ipaddress
import io
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, unquote, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from dotenv import dotenv_values
from dotenv.parser import parse_stream

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
from app.services.bridge_config import (  # noqa: E402
    FIELDS, MAX_DEVICES, rtsp_url, validate_config, validate_host,
)

SOURCE_FILES = ("server/detection/cameras.json", "detection/cameras.json",
                "detection/cameras.json.bak")
MAX_SOURCE_BYTES = 2_000_000
MAX_API_BYTES = 2_000_000
PLACEHOLDER = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
CONFLICT = re.compile(r"(?m)^[ \t]*(?:<{7,}|={7,}|>{7,}|\|{7,})")
HTTP_TYPES = {"http": "http_snapshot", "http_snapshot": "http_snapshot",
              "http_mjpeg": "http_mjpeg"}
HTTP_ALTERNATIVES = {"httpMjpegUrl": "http_mjpeg", "httpSnapshotUrl": "http_snapshot"}
METHOD_SUFFIXES = {"http_snapshot": " [HTTP snapshot]", "http_mjpeg": " [HTTP MJPEG]"}


class ImportFailure(ValueError):
    """Only fixed diagnostic codes, never source or transport exception text."""


@dataclass
class Candidate:
    origin: str
    row: int
    config: dict = field(repr=False)


@dataclass
class ImportPlan:
    candidates: list[Candidate] = field(default_factory=list)
    origins: list[dict] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    skipped: int = 0
    duplicates: int = 0

    def report(self):
        kinds = {}
        for candidate in self.candidates:
            kind = candidate.config["kind"]
            kinds[kind] = kinds.get(kind, 0) + 1
        return {"candidates": len(self.candidates), "kinds": kinds,
                "skipped": self.skipped, "duplicates": self.duplicates,
                "origins": self.origins, "errors": self.errors}


def _literal_credential(value):
    if re.search(r"%(?![0-9a-fA-F]{2})", value):
        raise ImportFailure("invalid_credential_encoding")
    return unquote(value, encoding="utf-8", errors="strict")


def _credential(value, variables, *, url_encoded=True):
    # Decode only literal URL segments; dotenv values are already raw credentials.
    if not isinstance(value, str):
        raise ImportFailure("invalid_credential_field")
    decode = _literal_credential if url_encoded else lambda text: text
    output, position = [], 0
    for match in PLACEHOLDER.finditer(value):
        literal = value[position:match.start()]
        if "${" in literal:
            raise ImportFailure("unsupported_placeholder")
        output.append(decode(literal))
        replacement = variables.get(match[1])
        if not isinstance(replacement, str) or not replacement:
            raise ImportFailure("missing_credential_variable")
        output.append(replacement)
        position = match.end()
    tail = value[position:]
    if "${" in tail:
        raise ImportFailure("unsupported_placeholder")
    output.append(decode(tail))
    return "".join(output)


def _credentials(row, parts, variables):
    values = {}
    for name, aliases in (("username", ("user", "username")), ("password", ("password",))):
        supplied = [_credential(row[key], variables, url_encoded=False)
                    for key in aliases if key in row]
        embedded = getattr(parts, name)
        if embedded is not None:
            supplied.append(_credential(embedded, variables))
        if len(set(supplied)) > 1:
            raise ImportFailure("conflicting_credential_fields")
        values[name] = supplied[0] if supplied else ""
    return values


def _profile_name(row, kind):
    name = row.get("name") or "Imported camera"
    if (not isinstance(name, str) or len(name) > 100
            or any(unicodedata.category(c).startswith("C") for c in name)):
        raise ImportFailure("invalid_camera_name")
    suffix = METHOD_SUFFIXES.get(kind, "")
    return name[:100 - len(suffix)].rstrip() + suffix if suffix else name


def _validated_payload(config):
    config = validate_config(config)
    if len(config["name"]) > 100 or len(config["username"]) > 128:
        raise ImportFailure("camera_exceeds_api_limits")
    return config


def _path_config(path, query):
    values = {"kind": "rtsp", "channel": 1, "stream": "main",
              "rtspPath": path + ("?" + query if query else "")}
    hikvision = re.fullmatch(r"/Streaming/Channels/([0-9]+)", path)
    if hikvision:
        channel, suffix = divmod(int(hikvision[1]), 100)
        if not 1 <= channel <= 256 or suffix not in (1, 2):
            raise ImportFailure("unsupported_camera_channel")
        values.update(kind="hikvision", channel=channel,
                      stream="main" if suffix == 1 else "sub")
        if not query and path == f"/Streaming/Channels/{channel * 100 + suffix}":
            values["rtspPath"] = ""
    elif path == "/cam/realmonitor":
        values["kind"] = "dahua"
        pairs = parse_qsl(query, keep_blank_values=True, max_num_fields=64)
        options = {}
        for key, value in pairs:
            if key in ("channel", "subtype"):
                if key in options or not re.fullmatch(r"[0-9]+", value):
                    raise ImportFailure("invalid_camera_channel")
                options[key] = int(value)
        channel, subtype = options.get("channel", 1), options.get("subtype", 0)
        if not 1 <= channel <= 256 or subtype not in (0, 1):
            raise ImportFailure("unsupported_camera_channel")
        values.update(channel=channel, stream="main" if subtype == 0 else "sub")
        if len(pairs) == 2 and set(options) == {"channel", "subtype"}:
            values["rtspPath"] = ""
    return values


def parse_camera(row, variables, *, include_local=False, include_http_alternatives=False):
    """Return a validated bridge payload, or None for an intentionally skipped source."""
    try:
        if not isinstance(row, dict):
            raise ImportFailure("invalid_camera_record")
        source_type = str(row.get("type", "")).lower()
        address = row.get("address")
        if type(address) is int and source_type not in ("", "usb"):
            selected = include_http_alternatives if source_type in HTTP_TYPES else include_local
            if selected:
                raise ImportFailure("invalid_camera_address")
            return None
        if source_type == "usb" or type(address) is int:
            return None
        if not isinstance(address, str) or not address:
            raise ImportFailure("invalid_camera_address")
        is_http = source_type in HTTP_TYPES or address.lower().startswith(("http:", "https:"))
        if is_http and not include_http_alternatives:
            return None
        if not is_http and not address.lower().startswith("rtsp:"):
            return None
        allowed = ("http://", "https://") if is_http else ("rtsp://",)
        if (not address.lower().startswith(allowed) or len(address) > 16384
                or any(c.isspace() or unicodedata.category(c).startswith("C") for c in address)):
            raise ImportFailure("invalid_camera_url")
        # Parse the untouched URL, before any variable can inject URL delimiters.
        parts = urlsplit(address)
        if parts.fragment or "#" in address or parts.netloc.count("@") > 1:
            raise ImportFailure("invalid_camera_url")
        host = parts.hostname
        if not host or "${" in host or "${" in parts.path or "${" in parts.query:
            raise ImportFailure("invalid_camera_endpoint")
        if host.lower().rstrip(".").endswith(".example"):
            return None
        if (not parts.path and not is_http) or parts.netloc.endswith(":"):
            raise ImportFailure("invalid_camera_endpoint")
        if is_http:
            method = HTTP_TYPES.get(source_type, "http_snapshot")
            fields = {"kind": method, "httpScheme": parts.scheme,
                      "httpPath": (parts.path or "/") + ("?" + parts.query if parts.query else "")}
            default_port = 443 if parts.scheme == "https" else 80
        else:
            fields = _path_config(parts.path, parts.query)
            default_port = 554
        config = {
            "name": _profile_name(row, fields["kind"]),
            "host": validate_host(host),
            "port": parts.port if parts.port is not None else default_port,
            **_credentials(row, parts, variables),
            "autoStart": False,
            **fields,
        }
        return _validated_payload(config)
    except ImportFailure:
        raise
    except (ValueError, TypeError, KeyError, OverflowError):
        raise ImportFailure("invalid_camera_configuration") from None


def endpoint_key(config):
    """A stream identity excludes names, credentials and auto-start preferences."""
    try:
        host = validate_host(config["host"])
        if config["kind"] in ("http_snapshot", "http_mjpeg"):
            return config["httpScheme"], host, config["port"], config["httpPath"]
        path = urlsplit(rtsp_url({**config, "username": "", "password": ""}))
        derived = _path_config(path.path, path.query)
        if derived["rtspPath"] == "":
            path = urlsplit(rtsp_url({**config, **derived, "username": "", "password": ""}))
        return "rtsp", host, config["port"], path.path, path.query
    except (ValueError, TypeError, KeyError):
        raise ImportFailure("invalid_existing_endpoint") from None


def _read_text(path, limit=MAX_SOURCE_BYTES):
    try:
        with path.open("rb") as source:
            data = source.read(limit + 1)
        if len(data) > limit:
            raise ImportFailure("source_too_large")
        return data.decode("utf-8-sig")
    except (OSError, UnicodeError):
        raise ImportFailure("source_unreadable") from None


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ImportFailure("duplicate_json_key")
        result[key] = value
    return result


def _strict_json(text):
    def invalid_constant(_):
        raise ImportFailure("invalid_json_constant")
    try:
        return json.loads(text, object_pairs_hook=_unique_object, parse_constant=invalid_constant)
    except (ValueError, TypeError, RecursionError):
        raise ImportFailure("invalid_json") from None


def _variables(root):
    path = root / ".env"
    if not path.exists():
        return {}
    text = _read_text(path)
    seen = set()
    for binding in parse_stream(io.StringIO(text)):
        if binding.error or (binding.key is not None and binding.key in seen):
            raise ImportFailure("invalid_dotenv")
        if binding.key is not None:
            seen.add(binding.key)
    return dotenv_values(stream=io.StringIO(text), interpolate=False)


def _select_conflict_side(text, side):
    """Accept complete, non-nested Git merge/diff3 hunks; never rewrite the file."""
    selected, state, found = [], None, False
    for line in text.splitlines(keepends=True):
        if CONFLICT.match(line):
            marker = line.rstrip("\r\n")
            header = re.fullmatch(r"(<<<<<<<|>>>>>>>|\|{7})(?:[ \t]+[^\r\n]*)?", marker)
            token = header[1] if header else marker.rstrip(" \t")
            if token == "<<<<<<<" and state is None:
                state, found = "current", True
            elif token == "|||||||" and state == "current":
                state = "base"
            elif token == "=======" and state in ("current", "base"):
                state = "incoming"
            elif token == ">>>>>>>" and state == "incoming":
                state = None
            else:
                raise ImportFailure("invalid_conflict_markers")
        elif state is None or state == side:
            selected.append(line)
    if state is not None:
        raise ImportFailure("invalid_conflict_markers")
    return None if found and side == "skip" else "".join(selected)


def _camera_variants(row, include_http_alternatives):
    yield row
    if include_http_alternatives and isinstance(row, dict):
        for field_name, kind in HTTP_ALTERNATIVES.items():
            address = row.get(field_name)
            if address is not None and address != "":
                # HTTP endpoints use their own URL or explicit row credentials only.
                yield {**row, "address": address, "type": kind}


def read_sources(root, *, conflict_side="skip", include_local=False, include_http_alternatives=False):
    if conflict_side not in ("skip", "current", "incoming"):
        raise ImportFailure("invalid_conflict_side")
    root, plan, seen = Path(root), ImportPlan(), set()
    try:
        variables = _variables(root)
    except ImportFailure as error:
        plan.errors.append({"origin": ".env", "code": str(error)})
        variables = {}
    for relative in SOURCE_FILES:
        path = root / relative
        origin = {"origin": relative, "status": "missing", "selected": 0,
                  "duplicates": 0, "skipped": 0}
        plan.origins.append(origin)
        if not path.exists():
            continue
        try:
            text = _read_text(path)
            if CONFLICT.search(text):
                text = _select_conflict_side(text, conflict_side)
                origin["conflictSide"] = conflict_side
                if text is None:
                    origin["status"] = "conflict"
                    continue
            data = _strict_json(text)
            rows = data.get("cameras") if isinstance(data, dict) else data
            if not isinstance(rows, list) or len(rows) > 10000:
                raise ImportFailure("invalid_camera_list")
            origin["status"] = "valid"
            for number, row in enumerate(rows, 1):
                try:
                    for variant in _camera_variants(row, include_http_alternatives):
                        config = parse_camera(variant, variables, include_local=include_local,
                                              include_http_alternatives=include_http_alternatives)
                        if config is None:
                            origin["skipped"] += 1
                            plan.skipped += 1
                            continue
                        key = endpoint_key(config)
                        if key in seen:
                            origin["duplicates"] += 1
                            plan.duplicates += 1
                            continue
                        seen.add(key)
                        plan.candidates.append(Candidate(relative, number, config))
                        origin["selected"] += 1
                except ImportFailure as error:
                    plan.errors.append({"origin": relative, "row": number, "code": str(error)})
        except ImportFailure as error:
            origin["status"] = "invalid"
            plan.errors.append({"origin": relative, "code": str(error)})
    if not any(origin["status"] == "valid" for origin in plan.origins):
        plan.errors.append({"code": "no_valid_source"})
    return plan


def normalize_api_url(value):
    try:
        if not isinstance(value, str) or any(c.isspace() for c in value) or "%" in value:
            raise ValueError()
        parts = urlsplit(value)
        if (parts.scheme not in ("http", "https") or parts.username is not None
                or parts.password is not None or parts.query or parts.fragment
                or "?" in value or "#" in value
                or parts.path.rstrip("/") not in ("", "/api", "/api/device-bridges")):
            raise ValueError()
        host = parts.hostname
        host = "127.0.0.1" if host == "localhost" else host
        if not ipaddress.ip_address(host).is_loopback:
            raise ValueError()
        port = parts.port
        if port is not None and not 1 <= port <= 65535:
            raise ValueError()
        host = f"[{host}]" if ":" in host else host
        return urlunsplit((parts.scheme, host + (f":{port}" if port else ""),
                           "/api/device-bridges", "", ""))
    except (ValueError, TypeError):
        raise ImportFailure("api_must_be_loopback") from None


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class BridgeApi:
    def __init__(self, url, token_file=None, *, allow_short_local_token=False):
        self._base = normalize_api_url(url)
        token = _read_text(Path(token_file), 4096).strip() if token_file is not None else ""
        minimum = 4 if allow_short_local_token is True and urlsplit(self._base).scheme == "http" else 16
        if token_file is not None and (not minimum <= len(token) <= 256 or any(not 33 <= ord(c) <= 126 for c in token)):
            raise ImportFailure("invalid_token_file")
        self._token = token
        self._opener = build_opener(ProxyHandler({}), _NoRedirect())

    def request(self, method, path="", payload=None):
        if (method, path) not in {("GET", ""), ("GET", "/auth"),
                                  ("POST", ""), ("PUT", "/bindings")}:
            raise ImportFailure("unsupported_api_operation")
        try:
            request = Request(self._base + path, method=method,
                              headers={"X-Admin-Token": self._token, "Content-Type": "application/json",
                                       "Accept": "application/json"},
                              data=json.dumps(payload).encode("utf-8") if payload is not None else None)
            with self._opener.open(request, timeout=20) as response:
                if response.status != 200:
                    raise ImportFailure("unexpected_api_status")
                data = response.read(MAX_API_BYTES + 1)
            if len(data) > MAX_API_BYTES:
                raise ImportFailure("api_response_too_large")
            result = _strict_json(data)
            if not isinstance(result, dict):
                raise ImportFailure("invalid_api_response")
            return result
        except ImportFailure:
            raise
        except HTTPError as error:
            code = "api_authorization_failed" if error.code in (401, 403) else "api_request_failed"
            error.close()
            raise ImportFailure(code) from None
        except (URLError, OSError, ValueError, TypeError):
            raise ImportFailure("api_request_failed") from None


def _inventory(payload):
    try:
        items, bindings = payload["items"], payload["bindings"]
        if not isinstance(items, list) or len(items) > MAX_DEVICES:
            raise ValueError()
        by_endpoint, identifiers = {}, set()
        for item in items:
            identifier = item["id"]
            if not isinstance(identifier, str) or not re.fullmatch(r"[0-9a-f]{32}", identifier):
                raise ValueError()
            if identifier in identifiers:
                raise ValueError()
            identifiers.add(identifier)
            config = validate_config({key: item[key] for key in FIELDS if key in item})
            if config["kind"] != "go2":
                by_endpoint.setdefault(endpoint_key(config), identifier)
        if (not isinstance(bindings, list) or len(bindings) != MAX_DEVICES
                or any(item is not None and (not isinstance(item, str) or item not in identifiers)
                       for item in bindings)):
            raise ValueError()
        return by_endpoint, list(bindings), identifiers
    except (KeyError, ValueError, TypeError):
        raise ImportFailure("invalid_api_inventory") from None


def import_plan(plan, api, *, dry_run=True, bind_empty=False):
    if plan.errors:
        raise ImportFailure("source_validation_failed")
    # Revalidate the whole plan before even reading the inventory.
    for candidate in plan.candidates:
        try:
            config = validate_config(candidate.config)
            if config["autoStart"] or len(config["name"]) > 100 or len(config["username"]) > 128:
                raise ValueError()
        except (ValueError, TypeError):
            raise ImportFailure("source_validation_failed") from None
    auth = api.request("GET", "/auth")
    if auth.get("authorized") is not True:
        raise ImportFailure("authenticated_api_required")
    existing, bindings, identifiers = _inventory(api.request("GET"))
    pending = [c for c in plan.candidates if endpoint_key(c.config) not in existing]
    if len(identifiers) + len(pending) > MAX_DEVICES:
        raise ImportFailure("device_capacity_exceeded")
    report = {**plan.report(), "mode": "dry-run" if dry_run else "apply", "inventoryChecked": True,
              "alreadyPresent": len(plan.candidates) - len(pending), "toCreate": len(pending),
              "created": 0, "bindingsAdded": 0}
    matched_ids = [existing[endpoint_key(c.config)] for c in plan.candidates
                   if endpoint_key(c.config) in existing]
    matched_keys = {existing[endpoint_key(c.config)]: endpoint_key(c.config)
                    for c in plan.candidates if endpoint_key(c.config) in existing}
    report["bindingsPlanned"] = min(bindings.count(None), len(pending) + sum(
        identifier not in bindings for identifier in matched_ids)) if bind_empty else 0
    if dry_run:
        return report
    for candidate in pending:
        result = api.request("POST", payload=candidate.config)
        try:
            device = result["device"]
            identifier = device["id"]
            if (not isinstance(identifier, str) or not re.fullmatch(r"[0-9a-f]{32}", identifier)
                    or identifier in identifiers or endpoint_key(device) != endpoint_key(candidate.config)
                    or device.get("autoStart") is not False or device.get("status") != "stopped"):
                raise ValueError()
        except (KeyError, ValueError, TypeError):
            raise ImportFailure("create_result_unconfirmed_rerun_preflight") from None
        identifiers.add(identifier)
        matched_ids.append(identifier)
        matched_keys[identifier] = endpoint_key(candidate.config)
        report["created"] += 1
    if bind_empty and matched_ids:
        # Preserve edits made during creates. The API has no conditional binding write.
        latest_endpoints, latest, latest_ids = _inventory(api.request("GET"))
        updated = list(latest)
        for identifier in matched_ids:
            if (identifier not in latest_ids
                    or latest_endpoints.get(matched_keys[identifier]) != identifier):
                raise ImportFailure("inventory_changed_rerun_preflight")
            if identifier not in updated and None in updated:
                updated[updated.index(None)] = identifier
                report["bindingsAdded"] += 1
        if updated != latest:
            response = api.request("PUT", "/bindings", {"bindings": updated})
            if response.get("bindings") != updated:
                raise ImportFailure("binding_result_unconfirmed")
    return report


class _SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise ImportFailure("invalid_cli_arguments")


def main(argv=None):
    parser = _SafeArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--source-root", type=Path, required=True,
                        help="Explicit path to your own YOLO source configuration")
    parser.add_argument("--api-url", default="http://127.0.0.1:8012")
    parser.add_argument("--token-file", type=Path)
    parser.add_argument("--allow-short-local-token", action="store_true",
                        help="Explicitly allow an existing 4-15 character HTTP loopback API token file")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true", help="Validate without writing (default)")
    modes.add_argument("--apply", action="store_true", help="Create missing devices; never start them")
    parser.add_argument("--bind-empty", action="store_true", help="Fill vacant slots with source matches")
    parser.add_argument("--include-local", action="store_true", help="Deprecated and ignored; USB profiles are unsupported")
    parser.add_argument("--include-http-alternatives", action="store_true",
                        help="Include explicit HTTP snapshot/MJPEG sources and alternative URLs")
    parser.add_argument("--conflict-side", choices=("skip", "current", "incoming"), default="skip",
                        help="Select conflict hunks in memory; never modify source files")
    plan = None
    try:
        args = parser.parse_args(argv)
        url = normalize_api_url(args.api_url)
        plan = read_sources(args.source_root, conflict_side=args.conflict_side,
                            include_local=args.include_local,
                            include_http_alternatives=args.include_http_alternatives)
        if plan.errors:
            raise ImportFailure("source_validation_failed")
        if args.token_file is None and not args.apply:
            report = {**plan.report(), "mode": "dry-run", "inventoryChecked": False,
                      "created": 0, "bindingsAdded": 0}
        else:
            report = import_plan(plan, BridgeApi(url, args.token_file,
                                                allow_short_local_token=args.allow_short_local_token),
                                 dry_run=not args.apply, bind_empty=args.bind_empty)
        print(json.dumps(report, ensure_ascii=True))
        return 0
    except ImportFailure as error:
        print(json.dumps({"ok": False, "code": str(error),
                          "source": plan.report() if plan else None,
                          "writesMayHaveCompleted": bool(plan and "args" in locals() and args.apply),
                          "recovery": "rerun_dry_run_before_apply"}, ensure_ascii=True), file=sys.stderr)
        return 1
    except Exception:
        print('{"ok":false,"code":"import_failed","recovery":"rerun_dry_run_before_apply"}',
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
