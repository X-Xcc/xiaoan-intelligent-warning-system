from __future__ import annotations

import asyncio
import logging
import os
import platform
import sys
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

log = logging.getLogger("go2-video-bridge")

CAMERA_ID = "robot-dog-01"
CAMERA_NAME = "机械狗巡检视角"
CAMERA_AREA = "东门主通道 · 低位巡检"
CAMERA_SOURCE = "ROBOT-DOG-01"


@dataclass
class BridgeState:
    """Thread-safe latest-frame store shared by the WebRTC and HTTP threads."""

    def __post_init__(self) -> None:
        self._condition = threading.Condition()
        self._jpeg: bytes | None = None
        self._frame_version = 0
        self._connected = False
        self._last_error = ""
        self._last_frame = 0.0

    def set_connected(self, connected: bool, error: str = "") -> None:
        with self._condition:
            self._connected = connected
            self._last_error = error
            if not connected:
                self._jpeg = None
            self._condition.notify_all()

    def publish(self, jpeg: bytes) -> None:
        if not jpeg:
            return
        with self._condition:
            self._jpeg = jpeg
            self._last_frame = time.monotonic()
            self._frame_version += 1
            self._connected = True
            self._last_error = ""
            self._condition.notify_all()

    def snapshot(self) -> tuple[bytes | None, int, bool, str]:
        with self._condition:
            online = self._connected and self._jpeg is not None and time.monotonic() - self._last_frame < 5
            return self._jpeg if online else None, self._frame_version, online, self._last_error

    def wait_for_frame(self, previous_version: int, timeout: float) -> tuple[bytes | None, int]:
        with self._condition:
            self._condition.wait_for(lambda: self._frame_version > previous_version or not self._connected, timeout=timeout)
            jpeg, version, _, _ = self.snapshot()
            return jpeg if version > previous_version else None, version


def camera_payload(state: BridgeState) -> dict[str, Any]:
    _, _, connected, _ = state.snapshot()
    return {
        "items": [{
            "id": CAMERA_ID,
            "name": CAMERA_NAME,
            "online": connected,
            "area": CAMERA_AREA,
            "source": CAMERA_SOURCE,
            "feedUrl": f"/video_feed?cam={CAMERA_ID}",
        }],
        "upstreamOnline": connected,
    }


def encode_mjpeg_part(jpeg_bytes: bytes) -> bytes:
    return b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpeg_bytes)).encode("ascii") + b"\r\n\r\n" + jpeg_bytes + b"\r\n"


def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def configure_windows_console_encoding(
    streams: tuple[Any, ...] = (sys.stdout, sys.stderr),
    is_windows: bool | None = None,
) -> None:
    """Keep third-party Unicode status output from failing under Windows GBK consoles."""
    if is_windows is None:
        is_windows = os.name == "nt"
    if not is_windows:
        return

    for stream in streams:
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="backslashreplace")


configure_windows_console_encoding()


@contextmanager
def windows_platform_import_guard(platform_module: Any = platform, is_windows: bool | None = None) -> Iterator[None]:
    """Avoid Windows WMI lookups while importing the driver's optional dependencies."""
    if is_windows is None:
        is_windows = os.name == "nt"
    if not is_windows:
        yield
        return

    original_system = platform_module.system
    original_machine = platform_module.machine
    platform_module.system = lambda: "Windows"
    platform_module.machine = lambda: "AMD64"
    try:
        yield
    finally:
        platform_module.system = original_system
        platform_module.machine = original_machine


