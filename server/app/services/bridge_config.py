"""Strict, shared configuration and network-target validation."""
from __future__ import annotations

import ipaddress
import json
import re
import socket
import unicodedata
from urllib.parse import parse_qsl, quote, unquote, urlsplit

MAX_DEVICES = 16
MAX_CONFIG_BYTES = 16384
MAX_JPEG_BYTES = 1_000_000
MAX_WORKER_LINE = 1_400_000
MAX_WIDTH, MAX_HEIGHT = 1280, 720
MAX_FPS = 8
FIELDS = frozenset(("name", "kind", "host", "port", "username", "password",
                    "rtspPath", "channel", "stream", "go2Mode", "autoStart",
                    "httpScheme", "httpPath", "usbIndex"))
DEFAULTS = {"port": 554, "username": "", "password": "", "rtspPath": "",
            "channel": 1, "stream": "main", "go2Mode": "LocalSTA", "autoStart": False,
            "httpScheme": "http", "httpPath": "", "usbIndex": 0}
MESSAGES = {
    "connecting": "\u6b63\u5728\u8fde\u63a5\u8bbe\u5907",
    "online": "\u5df2\u6536\u5230\u89c6\u9891\u753b\u9762",
    "stopped": "\u89c6\u9891\u6865\u63a5\u5df2\u505c\u6b62",
    "connect_failed": "\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u5730\u5740\u3001\u7aef\u53e3\u548c\u8d26\u53f7",
    "decode_failed": "\u89c6\u9891\u89e3\u7801\u4e2d\u65ad\uff0c\u8bf7\u68c0\u67e5\u7801\u6d41\u4e0e\u7f51\u7edc",
    "stale": "\u753b\u9762\u5df2\u8d85\u65f6\uff0c\u6b63\u5728\u91cd\u65b0\u8fde\u63a5",
    "protocol": "\u6865\u63a5\u8fdb\u7a0b\u8fd4\u56de\u65e0\u6548\u6570\u636e\uff0c\u6b63\u5728\u91cd\u8bd5",
    "worker_exit": "\u6865\u63a5\u8fdb\u7a0b\u5df2\u9000\u51fa\uff0c\u6b63\u5728\u91cd\u8bd5",
    "runtime": "\u7f3a\u5c11\u53ef\u7528\u7684\u89c6\u9891\u4f9d\u8d56\uff0c\u8bf7\u68c0\u67e5 av\u3001OpenCV \u548c Go2 \u9a71\u52a8",
    "config": "\u8bbe\u5907\u914d\u7f6e\u65e0\u6548\uff0c\u8bf7\u68c0\u67e5\u5730\u5740\u548c\u89c6\u9891\u53c2\u6570",
    "timeout": "\u6d4b\u8bd5\u8d85\u65f6\uff0c\u672a\u6536\u5230\u53ef\u7528\u753b\u9762",
    "dns_ok": "\u8bbe\u5907\u5730\u5740\u5df2\u89e3\u6790\u5e76\u901a\u8fc7\u5b89\u5168\u6821\u9a8c",
    "dns_failed": "\u5730\u5740\u89e3\u6790\u5931\u8d25\u6216\u5730\u5740\u88ab\u62d2\u7edd\uff0c\u8bf7\u68c0\u67e5\u4e3b\u673a\u540d\u548c DNS",
    "network_ok": "\u8bbe\u5907\u7f51\u7edc\u8fde\u63a5\u5df2\u5efa\u7acb",
    "network_refused": "\u8bbe\u5907\u7aef\u53e3\u62d2\u7edd\u8fde\u63a5\uff0c\u8bf7\u68c0\u67e5\u7aef\u53e3\u548c RTSP \u670d\u52a1",
    "network_timeout": "\u8bbe\u5907\u7f51\u7edc\u8fde\u63a5\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u548c\u9632\u706b\u5899",
    "network_unreachable": "\u8bbe\u5907\u7f51\u7edc\u4e0d\u53ef\u8fbe\uff0c\u8bf7\u68c0\u67e5\u5730\u5740\u3001\u8def\u7531\u548c\u7f51\u7edc",
    "auth_failed": "\u8bbe\u5907\u9274\u6743\u5931\u8d25\uff08401/403\uff09\uff0c\u8bf7\u68c0\u67e5\u7528\u6237\u540d\u3001\u5bc6\u7801\u548c\u89c6\u9891\u6743\u9650",
    "stream_ok": "\u89c6\u9891\u7801\u6d41\u534f\u5546\u5df2\u901a\u8fc7",
    "stream_failed": "\u89c6\u9891\u7801\u6d41\u534f\u5546\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u89c6\u9891\u8def\u5f84\u3001\u901a\u9053\u548c\u8bbe\u5907\u72b6\u6001",
    "unsupported_stream": "\u89c6\u9891\u7f16\u7801\u6216\u7801\u6d41\u4e0d\u53d7\u652f\u6301\uff0c\u8bf7\u5c1d\u8bd5 H.264 \u6216\u5b50\u7801\u6d41",
    "decoding": "\u6b63\u5728\u7b49\u5f85\u89c6\u9891\u89e3\u7801\u753b\u9762",
}
SUCCESS_CODES = {"dns_ok": "dns", "network_ok": "network", "stream_ok": "stream", "online": "decode"}
FAILURE_CODES = frozenset(MESSAGES) - frozenset(SUCCESS_CODES) - {"connecting", "stopped", "decoding"}


