"""Bounded signature checks for inert citizen evidence media.

These checks identify containers, not decoded/recognized media. Serving must
also set nosniff and sandbox headers, including for pre-existing uploads.
"""
from __future__ import annotations


MEDIA_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}
HEADER_LIMIT = 4096
MP4_BRANDS = {b"isom", b"iso2", b"iso3", b"iso4", b"iso5", b"iso6",
              b"mp41", b"mp42", b"avc1", b"dash", b"M4V ", b"MSNV"}


def media_type(header: bytes, size: int) -> str | None:
    header = header[:HEADER_LIMIT]
    if (size >= 33 and len(header) >= 33
            and header.startswith(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
            and int.from_bytes(header[16:20], "big") > 0
            and int.from_bytes(header[20:24], "big") > 0):
        return "image/png"
    if size >= 4 and len(header) >= 4 and header.startswith(b"\xff\xd8\xff") and header[3] not in {0, 0xff}:
        return "image/jpeg"
    if (size >= 20 and len(header) >= 20 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"
            and header[12:16] in {b"VP8 ", b"VP8L", b"VP8X"}
            and int.from_bytes(header[4:8], "little") + 8 == size):
        return "image/webp"
    if len(header) >= 16 and header[4:8] == b"ftyp":
        box_size = int.from_bytes(header[:4], "big")
        if (16 <= box_size <= min(size, len(header)) and box_size % 4 == 0
                and header[8:12] in MP4_BRANDS):
            return "video/mp4"
    if header.startswith(b"\x1a\x45\xdf\xa3") and b"\x42\x82\x84webm" in header:
        return "video/webm"
    return None


def validate_upload(content: bytes, declared_type: str | None) -> tuple[str, str]:
    mime = (declared_type or "").split(";", 1)[0].strip().lower()
    if mime not in MEDIA_EXTENSIONS or media_type(content, len(content)) != mime:
        raise ValueError("Only matching PNG, JPEG, WebP, MP4 or WebM evidence is supported")
    return mime, MEDIA_EXTENSIONS[mime]


def inline_media_type(header: bytes, size: int, suffix: str, declared_type: str | None = None) -> str | None:
    mime = media_type(header, size)
    extension = ".jpg" if suffix.lower() == ".jpeg" else suffix.lower()
    if (mime is None or extension != MEDIA_EXTENSIONS[mime]
            or (declared_type is not None and declared_type != mime)):
        return None
    return mime
