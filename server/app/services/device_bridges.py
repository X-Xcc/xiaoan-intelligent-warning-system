"""Encrypted device registry and bounded, supervised decoder processes."""
from __future__ import annotations

import base64
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
import importlib.util
import json
import math
import os
from pathlib import Path
import queue
import subprocess
import sys
import sysconfig
import threading
import time
from uuid import uuid4

from .bridge_config import (DEFAULTS, FAILURE_CODES, FIELDS, MAX_CONFIG_BYTES, MAX_DEVICES, MAX_FPS, MAX_HEIGHT,
                            MAX_JPEG_BYTES, MAX_WIDTH, MAX_WORKER_LINE, MESSAGES,
                            SUCCESS_CODES, validate_config)
from .bridge_store import BridgeStore, STORAGE_ERROR

STALE_SECONDS = 5.0
WATCHDOG_SECONDS = 20.0
MAX_LOGS = 100
STAGES = frozenset(("stopped", "connect", "dns", "network", "stream", "decode", "runtime", "config"))
STATUSES = frozenset(("stopped", "connecting", "online", "reconnecting", "error"))


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


@dataclass
class _Runtime:
    status: str = "stopped"
    stage: str = "stopped"
    error: str = ""
    jpeg: bytes | None = None
    last_frame: float = 0
    last_frame_at: str | None = None
    frame_count: int = 0
    width: int = 0
    height: int = 0
    logs: deque = field(default_factory=lambda: deque(maxlen=MAX_LOGS))
    times: deque = field(default_factory=lambda: deque(maxlen=MAX_FPS * 2))
    stopped: threading.Event = field(default_factory=threading.Event)
    process: subprocess.Popen | None = None
    thread: threading.Thread | None = None
    test_owned: bool = False
    testers: int = 0
    checks: dict = field(default_factory=dict)
    failure: dict | None = None


