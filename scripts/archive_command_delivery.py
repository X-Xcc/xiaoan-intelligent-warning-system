"""Archive only manifest-listed delivery files; never deploy or collect secrets."""
import hashlib
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / "deliverables/command/manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
output = ROOT / "deliverables/command/command-yaoyao-20260907.tar.gz"
paths = []
for entry in manifest["files"]:
    relative = Path(entry["path"])
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT) or path.is_symlink():
        raise RuntimeError(f"Unsafe path: {relative}")
    if any(part in {"tmp", ".git", ".ssh"} or part.startswith(".env") for part in relative.parts):
        raise RuntimeError(f"Excluded path: {relative}")
    if path.suffix in {".db", ".sqlite", ".sqlite3", ".pem", ".key"}:
        raise RuntimeError(f"Excluded file: {relative}")
    data = path.read_bytes()
    if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
        raise RuntimeError(f"Manifest is stale: {relative}")
    paths.append((path, relative.as_posix()))
with tarfile.open(output, "w:gz") as archive:
    for path, name in paths:
        archive.add(path, arcname=name, recursive=False)
    archive.add(manifest_path, arcname="deliverables/command/manifest.json", recursive=False)
with tarfile.open(output, "r:gz") as archive:
    assert len(archive.getmembers()) == len(paths) + 1
    assert all(member.isfile() for member in archive.getmembers())
print(json.dumps({"archive": str(output), "files": len(paths) + 1,
                  "bytes": output.stat().st_size,
                  "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}))