def _clean(value: str) -> bool:
    return not any(unicodedata.category(char).startswith("C") for char in value)


def validate_host(value: str) -> str:
    error = "\u8bf7\u586b\u5199\u6709\u6548\u8bbe\u5907\u4e3b\u673a\u540d\u6216 IP\uff0c\u4e0d\u542b\u534f\u8bae\u3001\u51ed\u636e\u548c\u7aef\u53e3\uff1b\u7981\u6b62\u5143\u6570\u636e\u5730\u5740"
    if not isinstance(value, str) or not value or len(value) > 253:
        raise ValueError(error)
    if not value.isascii() or not _clean(value) or "%" in value or any(c.isspace() for c in value):
        raise ValueError(error)
    host = value.lower()
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
        if ":" not in host:
            raise ValueError(error)
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        if ":" in host or re.fullmatch(r"[0-9.]+", host) or host.startswith("0x"):
            raise ValueError(error) from None
        labels = host.rstrip(".").split(".")
        if any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
               for label in labels):
            raise ValueError(error) from None
        if any(label in {"metadata", "instance-data"} for label in labels):
            raise ValueError(error) from None
        return host.rstrip(".")
    address = getattr(address, "ipv4_mapped", None) or address
    if (address.is_unspecified or address.is_multicast or address.is_link_local
            or (address.is_reserved and not address.is_loopback)
            or str(address) in {"100.100.100.200", "168.63.129.16", "fd00:ec2::254"}):
        raise ValueError(error)
    return str(address)


def _validate_path(path: str) -> None:
    error = "\u81ea\u5b9a\u4e49 RTSP \u8def\u5f84\u987b\u4ee5 / \u5f00\u5934\uff0c\u4e0d\u53ef\u5305\u542b\u5b8c\u6574 URL\u3001\u51ed\u636e\u6216\u63a7\u5236\u5b57\u7b26"
    decoded = path
    for _ in range(5):
        if (not decoded.startswith("/") or decoded.startswith("//") or not _clean(decoded)
                or any(c in decoded for c in ("\\", "@", ":", "#"))
                or any(c.isspace() for c in decoded)
                or re.search(r"%(?![0-9a-fA-F]{2})", decoded)):
            raise ValueError(error)
        try:
            parts = urlsplit(decoded)
            pairs = parse_qsl(parts.query, keep_blank_values=True, max_num_fields=64)
        except ValueError:
            raise ValueError(error) from None
        sensitive = {"user", "username", "password", "passwd", "pwd", "pass",
                     "token", "accesstoken", "refreshtoken", "auth", "authorization",
                     "credential", "credentials", "secret", "key", "apikey", "signature"}
        keys = [re.sub(r"[^a-z]", "", key.lower()) for key, _ in pairs]
        if parts.netloc or parts.scheme or any(
            key in sensitive or any(word in key for word in ("token", "password", "credential",
                                                             "secret", "authentication"))
            for key in keys):
            raise ValueError(error)
        try:
            next_value = unquote(decoded, errors="strict")
        except UnicodeError:
            raise ValueError(error) from None
        if next_value == decoded:
            return
        decoded = next_value
    raise ValueError(error)


