"""Package or activate the original dashboard with integrated voice; no API/data writes."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
from datetime import datetime, timezone


def package():
    root = Path(__file__).resolve().parents[1]
    build = root / "tmp/integrated-voice-build"
    output = root / "tmp/integrated-voice-release.tar.gz"
    files = [p for p in build.rglob("*") if p.is_file()
             and ("command" not in p.relative_to(build).parts
                  or p.relative_to(build).as_posix().startswith("command/voice/yaoyao/"))]
    manifest = {p.relative_to(build).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    with tarfile.open(output, "w:gz") as archive:
        for p in files:
            archive.add(p, arcname=p.relative_to(build).as_posix())
    (root / "tmp/integrated-voice-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(json.dumps({"archive": str(output), "bytes": output.stat().st_size, "files": len(files)}))


def activate(stage):
    stage = Path(stage).resolve()
    assert stage.parent == Path("/opt/public-security-web/staging")
    site = Path("/www/wwwroot/public-security-web").resolve()
    assert site == Path("/www/wwwroot/public-security-web")
    manifest = json.loads((stage / "manifest.json").read_text())
    unpack = stage / "unpacked"
    unpack.mkdir(exist_ok=True)
    with tarfile.open(stage / "release.tar.gz") as archive:
        for item in archive.getmembers():
            target = (unpack / item.name).resolve()
            assert unpack in target.parents and item.isfile(), item.name
        archive.extractall(unpack)
    for name, checksum in manifest.items():
        assert hashlib.sha256((unpack / name).read_bytes()).hexdigest() == checksum, name
    backup = Path("/opt/public-security-web/backups") / ("original-voice-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    backup.mkdir(mode=0o700)
    with tarfile.open(backup / "web-before.tar.gz", "w:gz") as archive:
        archive.add(site, arcname="public-security-web")
    shutil.copy2(site / "index.html", backup / "index-before.html")
    shutil.copy2(site / "command/index.html", backup / "command-index-before.html")
    # New hashed bundles and missing static resources only. Existing media stays untouched.
    added = []
    for name in manifest:
        if name == "index.html":
            continue
        target = site / name
        if target.exists():
            if name.startswith(("assets/", "command/voice/")):
                assert hashlib.sha256(target.read_bytes()).hexdigest() == manifest[name], name
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(unpack / name, target)
        target.chmod(0o644)
        added.append(name)
    for directory in site.rglob("*"):
        if directory.is_dir():
            directory.chmod(0o755)
    try:
        for name in ["index.html", "command/index.html"]:
            target = site / name
            temporary = target.with_name("index.voice-pending.html")
            shutil.copyfile(unpack / "index.html", temporary)
            temporary.chmod(0o644)
            temporary.replace(target)
    except Exception:
        shutil.copyfile(backup / "index-before.html", site / "index.html")
        shutil.copyfile(backup / "command-index-before.html", site / "command/index.html")
        raise
    result = {"backup": str(backup), "addedFiles": added, "mainSha256": manifest["index.html"],
              "backendChanged": False, "databaseChanged": False}
    (backup / "release.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate")
    args = parser.parse_args()
    activate(args.activate) if args.activate else package()
