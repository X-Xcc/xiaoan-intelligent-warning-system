from __future__ import annotations

import os
import sys

import uvicorn


def normalize_windows_path_env() -> None:
    if os.name != "nt":
        return

    path_values: list[str] = []
    for key in list(os.environ):
        if key.lower() == "path":
            value = os.environ.pop(key, "")
            if value:
                path_values.append(value)

    if path_values:
        os.environ["Path"] = os.pathsep.join(dict.fromkeys(path_values))


def main() -> None:
    normalize_windows_path_env()
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")

    reload = "--no-reload" not in sys.argv
    uvicorn.run(
        "app.main:app",
        app_dir="server",
        host="127.0.0.1",
        port=8010,
        reload=reload,
    )


if __name__ == "__main__":
    main()