class Go2FrameProvider:
    """Adapts go2-webrtc-connect's async video track to JPEG callbacks."""

    def __init__(self, state: BridgeState) -> None:
        self.state = state
        self.ip = os.getenv("GO2_IP", "").strip()
        self.serial = os.getenv("GO2_SERIAL", "").strip() or None
        self._connection: Any = None
        self._stopped = threading.Event()

    def stop(self) -> None:
        self._stopped.set()

    def start(self) -> None:
        thread = threading.Thread(target=self._thread_main, name="go2-webrtc", daemon=True)
        thread.start()

    def _thread_main(self) -> None:
        asyncio.run(self._run())

    async def _run(self) -> None:
        if not self.ip and not self.serial and os.getenv("GO2_CONNECT_MODE", "LocalSTA").lower() != "localap":
            self.state.set_connected(False, "请设置 GO2_IP 或 GO2_SERIAL")
            log.error("GO2_IP or GO2_SERIAL is required")
            return
        try:
            with windows_platform_import_guard():
                from go2_webrtc_driver.constants import WebRTCConnectionMethod
                from go2_webrtc_driver.webrtc_driver import Go2WebRTCConnection

            method_name = os.getenv("GO2_CONNECT_MODE", "LocalSTA").strip().lower()
            if method_name == "localap":
                method = WebRTCConnectionMethod.LocalAP
            elif method_name == "localsta":
                method = WebRTCConnectionMethod.LocalSTA
            else:
                raise ValueError("Only LocalSTA and LocalAP are supported")

            kwargs: dict[str, Any] = {"serialNumber": self.serial, "ip": self.ip or None}
            connection = Go2WebRTCConnection(method, **kwargs)
            self._connection = connection
            await connection.connect()
            connection.video.add_track_callback(self._consume_track)
            connection.video.switchVideoChannel(True)
            while not self._stopped.is_set() and connection.isConnected:
                await asyncio.sleep(0.5)
        except (Exception, SystemExit) as exc:
            self.state.set_connected(False, str(exc))
            log.exception("Go2 video connection failed")
        finally:
            self.state.set_connected(False, self.state.snapshot()[3])
            if self._connection is not None:
                try:
                    await self._connection.disconnect()
                except Exception:
                    log.debug("Error while disconnecting Go2", exc_info=True)

    async def _consume_track(self, track: Any) -> None:
        try:
            import cv2
        except ImportError as exc:
            self.state.set_connected(False, "缺少 opencv-python-headless，请安装桥接依赖")
            raise RuntimeError("opencv-python-headless is required") from exc

        while not self._stopped.is_set():
            frame = await track.recv()
            image = frame.to_ndarray(format="bgr24")
            ok, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
            if ok:
                self.state.publish(encoded.tobytes())


def _frame_stream(state: BridgeState) -> Iterator[bytes]:
    jpeg, version, connected, error = state.snapshot()
    if not connected or jpeg is None:
        raise HTTPException(status_code=503, detail=error or "Go2 尚未提供视频帧")
    yield encode_mjpeg_part(jpeg)
    while True:
        jpeg, version = state.wait_for_frame(version, timeout=5)
        if jpeg is None:
            return
        yield encode_mjpeg_part(jpeg)


def create_app(state: BridgeState | None = None) -> FastAPI:
    bridge_state = state or BridgeState()
    app = FastAPI(title="CICSIC Go2 Video Bridge", version="0.1.0")
    provider: Go2FrameProvider | None = None

    @app.on_event("startup")
    def startup() -> None:
        nonlocal provider
        if _env_bool("GO2_VIDEO_AUTOSTART", True):
            provider = Go2FrameProvider(bridge_state)
            provider.start()

    @app.on_event("shutdown")
    def shutdown() -> None:
        if provider is not None:
            provider.stop()

    @app.get("/health")
    def health() -> dict[str, Any]:
        _, _, connected, error = bridge_state.snapshot()
        return {"service": "go2-video-bridge", "online": connected, "error": error or None}

    @app.get("/api/cameras")
    def cameras() -> dict[str, Any]:
        return camera_payload(bridge_state)

    @app.get("/api/stats/summary")
    def stats() -> dict[str, Any]:
        _, _, connected, _ = bridge_state.snapshot()
        return {"people": 0, "fire": 0, "abnormal": 0, "distance": 0, "online": connected}

    @app.get("/video_feed")
    def video_feed(cam: str = CAMERA_ID) -> StreamingResponse:
        if cam != CAMERA_ID:
            raise HTTPException(status_code=404, detail=f"未知视频源: {cam}")
        jpeg, _, online, error = bridge_state.snapshot()
        if not online or jpeg is None:
            raise HTTPException(status_code=503, detail=error or "Go2 尚未提供视频帧")
        return StreamingResponse(_frame_stream(bridge_state), media_type="multipart/x-mixed-replace; boundary=frame")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    uvicorn.run(app, host=os.getenv("GO2_VIDEO_HOST", "127.0.0.1"), port=int(os.getenv("GO2_VIDEO_PORT", "5000")))
