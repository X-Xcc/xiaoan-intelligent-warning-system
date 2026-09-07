"""User-approved image-service adapter for fictional preview generation."""

import argparse
import base64
import binascii
from contextlib import ExitStack
import io
import ipaddress
import json
import os
from pathlib import Path
import socket
import sys
from urllib.parse import urljoin, urlsplit
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, build_opener

from openai import OpenAI
from PIL import Image, PngImagePlugin

MAX_BYTES = 40 * 1024 * 1024


def validate_url(url):
    parts = urlsplit(url)
    if (parts.scheme != "https" or not parts.hostname or parts.username
            or parts.password or parts.hostname.lower() == "localhost"):
        raise ValueError("Image download requires a public HTTPS URL")
    try:
        address = ipaddress.ip_address(parts.hostname)
    except ValueError:
        return
    if not address.is_global:
        raise ValueError("Image download requires a public HTTPS URL")


def download_image(url):
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, message, headers, newurl):
            return None

    # Never forward the generation API credential to a CDN.
    client = build_opener(NoRedirect())
    for _ in range(5):
        validate_url(url)
        parts = urlsplit(url)
        addresses = socket.getaddrinfo(parts.hostname, parts.port or 443)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError("Image download destination is not public")
        try:
            response = client.open(url, timeout=90)
        except HTTPError as error:
            if error.code not in (301, 302, 303, 307, 308):
                raise
            location = error.headers.get("location")
            error.close()
            if not location:
                raise ValueError("Image redirect has no destination")
            url = urljoin(url, location)
            continue
        with response:
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError("Image exceeds download limit")
            return raw
    raise ValueError("Too many image redirects")


def image_bytes(payload, download=download_image):
    items = payload.get("data")
    if not isinstance(items, list) or len(items) != 1 or not isinstance(items[0], dict):
        raise ValueError("Service did not return exactly one image")
    image = items[0]
    encoded = image.get("b64_json")
    if isinstance(encoded, str) and encoded:
        if len(encoded) > MAX_BYTES * 4 // 3 + 4:
            raise ValueError("Encoded image exceeds size limit")
        try:
            return base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            raise ValueError("Service returned invalid encoded image data") from None
    url = image.get("url")
    if isinstance(url, str) and url:
        validate_url(url)
        return download(url)
    raise ValueError("Service returned neither image data nor a download URL")


def save_image(raw, path):
    if path.exists():
        raise FileExistsError("Output already exists; choose a new filename")
    try:
        with Image.open(io.BytesIO(raw)) as check:
            check.verify()
        with Image.open(io.BytesIO(raw)) as source:
            source.load()
            if source.size != (1536, 1024):
                raise ValueError("Image dimensions do not match the requested preview")
            image = source.convert("RGB")
    except Exception:
        raise ValueError("Returned file is not a valid 1536x1024 preview image") from None
    metadata = PngImagePlugin.PngInfo()
    metadata.add_itxt("Description", "AI-generated fictional scene. Not real evidence.")
    metadata.add_itxt("Model", "gpt-image-2")
    encoded = io.BytesIO()
    image.save(encoded, "PNG", pnginfo=metadata)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as target:
        target.write(encoded.getvalue())

def request_image(client, prompt, images):
    options = dict(model="gpt-image-2", prompt=prompt, n=1,
                   size="1536x1024", quality="high")
    if not images:
        return client.images.generate(**options)
    with ExitStack() as stack:
        handles = [stack.enter_context(path.open("rb")) for path in images]
        return client.images.edit(image=handles, **options)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt-file", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--image", action="append", default=[], type=Path)
    args = parser.parse_args()
    if args.out.exists():
        raise FileExistsError("Output exists; generation was not requested")
    if not os.environ.get("OPENAI_API_KEY"):
        raise ValueError("Image API credential is missing")
    prompt = args.prompt_file.read_text(encoding="utf-8").strip()
    if not prompt:
        raise ValueError("Prompt is empty")
    for image in args.image:
        if not image.is_file() or image.stat().st_size > MAX_BYTES:
            raise ValueError("Reference image is missing or too large")
    print(f"Creating one fictional preview with {len(args.image)} supplied reference images.", flush=True)
    # An uncertain billable request is never automatically repeated.
    with OpenAI(timeout=180, max_retries=0) as client:
        result = request_image(client, prompt, args.image)
    payload = result.model_dump()
    items = payload.get("data") or []
    print(json.dumps({
        "response_items": len(items),
        "has_base64": bool(items and items[0].get("b64_json")),
        "has_download_url": bool(items and items[0].get("url")),
    }), flush=True)
    save_image(image_bytes(payload), args.out)
    print(json.dumps({"saved": str(args.out.resolve()), "size": [1536, 1024]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Upstream exception messages may contain signed URLs or request details.
        print(f"Image adapter failed ({type(error).__name__}); no automatic retry.", file=sys.stderr)
        sys.exit(1)
