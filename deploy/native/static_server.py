"""Loopback-only static server with a single-page-app fallback."""
from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PureWindowsPath
from urllib.parse import unquote, urlsplit


class ApplicationHandler(SimpleHTTPRequestHandler):
    root: Path

    def translate_path(self, path: str) -> str:
        decoded = unquote(urlsplit(path).path)
        parts = [part for part in decoded.split("/") if part]
        # Reject Windows path syntax before resolving anything, including UNC shares.
        if decoded.startswith("//") or any(
            "\\" in part or ":" in part or "\0" in part
            or part != part.rstrip(" .") or PureWindowsPath(part).is_reserved()
            for part in parts
        ):
            raise PermissionError("Invalid public path")
        root = self.root.resolve()
        requested = root.joinpath(*parts).resolve()
        if not requested.is_relative_to(root):
            raise PermissionError("Path outside public directory")
        if requested.is_file():
            return str(requested)
        if Path(decoded).suffix:
            return str(requested)
        index = (root / "index.html").resolve()
        if not index.is_relative_to(root):
            raise PermissionError("Index outside public directory")
        return str(index)

    def send_head(self):
        try:
            return super().send_head()
        except (OSError, ValueError, RuntimeError):
            self.send_error(HTTPStatus.FORBIDDEN, "Invalid public path")
            return None

    def log_message(self, _format: str, *_args) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    ApplicationHandler.root = args.directory.resolve(strict=True)
    with ThreadingHTTPServer(("127.0.0.1", args.port), ApplicationHandler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
