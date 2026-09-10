"""One isolated video-only decoder. Configuration arrives exclusively on stdin."""
from __future__ import annotations

import asyncio
import base64
from contextlib import contextmanager
import errno
import json
import logging
import os
import platform
import re
import signal
import socket
import sys
import threading
import time

if __name__ == "__main__":
    # Source adapters must share this process's diagnostic exception type.
    sys.modules["bridge_worker"] = sys.modules[__name__]

if __package__:
    from .bridge_config import (MAX_CONFIG_BYTES, MAX_FPS, MAX_HEIGHT, MAX_JPEG_BYTES,
                                MAX_WIDTH, MESSAGES, resolve_host, rtsp_url, validate_config)
else:
    from bridge_config import (MAX_CONFIG_BYTES, MAX_FPS, MAX_HEIGHT, MAX_JPEG_BYTES,
                               MAX_WIDTH, MESSAGES, resolve_host, rtsp_url, validate_config)

OPEN_TIMEOUT = 5.0
READ_TIMEOUT = 5.0
MAX_INPUT_PIXELS = 33_177_600


class BridgeFailure(RuntimeError):
    def __init__(self, stage, code):
        self.stage = stage
        self.code = code
        super().__init__(MESSAGES[code])


def classify_failure(error, stage):
    """Inspect locally, but only return fixed codes. Never serialize the exception."""
    if isinstance(error, BridgeFailure):
        return error.stage, error.code
    if stage == "dns" or isinstance(error, socket.gaierror):
        return "dns", "dns_failed"
    status = getattr(error, "status_code", None) or getattr(error, "status", None)
    number = abs(getattr(error, "errno", 0) or 0)
    text = str(error)[:4096].lower()
    if status in (401, 403) or re.search(r"\b(401|403)\b", text) or any(
        term in text for term in ("unauthorized", "forbidden", "authentication failed",
                                  "authorization failed")):
        return "stream", "auth_failed"
    if number in (errno.ECONNREFUSED, 10061) or "connection refused" in text:
        return "network", "network_refused"
    if isinstance(error, TimeoutError) or number in (errno.ETIMEDOUT, 10060) or any(
        term in text for term in ("timed out", "timeout")):
        return "network", "network_timeout"
    if number in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.ECONNRESET, 10051, 10065, 10054):
        return "network", "network_unreachable"
    if any(term in text for term in ("decoder not found", "unsupported codec", "unsupported format",
                                     "protocol not found", "no video stream")):
        return "decode", "unsupported_stream"
    return (stage, "decode_failed") if stage == "decode" else (
        ("stream", "stream_failed") if stage == "stream" else ("network", "network_unreachable"))


def _failure(error, stage):
    return BridgeFailure(*classify_failure(error, stage))


def isolated_output():
    """Reserve the IPC pipe, then suppress Python and native-library stdout/stderr."""
    descriptor = os.dup(sys.stdout.fileno())
    os.set_inheritable(descriptor, False)
    output = os.fdopen(descriptor, "wb", buffering=0)
    sink = os.open(os.devnull, os.O_WRONLY)
    try:
        os.dup2(sink, 1)
        os.dup2(sink, 2)
    finally:
        os.close(sink)
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
    sys.stderr = open(os.devnull, "w", encoding="utf-8")
    logging.disable(sys.maxsize)
    return output


@contextmanager
def windows_platform_import_guard(is_windows=None):
    if is_windows is None:
        is_windows = os.name == "nt"
    if not is_windows:
        yield
        return
    original_system, original_machine = platform.system, platform.machine
    platform.system = lambda: "Windows"
    platform.machine = lambda: "AMD64"
    try:
        yield
    finally:
        platform.system, platform.machine = original_system, original_machine


def load_go2():
    with windows_platform_import_guard():
        from go2_webrtc_driver.constants import WebRTCConnectionMethod
        from go2_webrtc_driver.webrtc_driver import Go2WebRTCConnection
    return Go2WebRTCConnection, WebRTCConnectionMethod