def validate_config(data: dict, previous: dict | None = None) -> dict:
    if not isinstance(data, dict) or any(key not in FIELDS for key in data):
        raise ValueError("\u8bf7\u63d0\u4ea4\u8bbe\u5907\u914d\u7f6e\u5bf9\u8c61\uff0c\u4e0d\u8981\u5305\u542b\u672a\u77e5\u5b57\u6bb5")
    previous = dict(previous or {})
    if previous and data.get("kind", previous["kind"]) != previous["kind"]:
        for key in ("username", "password", "rtspPath", "httpPath", "httpScheme",
                    "usbIndex", "channel", "stream", "go2Mode"):
            previous[key] = DEFAULTS[key]
        previous["port"] = 80 if data["kind"] in ("http_snapshot", "http_mjpeg") else 554
        if data["kind"] == "usb":
            previous["host"] = ""
    result = {**DEFAULTS, **previous, **data}
    for key, limit in (("name", 120), ("host", 253), ("username", 256),
                       ("password", 512), ("rtspPath", 2048), ("httpPath", 2048)):
        value = result.get(key)
        if not isinstance(value, str) or len(value) > limit or not _clean(value):
            raise ValueError(f"{key} \u5fc5\u987b\u662f\u6709\u6548\u6587\u672c\uff0c\u957f\u5ea6\u4e0d\u8d85\u8fc7 {limit}")
    result["name"] = result["name"].strip()
    if not result["name"]:
        raise ValueError("\u8bf7\u586b\u5199\u8bbe\u5907\u540d\u79f0")
    for key, allowed in (("kind", ("go2", "hikvision", "dahua", "rtsp", "usb", "http_snapshot", "http_mjpeg")),
                         ("stream", ("main", "sub")), ("go2Mode", ("LocalSTA", "LocalAP")),
                         ("httpScheme", ("http", "https"))):
        if result.get(key) not in allowed:
            raise ValueError(f"{key} \u53d6\u503c\u65e0\u6548\uff0c\u8bf7\u9009\u62e9\u652f\u6301\u7684\u7c7b\u578b")
    for key, upper in (("port", 65535), ("channel", 256)):
        if type(result[key]) is not int or not 1 <= result[key] <= upper:
            raise ValueError(f"{key} \u5fc5\u987b\u662f 1 \u81f3 {upper} \u7684\u6574\u6570")
    if type(result["autoStart"]) is not bool:
        raise ValueError("autoStart \u5fc5\u987b\u662f\u5e03\u5c14\u503c")
    if type(result["usbIndex"]) is not int or not 0 <= result["usbIndex"] <= 15:
        raise ValueError("usbIndex must be an integer from 0 to 15")
    if result["kind"] == "usb":
        if any(result[key] for key in ("host", "username", "password", "rtspPath", "httpPath")):
            raise ValueError("USB sources accept only a local device index, not network targets or credentials")
    else:
        result["host"] = validate_host(result["host"])
    if result["kind"] in ("http_snapshot", "http_mjpeg"):
        if result["rtspPath"] or not result["httpPath"]:
            raise ValueError("HTTP sources require an HTTP path and no RTSP path")
        _validate_path(result["httpPath"])
    elif result["httpPath"]:
        raise ValueError("HTTP path is only supported for HTTP sources")
    if result["rtspPath"]:
        _validate_path(result["rtspPath"])
    elif result["kind"] == "rtsp":
        raise ValueError("\u901a\u7528 RTSP \u8bbe\u5907\u5fc5\u987b\u586b\u5199\u4e3b\u673a\u548c\u89c6\u9891\u8def\u5f84")
    if (result["kind"] == "go2" and result["go2Mode"] == "LocalAP"
            and result["host"] != "192.168.12.1"):
        raise ValueError("Go2 LocalAP \u6a21\u5f0f\u4e3b\u673a\u5fc5\u987b\u4e3a 192.168.12.1")
    config = {key: result[key] for key in FIELDS}
    if len(json.dumps(config, ensure_ascii=True).encode()) + 1 > MAX_CONFIG_BYTES:
        raise ValueError("\u8bbe\u5907\u914d\u7f6e\u8fc7\u957f\uff0c\u8bf7\u7f29\u77ed\u8def\u5f84\u6216\u8d26\u53f7\u5b57\u6bb5")
    return config


def resolve_host(host: str, port: int) -> str:
    """Check every DNS answer, then pass a numeric address to prevent rebinding."""
    host = validate_host(host)
    try:
        return str(ipaddress.ip_address(host))
    except ValueError:
        pass
    try:
        answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise ValueError("\u8bbe\u5907\u4e3b\u673a\u540d\u65e0\u6cd5\u89e3\u6790\uff0c\u8bf7\u68c0\u67e5 DNS \u6216\u6539\u7528 IP") from None
    if not answers:
        raise ValueError(MESSAGES["config"])
    addresses = [validate_host(answer[4][0]) for answer in answers]
    return addresses[0]


def rtsp_url(config: dict) -> str:
    host = config["host"]
    if ":" in host:
        host = f"[{host}]"
    auth = ""
    if config["username"] or config["password"]:
        auth = f'{quote(config["username"], safe="")}:{quote(config["password"], safe="")}@'
    if config["rtspPath"]:
        path = config["rtspPath"]
    elif config["kind"] == "hikvision":
        suffix = 1 if config["stream"] == "main" else 2
        path = f'/Streaming/Channels/{config["channel"] * 100 + suffix}'
    elif config["kind"] == "dahua":
        subtype = 0 if config["stream"] == "main" else 1
        path = f'/cam/realmonitor?channel={config["channel"]}&subtype={subtype}'
    else:
        path = config["rtspPath"]
    return f'rtsp://{auth}{host}:{config["port"]}{path}'
