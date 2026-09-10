"""Authenticated, atomic local JSON persistence. No plaintext configuration files."""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile

from cryptography.fernet import Fernet

MAX_STORE_BYTES = 524288
STORAGE_ERROR = "\u8bbe\u5907\u52a0\u5bc6\u5b58\u50a8\u8bfb\u5199\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u76ee\u5f55\u6743\u9650\u548c\u5bc6\u94a5\u5907\u4efd"


class BridgeStore:
    def __init__(self, directory=None):
        self.directory = Path(directory or os.getenv("CICSIC_BRIDGE_DATA_DIR")
                              or Path(__file__).resolve().parents[2] / ".secrets" / "device-bridges")
        try:
            self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            key_path = self.directory / "fernet.key"
            if not key_path.exists():
                if (self.directory / "devices.json").exists() or (self.directory / "bindings.json").exists():
                    raise ValueError("missing key")
                temporary = self._temporary(Fernet.generate_key())
                try:
                    # A hard link publishes a completely written key without replacing a winner.
                    try:
                        os.link(temporary, key_path)
                    except FileExistsError:
                        pass
                finally:
                    temporary.unlink(missing_ok=True)
            if key_path.is_symlink() or key_path.stat().st_size != 44:
                raise ValueError("invalid key")
            self.cipher = Fernet(key_path.read_bytes())
        except Exception:
            raise RuntimeError(STORAGE_ERROR) from None

    def _temporary(self, content: bytes) -> Path:
        descriptor, name = tempfile.mkstemp(suffix=".tmp", dir=self.directory)
        path = Path(name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        return path

    def load(self, name: str, default):
        path = self.directory / name
        try:
            if not path.exists():
                return default
            if path.is_symlink() or path.stat().st_size > MAX_STORE_BYTES:
                raise ValueError("invalid storage file")
            encrypted = json.loads(path.read_bytes())
            if encrypted["version"] != 1 or not isinstance(encrypted["ciphertext"], str):
                raise ValueError("invalid storage version")
            return json.loads(self.cipher.decrypt(encrypted["ciphertext"].encode("ascii")))
        except Exception:
            raise RuntimeError(STORAGE_ERROR) from None

    def save(self, name: str, value) -> None:
        temporary = None
        try:
            plaintext = json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode()
            content = json.dumps({"version": 1, "ciphertext":
                                  self.cipher.encrypt(plaintext).decode("ascii")}).encode()
            if len(content) > MAX_STORE_BYTES:
                raise ValueError("storage limit")
            temporary = self._temporary(content)
            os.replace(temporary, self.directory / name)
        except Exception:
            raise RuntimeError(STORAGE_ERROR) from None
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