class Emitter:
    def __init__(self, output):
        self.output = output
        self.last_frame = float("-inf")
        self.count = 0
        self._lock = threading.Lock()

    def _send(self, event):
        encoded = json.dumps(event, ensure_ascii=True, separators=(",", ":")).encode() + b"\n"
        pending = memoryview(encoded)
        while pending:
            written = self.output.write(pending)
            if not written:
                raise BrokenPipeError("closed bridge output")
            pending = pending[written:]
        self.output.flush()

    def status(self, status, stage, code):
        if code not in MESSAGES:
            code = "decode_failed"
        with self._lock:
            self._send({"type": "status", "status": status, "stage": stage, "code": code})

    def image(self, image):
        now = time.monotonic()
        with self._lock:
            if now - self.last_frame < 1 / MAX_FPS:
                return
            import cv2
            if image.ndim != 3 or image.shape[2] != 3:
                raise ValueError(MESSAGES["decode_failed"])
            height, width = image.shape[:2]
            if width < 1 or height < 1 or width * height > MAX_INPUT_PIXELS:
                raise ValueError(MESSAGES["decode_failed"])
            scale = min(1.0, MAX_WIDTH / width, MAX_HEIGHT / height)
            if scale < 1:
                image = cv2.resize(image, (max(1, int(width * scale)), max(1, int(height * scale))),
                                   interpolation=cv2.INTER_AREA)
            height, width = image.shape[:2]
            ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not ok or len(encoded) > MAX_JPEG_BYTES:
                raise ValueError(MESSAGES["decode_failed"])
            self._send({"type": "frame", "jpeg": base64.b64encode(encoded).decode("ascii"),
                        "width": width, "height": height})
            self.last_frame = now
            self.count += 1


def decode_rtsp(config, emitter, stopped):
    import av
    try:
        config = {**config, "host": resolve_host(config["host"], config["port"])}
    except Exception as error:
        raise _failure(error, "dns") from None
    emitter.status("connecting", "dns", "dns_ok")
    try:
        with socket.create_connection((config["host"], config["port"]), timeout=OPEN_TIMEOUT):
            pass
    except OSError as error:
        raise _failure(error, "network") from None
    emitter.status("connecting", "network", "network_ok")
    av.logging.set_level(av.logging.PANIC)
    options = {"rtsp_transport": "tcp", "protocol_whitelist": "rtsp,tcp,rtp",
               "rw_timeout": str(int(READ_TIMEOUT * 1_000_000)),
               "timeout": str(int(OPEN_TIMEOUT * 1_000_000))}
    stage = "stream"
    try:
        with av.open(rtsp_url(config), mode="r", options=options,
                     timeout=(OPEN_TIMEOUT, READ_TIMEOUT)) as container:
            if not container.streams.video:
                raise BridgeFailure("decode", "unsupported_stream")
            emitter.status("connecting", "stream", "stream_ok")
            stage = "decode"
            emitter.status("connecting", "decode", "decoding")
            stream = container.streams.video[0]
            stream.thread_type = "SLICE"
            for frame in container.decode(stream):
                if stopped.is_set():
                    return
                if frame.width * frame.height > MAX_INPUT_PIXELS:
                    raise BridgeFailure("decode", "unsupported_stream")
                if time.monotonic() - emitter.last_frame >= 1 / MAX_FPS:
                    emitter.image(frame.to_ndarray(format="bgr24"))
        raise EOFError(MESSAGES["decode_failed"])
    except Exception as error:
        raise _failure(error, stage) from None