class BridgeManager:
    def __init__(self, directory=None):
        self._condition = threading.Condition(threading.RLock())
        self._operations = threading.RLock()
        self._store = BridgeStore(directory)
        self._devices = {}
        self._runtimes = {}
        self._shutting_down = False
        try:
            rows = self._store.load("devices.json", [])
            if not isinstance(rows, list) or len(rows) > MAX_DEVICES:
                raise ValueError("invalid device registry")
            for row in rows:
                identifier = row["id"]
                if (not isinstance(identifier, str) or len(identifier) != 32
                        or any(c not in "0123456789abcdef" for c in identifier)
                        or identifier in self._devices):
                    raise ValueError("invalid device id")
                config = validate_config({
                    key: row.get(key, DEFAULTS[key]) if key in ("httpScheme", "httpPath", "usbIndex") else row[key]
                    for key in FIELDS
                })
                for key in ("createdAt", "updatedAt"):
                    if not isinstance(row[key], str):
                        raise ValueError("invalid timestamp")
                    datetime.fromisoformat(row[key])
                self._devices[identifier] = {**config, "id": identifier,
                                             "createdAt": row["createdAt"], "updatedAt": row["updatedAt"]}
                self._runtimes[identifier] = _Runtime()
            self._bindings = self._store.load("bindings.json", [None] * MAX_DEVICES)
            if (not isinstance(self._bindings, list) or len(self._bindings) != MAX_DEVICES
                    or any(item is not None and not isinstance(item, str) for item in self._bindings)):
                raise ValueError("invalid bindings")
            self._bindings = [item if item in self._devices else None for item in self._bindings]
        except Exception:
            raise RuntimeError(STORAGE_ERROR) from None

    def _require(self, identifier):
        if not isinstance(identifier, str) or identifier not in self._devices:
            raise KeyError("\u8bbe\u5907\u4e0d\u5b58\u5728")
        return self._devices[identifier]

    def _log(self, state, code, level="info"):
        message = MESSAGES.get(code, MESSAGES["decode_failed"])
        state.logs.append({"at": _now(), "level": level, "message": message[:240]})

    def _clear(self, state):
        state.jpeg = None
        state.times.clear()
        self._condition.notify_all()

    def _expire(self, state):
        if state.jpeg is not None and time.monotonic() - state.last_frame >= STALE_SECONDS:
            self._clear(state)
            state.status, state.stage, state.error = "reconnecting", "decode", MESSAGES["stale"]
            self._log(state, "stale", "warning")

    def _view(self, identifier):
        config = self._require(identifier)
        state = self._runtimes[identifier]
        self._expire(state)
        online = state.jpeg is not None and state.status == "online" and not state.stopped.is_set()
        span = state.times[-1] - state.times[0] if len(state.times) > 1 else 0
        fps = min(MAX_FPS, (len(state.times) - 1) / span) if online and span > 0 else 0
        return {**{key: value for key, value in config.items() if key != "password"},
                "hasPassword": bool(config["password"]), "status": state.status, "online": online,
                "fps": round(fps, 2), "width": state.width, "height": state.height,
                "frameCount": state.frame_count, "lastFrameAt": state.last_frame_at,
                "lastError": state.error, "stage": state.stage,
                "logs": [dict(item) for item in state.logs],
                "feedUrl": f"/api/device-bridges/{identifier}/feed",
                "snapshotUrl": f"/api/device-bridges/{identifier}/snapshot"}

    def list_devices(self) -> list:
        with self._condition:
            return [self._view(identifier) for identifier in self._devices]

    def get_device(self, identifier) -> dict:
        with self._condition:
            return self._view(identifier)

    def create_device(self, data: dict) -> dict:
        config = validate_config(data)
        with self._operations, self._condition:
            if len(self._devices) >= MAX_DEVICES:
                raise RuntimeError("\u6700\u591a\u652f\u6301 16 \u53f0\u8bbe\u5907\uff0c\u8bf7\u5148\u5220\u9664\u4e0d\u518d\u4f7f\u7528\u7684\u8bbe\u5907")
            identifier, now = uuid4().hex, _now()
            row = {**config, "id": identifier, "createdAt": now, "updatedAt": now}
            self._store.save("devices.json", [*self._devices.values(), row])
            self._devices[identifier], self._runtimes[identifier] = row, _Runtime()
            return self._view(identifier)

    def update_device(self, identifier, data: dict) -> dict:
        with self._operations:
            with self._condition:
                original = self._require(identifier)
                config = validate_config(data, {key: original[key] for key in FIELDS})
                row = {**original, **config, "updatedAt": _now()}
                state = self._runtimes[identifier]
                active = self._active(state)
                restart = active and not state.test_owned
                self._store.save("devices.json", [row if key == identifier else value
                                                  for key, value in self._devices.items()])
                self._devices[identifier] = row
            if active:
                self.stop_device(identifier)
            if restart:
                return self.start_device(identifier)
            return self.get_device(identifier)

    def delete_device(self, identifier) -> None:
        with self._operations:
            with self._condition:
                self._require(identifier)
            self.stop_device(identifier)
            with self._condition:
                bindings = [None if item == identifier else item for item in self._bindings]
                self._store.save("bindings.json", bindings)
                self._bindings = bindings
                self._store.save("devices.json", [row for key, row in self._devices.items()
                                                  if key != identifier])
                del self._devices[identifier]
                del self._runtimes[identifier]
                self._condition.notify_all()

    @staticmethod
    def _active(state):
        return state.thread is not None and state.thread.is_alive()

    def _worker_command(self):
        # Windows venv redirectors spawn another Python; terminate the decoder itself.
        executable = getattr(sys, "_base_executable", sys.executable) if os.name == "nt" else sys.executable
        return [executable, "-u", str(Path(__file__).with_name("bridge_worker.py"))]

    def _launch(self, config):
        keys = {"SYSTEMROOT", "WINDIR", "PATH", "TEMP", "TMP", "HOME", "USERPROFILE",
                "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL"}
        environment = {key: value for key, value in os.environ.items() if key.upper() in keys}
        environment["PYTHONPATH"] = os.pathsep.join(dict.fromkeys(
            sysconfig.get_path(key) for key in ("purelib", "platlib")))
        return subprocess.Popen(
            self._worker_command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, shell=False, env=environment, bufsize=65536,
            close_fds=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))

    @staticmethod
    def _send_config(process, config):
        try:
            payload = json.dumps({key: config[key] for key in FIELDS}, ensure_ascii=True).encode() + b"\n"
            if len(payload) > MAX_CONFIG_BYTES:
                return
            pending = memoryview(payload)
            while pending:
                written = process.stdin.write(pending)
                if not written:
                    return
                pending = pending[written:]
        except Exception:
            pass
        finally:
            try:
                process.stdin.close()
            except OSError:
                pass

    def _start(self, identifier, user_owned):
        with self._condition:
            config = self._require(identifier)
            if self._shutting_down:
                raise RuntimeError("\u6865\u63a5\u670d\u52a1\u6b63\u5728\u5173\u95ed")
            state = self._runtimes[identifier]
            if self._active(state):
                if state.stopped.is_set():
                    raise RuntimeError("\u8bbe\u5907\u6b63\u5728\u505c\u6b62\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5")
                if user_owned:
                    state.test_owned = False
                return state
            info = self.runtime_info()
            if (not info["opencv"] or (config["kind"] != "usb" and not info["av"])
                    or (config["kind"] == "go2" and not info["go2"])):
                raise RuntimeError(MESSAGES["runtime"])
            if sum(self._active(item) for item in self._runtimes.values()) >= MAX_DEVICES:
                raise RuntimeError("\u540c\u65f6\u8fd0\u884c\u4e0a\u9650\u4e3a 16 \u8def")
            state = _Runtime(status="connecting", stage="connect",
                             logs=deque(state.logs, maxlen=MAX_LOGS), test_owned=not user_owned)
            self._runtimes[identifier] = state
            self._log(state, "connecting")
            state.thread = threading.Thread(target=self._supervise, args=(identifier, dict(config), state),
                                            name=f"device-bridge-{identifier[:8]}", daemon=True)
            state.thread.start()
            return state

    def start_device(self, identifier) -> dict:
        with self._operations:
            self._start(identifier, True)
            return self.get_device(identifier)

    @staticmethod
    def _terminate(process):
        if process is None or process.poll() is not None:
            return
        try:
            process.terminate()
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
                process.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                raise RuntimeError("\u89c6\u9891\u8fdb\u7a0b\u672a\u54cd\u5e94\u7ec8\u6b62\uff0c\u8bf7\u68c0\u67e5\u8fdb\u7a0b\u72b6\u6001") from None
        except OSError:
            if process.poll() is None:
                raise RuntimeError("\u89c6\u9891\u8fdb\u7a0b\u65e0\u6cd5\u505c\u6b62\uff0c\u8bf7\u68c0\u67e5\u7cfb\u7edf\u6743\u9650") from None

    def stop_device(self, identifier) -> dict:
        with self._operations:
            with self._condition:
                self._require(identifier)
                state = self._runtimes[identifier]
                state.stopped.set()
                self._clear(state)
                process, thread = state.process, state.thread
            self._terminate(process)
            if thread is not None and thread is not threading.current_thread():
                thread.join(timeout=3)
                if thread.is_alive():
                    raise RuntimeError("\u89c6\u9891\u8fdb\u7a0b\u5c1a\u672a\u9000\u51fa\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5")
            with self._condition:
                state.status, state.stage, state.error = "stopped", "stopped", ""
                self._log(state, "stopped")
                return self._view(identifier)

    def restart_device(self, identifier) -> dict:
        with self._operations:
            self.stop_device(identifier)
            return self.start_device(identifier)

    def _read_lines(self, process, inbox, finished):
        def offer(value):
            while not finished.is_set():
                try:
                    inbox.put(value, timeout=0.1)
                    return
                except queue.Full:
                    continue
        try:
            while not finished.is_set():
                line = process.stdout.readline(MAX_WORKER_LINE + 1)
                if not line:
                    break
                if len(line) > MAX_WORKER_LINE or not line.endswith(b"\n"):
                    offer(("error", "protocol"))
                    return
                offer(("line", line))
        except (OSError, ValueError):
            pass
        finally:
            offer(("error", "worker_exit"))

    def _accept_event(self, state, event):
        if not isinstance(event, dict):
            raise ValueError("invalid event")
        if event.get("type") == "status":
            status, stage = event.get("status"), event.get("stage")
            if status not in STATUSES - {"online"} or stage not in STAGES:
                raise ValueError("invalid status")
            code = event.get("code")
            if code not in MESSAGES:
                code = "decode_failed"
            state.status, state.stage = status, stage
            if status in {"reconnecting", "error", "stopped", "connecting"}:
                self._clear(state)
            if code == "connecting" and stage == "dns":
                state.checks.clear()
            if code in SUCCESS_CODES:
                evidence_stage = SUCCESS_CODES[code]
                if stage != evidence_stage:
                    raise ValueError("invalid evidence stage")
                state.checks[stage] = {"stage": stage, "ok": True, "message": MESSAGES[code]}
                if state.failure and state.failure["stage"] == stage:
                    state.failure = None
            if code in FAILURE_CODES:
                state.error = MESSAGES[code]
                state.failure = {"stage": stage, "ok": False, "message": MESSAGES[code]}
                state.checks[stage] = dict(state.failure)
            self._log(state, code, "warning" if code in FAILURE_CODES else "info")
            return False
        if event.get("type") != "frame":
            raise ValueError("unknown event")
        width, height, encoded = event.get("width"), event.get("height"), event.get("jpeg")
        if (type(width) is not int or type(height) is not int
                or not 1 <= width <= MAX_WIDTH or not 1 <= height <= MAX_HEIGHT
                or not isinstance(encoded, str) or len(encoded) > (MAX_JPEG_BYTES + 2) // 3 * 4):
            raise ValueError("invalid frame")
        jpeg = base64.b64decode(encoded, validate=True)
        if not 4 <= len(jpeg) <= MAX_JPEG_BYTES or not jpeg.startswith(b"\xff\xd8") or not jpeg.endswith(b"\xff\xd9"):
            raise ValueError("invalid jpeg")
        if self._jpeg_dimensions(jpeg) != (width, height):
            raise ValueError("invalid jpeg dimensions")
        now = time.monotonic()
        if state.frame_count and now - state.last_frame < 1 / MAX_FPS:
            return False
        if state.status != "online":
            self._log(state, "online")
        state.status, state.stage, state.error = "online", "decode", ""
        state.failure = None
        state.checks["decode"] = {"stage": "decode", "ok": True, "message": MESSAGES["online"]}
        state.jpeg, state.width, state.height = jpeg, width, height
        state.last_frame, state.last_frame_at = now, _now()
        state.frame_count += 1
        state.times.append(now)
        self._condition.notify_all()
        return True

    @staticmethod
    def _jpeg_dimensions(jpeg):
        offset = 2
        dimensions = None
        while offset + 4 < len(jpeg):
            if jpeg[offset] != 0xFF:
                break
            marker = jpeg[offset + 1]
            if marker == 0xFF:
                offset += 1
                continue
            size = int.from_bytes(jpeg[offset + 2:offset + 4], "big")
            if size < 2 or offset + 2 + size > len(jpeg):
                break
            if marker in (0xC0, 0xC1, 0xC2):
                if size < 8:
                    break
                dimensions = (int.from_bytes(jpeg[offset + 7:offset + 9], "big"),
                              int.from_bytes(jpeg[offset + 5:offset + 7], "big"))
            if marker == 0xDA and dimensions is not None:
                return dimensions
            offset += size + 2
        raise ValueError("invalid jpeg header")

    def _supervise(self, identifier, config, state):
        attempt = 0
        while not state.stopped.is_set():
            process = reader = writer = None
            finished = threading.Event()
            code = "worker_exit"
            got_frame = False
            try:
                with self._condition:
                    if state.stopped.is_set():
                        break
                    process = self._launch(config)
                    state.process = process
                writer = threading.Thread(target=self._send_config, args=(process, config),
                                          name=f"bridge-stdin-{identifier[:8]}", daemon=True)
                writer.start()
                inbox = queue.Queue(maxsize=4)
                reader = threading.Thread(target=self._read_lines, args=(process, inbox, finished),
                                          name=f"bridge-pipe-{identifier[:8]}", daemon=True)
                reader.start()
                progress = time.monotonic()
                while not state.stopped.is_set():
                    with self._condition:
                        self._expire(state)
                    if time.monotonic() - progress > WATCHDOG_SECONDS:
                        code = "stale"
                        break
                    try:
                        kind, payload = inbox.get(timeout=0.1)
                    except queue.Empty:
                        continue
                    if kind == "error":
                        code = payload
                        break
                    try:
                        event = json.loads(payload)
                        with self._condition:
                            if state.stopped.is_set():
                                break
                            if self._accept_event(state, event):
                                progress = time.monotonic()
                                got_frame = True
                    except (ValueError, TypeError, KeyError, RecursionError):
                        code = "protocol"
                        break
            except Exception:
                code = "worker_exit"
            finally:
                finished.set()
                self._terminate(process)
                if writer:
                    writer.join(timeout=1)
                if reader:
                    reader.join(timeout=1)
                if process and process.stdout:
                    process.stdout.close()
                with self._condition:
                    state.process = None
                    self._clear(state)
            if state.stopped.is_set():
                break
            with self._condition:
                state.status, state.stage, state.error = "reconnecting", "connect", MESSAGES[code]
                self._log(state, code, "warning")
            if got_frame:
                attempt = 0
            state.stopped.wait(min(15.0, 0.5 * 2 ** min(attempt, 5)))
            attempt += 1

    def test_device(self, identifier, timeout=12) -> dict:
        with self._condition:
            self._require(identifier)
        if type(timeout) not in (int, float) or not math.isfinite(timeout) or not 0 < timeout <= 60:
            raise ValueError("\u6d4b\u8bd5\u8d85\u65f6\u5fc5\u987b\u5927\u4e8e 0 \u4e14\u4e0d\u8d85\u8fc7 60 \u79d2")
        checks = [{"stage": "config", "ok": True, "message": "\u914d\u7f6e\u6821\u9a8c\u901a\u8fc7"}]
        state = None
        ok = False
        try:
            with self._operations:
                state = self._start(identifier, False)
                with self._condition:
                    state.testers += 1
            checks.append({"stage": "runtime", "ok": True, "message": "\u89c6\u9891\u4f9d\u8d56\u53ef\u7528"})
            deadline = time.monotonic() + timeout
            with self._condition:
                while True:
                    if identifier not in self._devices or self._runtimes[identifier] is not state:
                        break
                    ok = self._view(identifier)["online"]
                    if ok or state.stopped.is_set() or time.monotonic() >= deadline:
                        break
                    self._condition.wait(timeout=min(0.2, max(0, deadline - time.monotonic())))
                evidence = {key: dict(value) for key, value in state.checks.items()}
                if not ok and state.failure:
                    evidence[state.failure["stage"]] = dict(state.failure)
                if not ok and not any(not item["ok"] for item in evidence.values()):
                    stage = state.stage if state.stage in {"dns", "network", "stream", "decode"} else "decode"
                    evidence[stage] = {"stage": stage, "ok": False, "message": MESSAGES["timeout"]}
                checks.extend(evidence[key] for key in ("dns", "network", "stream", "decode")
                              if key in evidence)
        except RuntimeError:
            checks.append({"stage": "runtime", "ok": False, "message": MESSAGES["runtime"]})
        finally:
            if state is not None:
                with self._operations:
                    with self._condition:
                        state.testers -= 1
                        should_stop = (state.test_owned and not state.testers
                                       and self._runtimes.get(identifier) is state)
                    if should_stop:
                        self.stop_device(identifier)
        return {"ok": ok, "device": self.get_device(identifier), "checks": checks}

    def get_bindings(self) -> list:
        with self._condition:
            return list(self._bindings)

    def set_bindings(self, bindings: list) -> list:
        with self._operations, self._condition:
            if (not isinstance(bindings, list) or len(bindings) != MAX_DEVICES
                    or any(value is not None and (not isinstance(value, str) or value not in self._devices)
                           for value in bindings)):
                raise ValueError("\u7ed1\u5b9a\u5fc5\u987b\u662f 16 \u9879\u5217\u8868\uff0c\u6bcf\u9879\u4e3a\u5df2\u6709\u8bbe\u5907 ID \u6216 null")
            self._store.save("bindings.json", bindings)
            self._bindings = list(bindings)
            return list(bindings)

    def runtime_info(self) -> dict:
        def available(module):
            try:
                return importlib.util.find_spec(module) is not None
            except (ImportError, ValueError):
                return False
        with self._condition:
            return {"av": available("av"), "opencv": available("cv2"),
                    "go2": available("go2_webrtc_driver"),
                    "running": sum(state.process is not None and state.process.poll() is None
                                   for state in self._runtimes.values()),
                    "maxDevices": MAX_DEVICES}

    def snapshot(self, identifier) -> bytes | None:
        with self._condition:
            return self._runtimes[identifier].jpeg if self._view(identifier)["online"] else None

    def frames(self, identifier):
        with self._condition:
            self._require(identifier)
            state = self._runtimes[identifier]
        version = -1
        while True:
            with self._condition:
                if identifier not in self._devices or self._runtimes[identifier] is not state:
                    return
                self._expire(state)
                if state.stopped.is_set() or state.status in {"stopped", "error"}:
                    return
                jpeg = state.jpeg if state.frame_count != version else None
                if jpeg is None:
                    if state.last_frame and time.monotonic() - state.last_frame >= STALE_SECONDS:
                        return
                    self._condition.wait(timeout=0.25)
                    continue
                version = state.frame_count
            yield jpeg

    def startup(self) -> None:
        with self._operations:
            self._shutting_down = False
            if os.getenv("CICSIC_BRIDGE_AUTOSTART", "true").lower() not in {"1", "true", "yes", "on"}:
                return
            for row in self.list_devices():
                if row["autoStart"]:
                    try:
                        self.start_device(row["id"])
                    except RuntimeError:
                        with self._condition:
                            state = self._runtimes[row["id"]]
                            state.status, state.stage, state.error = "error", "runtime", MESSAGES["runtime"]
                            self._log(state, "runtime", "error")

    def shutdown(self) -> None:
        with self._operations:
            self._shutting_down = True
            errors = False
            for identifier in list(self._devices):
                try:
                    self.stop_device(identifier)
                except RuntimeError:
                    errors = True
            if errors:
                raise RuntimeError("\u90e8\u5206\u89c6\u9891\u8fdb\u7a0b\u672a\u80fd\u9000\u51fa\uff0c\u8bf7\u68c0\u67e5\u8fdb\u7a0b\u72b6\u6001")


_manager = None
_manager_lock = threading.Lock()


def get_manager() -> BridgeManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = BridgeManager()
        return _manager
