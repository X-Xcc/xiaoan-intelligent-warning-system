"""YOLO source-compatible HTTP polling/MJPEG and local DirectShow capture."""
from __future__ import annotations

import http.client
import io
import os
import socket
import time
from urllib.request import (HTTPBasicAuthHandler, HTTPDigestAuthHandler, HTTPHandler,
                            HTTPPasswordMgrWithDefaultRealm, HTTPRedirectHandler, HTTPSHandler,
                            ProxyHandler, Request, build_opener)
from urllib.error import HTTPError, URLError

if __package__:
    from .bridge_config import MAX_FPS, resolve_host
    from .bridge_worker import BridgeFailure, MAX_INPUT_PIXELS, READ_TIMEOUT, _failure
else:
    from bridge_config import MAX_FPS, resolve_host
    from bridge_worker import BridgeFailure, MAX_INPUT_PIXELS, READ_TIMEOUT, _failure

MAX_HTTP_IMAGE_BYTES = 8_000_000


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, *_):
        response.close()
        raise BridgeFailure("stream", "stream_failed")


def _opener(config, address, url):
    def factory(connection_type):
        def create(host, **kwargs):
            connection = connection_type(host, **kwargs)
            # Keep the original Host and TLS hostname while pinning the validated IP.
            connection._create_connection = lambda target, timeout, source_address=None: socket.create_connection(
                (address, target[1]), timeout, source_address)
            return connection
        return create

    class PinnedHttp(HTTPHandler):
        def http_open(self, request):
            return self.do_open(factory(http.client.HTTPConnection), request)

    class PinnedHttps(HTTPSHandler):
        def https_open(self, request):
            return self.do_open(factory(http.client.HTTPSConnection), request, context=self._context)

    class Basic(HTTPBasicAuthHandler):
        def http_error_401(self, request, response, *args):
            try:
                return super().http_error_401(request, response, *args)
            finally:
                response.close()

    class Digest(HTTPDigestAuthHandler):
        def http_error_401(self, request, response, *args):
            try:
                return super().http_error_401(request, response, *args)
            finally:
                response.close()

    credentials = HTTPPasswordMgrWithDefaultRealm()
    credentials.add_password(None, url, config["username"], config["password"])
    return build_opener(ProxyHandler({}), _NoRedirect(), PinnedHttp(), PinnedHttps(),
                        Digest(credentials), Basic(credentials))


class _CameraStream:
    def __init__(self, response, stopped):
        self.response, self.stopped, self.received = response, stopped, 0

    def read(self, size=-1):
        if self.stopped.is_set():
            return b""
        data = self.response.read1(min(65536, size) if size >= 0 else 65536)
        self.received += len(data)
        if self.received > MAX_HTTP_IMAGE_BYTES:
            raise BridgeFailure("decode", "unsupported_stream")
        return data

    def readable(self):
        return True

    def seekable(self):
        return False


def _snapshot_image(response):
    import av
    length = response.headers.get("Content-Length")
    if length is not None and (not length.isdigit() or int(length) > MAX_HTTP_IMAGE_BYTES):
        raise BridgeFailure("decode", "unsupported_stream")
    content = response.read(MAX_HTTP_IMAGE_BYTES + 1)
    if len(content) > MAX_HTTP_IMAGE_BYTES:
        raise BridgeFailure("decode", "unsupported_stream")
    if not content.startswith(b"\xff\xd8") or not content.endswith(b"\xff\xd9"):
        raise BridgeFailure("decode", "unsupported_stream")
    pixel_options = {"max_pixels": str(MAX_INPUT_PIXELS)}
    with av.open(io.BytesIO(content), format="mjpeg", options=pixel_options) as container:
        stream = container.streams.video[0]
        stream.codec_context.options.update(pixel_options)
        if stream.width * stream.height > MAX_INPUT_PIXELS:
            raise BridgeFailure("decode", "unsupported_stream")
        frame = next(container.decode(stream))
        if frame.width * frame.height > MAX_INPUT_PIXELS:
            raise BridgeFailure("decode", "unsupported_stream")
        return frame.to_ndarray(format="bgr24")


def decode_http(config, emitter, stopped):
    stage = "dns"
    try:
        address = resolve_host(config["host"], config["port"])
        emitter.status("connecting", "dns", "dns_ok")
        host = f'[{config["host"]}]' if ":" in config["host"] else config["host"]
        url = f'{config["httpScheme"]}://{host}:{config["port"]}{config["httpPath"]}'
        opener = _opener(config, address, url)
        stage = "stream"
        connected = False
        while not stopped.is_set():
            request = Request(url, headers={"Accept": "multipart/x-mixed-replace, image/jpeg",
                                           "User-Agent": "DeviceBridge/1.0", "Cache-Control": "no-cache"})
            with opener.open(request, timeout=READ_TIMEOUT) as response:
                if response.status != 200:
                    raise BridgeFailure("stream", "stream_failed")
                if not connected:
                    emitter.status("connecting", "network", "network_ok")
                content_type = response.headers.get_content_type()
                expected = "multipart/x-mixed-replace" if config["kind"] == "http_mjpeg" else "image/jpeg"
                if content_type != expected:
                    raise BridgeFailure("decode", "unsupported_stream")
                if not connected:
                    emitter.status("connecting", "stream", "stream_ok")
                    connected = True
                stage = "decode"
                if config["kind"] == "http_snapshot":
                    image = _snapshot_image(response)
                    if not stopped.is_set():
                        emitter.image(image)
                else:
                    import av
                    av.logging.set_level(av.logging.PANIC)
                    source = _CameraStream(response, stopped)
                    # Apply the native allocation limit during probing and every decode.
                    pixel_options = {"max_pixels": str(MAX_INPUT_PIXELS)}
                    with av.open(source, mode="r", format="mpjpeg", buffer_size=4096,
                                 options={"probesize": "32768", "analyzeduration": "0",
                                          **pixel_options}) as container:
                        stream = container.streams.video[0]
                        stream.codec_context.options.update(pixel_options)
                        for frame in container.decode(stream):
                            if stopped.is_set():
                                return
                            if frame.width * frame.height > MAX_INPUT_PIXELS:
                                raise BridgeFailure("decode", "unsupported_stream")
                            source.received = 0
                            emitter.image(frame.to_ndarray(format="bgr24"))
                    if not stopped.is_set():
                        raise BridgeFailure("decode", "decode_failed")
            if stopped.wait(1.0):
                return
            stage = "stream"
    except HTTPError as error:
        error.close()
        if error.code in (401, 403):
            raise BridgeFailure("stream", "auth_failed") from None
        raise BridgeFailure("stream", "stream_failed") from None
    except URLError as error:
        raise _failure(error.reason, "network") from None
    except Exception as error:
        raise _failure(error, stage) from None


def decode_usb(config, emitter, stopped):
    import cv2
    capture = None
    try:
        backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY
        capture = cv2.VideoCapture(config["usbIndex"], backend)
        if not capture.isOpened():
            raise BridgeFailure("stream", "connect_failed")
        capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc("M", "J", "P", "G"))
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        capture.set(cv2.CAP_PROP_FPS, 30)
        emitter.status("connecting", "stream", "stream_ok")
        while not stopped.is_set():
            started = time.monotonic()
            ok, image = capture.read()
            if not ok or image is None:
                raise BridgeFailure("decode", "decode_failed")
            emitter.image(image)
            stopped.wait(max(0, 1 / MAX_FPS - (time.monotonic() - started)))
    except Exception as error:
        raise _failure(error, "decode") from None
    finally:
        if capture is not None:
            capture.release()
