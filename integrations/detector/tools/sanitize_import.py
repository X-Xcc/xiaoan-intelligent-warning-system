"""Mechanical privacy cleanup for this imported source tree, never the source repo."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_IP = re.compile(r"\b(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)\b")


def main():
    changed = 0
    sources = [
        path for folder in ("detection", "server/src", "web/src")
        for path in (ROOT / folder).rglob("*")
        if path.is_file() and path.suffix in {".py", ".java", ".properties", ".ts", ".tsx"}
    ]
    addresses = sorted({match.group() for path in sources
                        for match in PRIVATE_IP.finditer(path.read_text(encoding="utf-8-sig"))})
    replacements = {value: f"192.0.2.{index + 1}" for index, value in enumerate(addresses)}
    for path in sources:
        original = path.read_text(encoding="utf-8-sig")
        text = original
        if path.name == "CameraSnapshotService.java":
            for key, default in (("enabled", "false"), ("address", ""), ("username", ""), ("password", "")):
                text = re.sub(r'@Value\("\$\{app\.camera\.snapshot\.' + key + r':[^"]*\}"\)',
                              '@Value("${app.camera.snapshot.' + key + ':' + default + '}")', text)
            text = re.sub(r'static final String CAMERA_ID = "[^"]*";',
                          '@Value("${app.camera.snapshot.id:http-snapshot}")\n    String cameraId;', text)
            text = text.replace("CAMERA_ID", "cameraId")
        text = PRIVATE_IP.sub(lambda match: replacements[match.group()], text)
        if text != original:
            path.write_text(text, encoding="utf-8", newline="\n")
            changed += 1
    print(f"Sanitized source files: {changed}; address literals replaced: {len(addresses)}")


if __name__ == "__main__":
    main()