async def decode_go2(config, emitter, stopped):
    connection_class, methods = load_go2()
    try:
        host = resolve_host(config["host"], config["port"])
    except Exception as error:
        raise _failure(error, "dns") from None
    emitter.status("connecting", "dns", "dns_ok")
    method = getattr(methods, config["go2Mode"])
    # Local modes must not pass username/password: the driver would fetch a cloud token.
    connection = connection_class(method, ip=host)
    callbacks = set()
    failed = asyncio.Event()

    async def consume(track):
        task = asyncio.current_task()
        callbacks.add(task)
        try:
            while not stopped.is_set():
                frame = await asyncio.wait_for(track.recv(), READ_TIMEOUT)
                if frame.width * frame.height > MAX_INPUT_PIXELS:
                    raise ValueError(MESSAGES["decode_failed"])
                if time.monotonic() - emitter.last_frame >= 1 / MAX_FPS:
                    emitter.image(frame.to_ndarray(format="bgr24"))
        except Exception:
            failed.set()
        finally:
            callbacks.discard(task)

    async def connect_and_register():
        # 0.2.1 creates video inside connect(); register as soon as it exists,
        # before the track event can enter its callback loop.
        task = asyncio.create_task(connection.connect())
        try:
            while not task.done() and getattr(connection, "video", None) is None:
                await asyncio.sleep(0)
            if getattr(connection, "video", None) is not None:
                connection.video.add_track_callback(consume)
            await task
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    try:
        await asyncio.wait_for(connect_and_register(), OPEN_TIMEOUT + 5)
        if not connection.isConnected:
            raise BridgeFailure("stream", "stream_failed")
        emitter.status("connecting", "network", "network_ok")
        emitter.status("connecting", "stream", "stream_ok")
        connection.video.switchVideoChannel(True)
        started = time.monotonic()
        while not stopped.is_set():
            if failed.is_set() or not connection.isConnected:
                raise RuntimeError(MESSAGES["decode_failed"])
            if time.monotonic() - max(started, emitter.last_frame) > READ_TIMEOUT:
                raise TimeoutError(MESSAGES["stale"])
            await asyncio.sleep(0.1)
    except Exception as error:
        raise _failure(error, "stream" if not connection.isConnected else "decode") from None
    finally:
        if getattr(connection, "video", None) is not None:
            try:
                connection.video.switchVideoChannel(False)
            except Exception:
                pass
        for task in tuple(callbacks):
            task.cancel()
        if callbacks:
            await asyncio.gather(*tuple(callbacks), return_exceptions=True)
        try:
            await asyncio.wait_for(connection.disconnect(), 2)
        except (Exception, SystemExit):
            pass


def run(config, emitter, stopped):
    attempt = 0
    while not stopped.is_set():
        emitter.status("connecting" if not attempt else "reconnecting", "dns", "connecting")
        count = emitter.count
        try:
            if config["kind"] == "go2":
                asyncio.run(decode_go2(config, emitter, stopped))
            elif config["kind"] in ("usb", "http_snapshot", "http_mjpeg"):
                if __package__:
                    from .bridge_sources import decode_http, decode_usb
                else:
                    from bridge_sources import decode_http, decode_usb
                decoder = decode_usb if config["kind"] == "usb" else decode_http
                decoder(config, emitter, stopped)
            else:
                decode_rtsp(config, emitter, stopped)
            if stopped.is_set():
                break
        except (ImportError, ModuleNotFoundError):
            emitter.status("error", "runtime", "runtime")
            return 2
        except (Exception, SystemExit) as error:
            # Never serialize a driver exception; native exceptions can embed full URLs.
            stage, code = classify_failure(error, "decode" if emitter.count > count else "stream")
            emitter.status("reconnecting", stage, code)
        if emitter.count > count:
            attempt = 0
        if stopped.wait(min(15.0, 0.5 * 2 ** min(attempt, 5))):
            break
        attempt += 1
    emitter.status("stopped", "stopped", "stopped")
    return 0


def main():
    output = isolated_output()
    emitter = Emitter(output)
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    try:
        payload = sys.stdin.buffer.readline(MAX_CONFIG_BYTES + 1)
        if len(payload) > MAX_CONFIG_BYTES or not payload.endswith(b"\n"):
            raise ValueError(MESSAGES["config"])
        config = validate_config(json.loads(payload))
    except Exception:
        emitter.status("error", "config", "config")
        return 2
    try:
        return run(config, emitter, stopped)
    except (Exception, SystemExit):
        return 2
    finally:
        output.close()


if __name__ == "__main__":
    raise SystemExit(main())
