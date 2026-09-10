"""Loopback-only static server with a single-page-app fallback."""
from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


class ApplicationHandler(SimpleHTTPRequestHandler):
    root: Path

    def translate_path(self, path: str) -> str:
        parts = [part for part in PurePosixPath(unquote(urlsplit(path).path)).parts if part not in ("/", ".", "..")]
        requested = self.root.joinpath(*parts).resolve()
        if requested.is_file():
            return str(requested)
        if Path(urlsplit(path).path).suffix:
            return str(requested)
        return str(self.root / "index.html")

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
