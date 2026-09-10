"""Portable, authenticated private migration bundles (Python 3.11+).

Format v1: >8s12sQ header (magic/version, nonce, ciphertext length), a stored
ZIP encrypted with AES-256-GCM, and a 16-byte tag. The entire header is AAD.
The ZIP contains manifest.json and data/<relative path> members. File sizes
and SHA-256 hashes are in the encrypted manifest; no names are in the header.

Only prepared, quiescent export directories are accepted. This module does
not create live database snapshots. Inputs/output parents must be trusted,
local directories, not concurrently replaced by another process. Keys are
independent 32-byte random values, stored separately as standard base64.
Uncompressed ZIP64 supports large videos, bounded by GCM's per-message limit
(slightly under 64 GiB, including ZIP overhead). Disk space is needed for a
plaintext ZIP plus the encrypted bundle or restored tree. Plaintext lives
only in private temporary directories and is removed, not securely erased.

No original ownership, permissions, timestamps, links, or special files are
restored: directories are private (0700), regular files 0600. Windows uses
the restricted ACL created by current Python's mode-0700 mkdir; use Python
3.11.10+, 3.12.4+, or newer on Windows. Directory publication requires atomic
no-replace rename (Windows, Linux, or macOS); unsupported systems fail closed.
"""

import argparse
import base64
import binascii
from contextlib import contextmanager
import ctypes
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import sys
import tempfile
import unicodedata
import zipfile

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


MAGIC = b"XIAOAN\x00\x01"
HEADER = struct.Struct(">8s12sQ")
TAG_BYTES = 16
CHUNK_BYTES = 1024 * 1024
MAX_ARCHIVE_BYTES = (1 << 36) - 32  # AES-GCM's maximum plaintext per nonce.
MAX_FILE_BYTES = MAX_ARCHIVE_BYTES
MAX_TOTAL_BYTES = MAX_ARCHIVE_BYTES
MAX_MEMBERS = 100_000  # Includes manifest.json and explicit directories.
MAX_MANIFEST_BYTES = 32 * 1024 * 1024
MAX_CENTRAL_DIRECTORY_BYTES = 32 * 1024 * 1024
MAX_PATH_BYTES = 1024
MAX_DEPTH = 64
FORMAT = "xiaoan-private-bundle"
MANIFEST_NAME = "manifest.json"
_RESERVED = {"CON", "PRN", "AUX", "NUL", "CLOCK$", "CONIN$", "CONOUT$"}
_RESERVED.update(prefix + number for prefix in ("COM", "LPT")
                 for number in "0123456789\u00b9\u00b2\u00b3")


def _check(condition, message="Invalid private bundle"):
    if not condition:
        raise ValueError(message)


def _plain_stat(value, *, directory=False):
    _check(not stat.S_ISLNK(value.st_mode)
           and not getattr(value, "st_file_attributes", 0) & 0x400,
           "Links and reparse points are not supported")
    _check(stat.S_ISDIR(value.st_mode) if directory else stat.S_ISREG(value.st_mode),
           "Only ordinary directories and files are supported")
    if not directory:
        _check(value.st_nlink == 1, "Hard links are not supported")


def _absolute(path):
    return Path(os.path.abspath(os.fspath(path)))


def _existing(path, *, directory=False):
    for parent in reversed(path.parents):
        _plain_stat(parent.lstat(), directory=True)
    value = path.lstat()
    _plain_stat(value, directory=directory)
    return value


def _new_path(path):
    _existing(path.parent, directory=True)
    if os.path.lexists(path):
        raise FileExistsError("Output already exists")


def _portable_path(name):
    _check(isinstance(name, str) and name and not name.startswith("/"),
           "Invalid archive path")
    _check("\\" not in name and len(name.encode("utf-8")) <= MAX_PATH_BYTES,
           "Invalid archive path")
    parts = name.split("/")
    _check(len(parts) <= MAX_DEPTH, "Archive path is too deep")
    for part in parts:
        _check(part not in ("", ".", "..") and part == part.rstrip(" ."),
               "Invalid archive path")
        _check(len(part.encode("utf-8")) <= 255
               and len(part.encode("utf-16-le")) <= 510, "Path component is too long")
        _check(not any(c in '<>:"\\|?*~' or unicodedata.category(c).startswith("C")
                       for c in part), "Nonportable archive path")
        _check(part.split(".")[0].rstrip(" ").upper() not in _RESERVED,
               "Reserved Windows path")
    return parts


def _register_path(name, kind, entries, aliases):
    parts = _portable_path(name)
    _check(name not in entries, "Duplicate archive path")
    for index in range(1, len(parts) + 1):
        prefix = "/".join(parts[:index])
        folded = unicodedata.normalize("NFC", prefix).casefold()
        _check(aliases.get(folded, prefix) == prefix, "Colliding archive paths")
        aliases[folded] = prefix
        _check(len(aliases) <= MAX_MEMBERS, "Too many archive path prefixes")
    entries[name] = kind


def _check_parents(entries):
    for name in entries:
        parts = name.split("/")
        for index in range(1, len(parts)):
            _check(entries.get("/".join(parts[:index])) == "directory",
                   "Missing directory or file/directory conflict")


def _signature(value):
    # Some Windows Python versions disagree on ctime between lstat and fstat.
    changed = value.st_ctime_ns if os.name != "nt" else 0
    return (value.st_dev, value.st_ino, stat.S_IFMT(value.st_mode), value.st_size,
            value.st_mtime_ns, changed)


def _scan_source(source):
    records, paths, aliases = [], {}, {}
    pending = [(source, "")]
    total = 0
    while pending:
        parent, prefix = pending.pop()
        _plain_stat(parent.lstat(), directory=True)
        with os.scandir(parent) as children:
            for child in children:
                name = prefix + child.name
                # Windows DirEntry.stat omits inode/link metadata; lstat does not.
                value = Path(child.path).lstat()
                is_directory = stat.S_ISDIR(value.st_mode)
                _plain_stat(value, directory=is_directory)
                kind = "directory" if is_directory else "file"
                _register_path(name, kind, paths, aliases)
                _check(len(paths) + 1 <= MAX_MEMBERS, "Too many archive members")
                if is_directory:
                    pending.append((Path(child.path), name + "/"))
                else:
                    _check(0 <= value.st_size <= MAX_FILE_BYTES, "File exceeds size limit")
                    total += value.st_size
                    _check(total <= MAX_TOTAL_BYTES, "Export exceeds size limit")
                records.append((name, kind, value.st_size, _signature(value)))
    return sorted(records)


@contextmanager
def _private_temp(parent):
    if os.name == "nt":
        version = sys.version_info[:3]
        _check(version >= (3, 13, 0) or (3, 12, 4) <= version < (3, 13, 0)
               or (3, 11, 10) <= version < (3, 12, 0),
               "Windows requires a Python version with private mode-0700 directories")
    with tempfile.TemporaryDirectory(prefix=".xiaoan-private-", dir=parent) as name:
        path = Path(name)
        os.chmod(path, 0o700)
        yield path


@contextmanager
def _new_file(path):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                         | getattr(os, "O_BINARY", 0), 0o600)
    with os.fdopen(descriptor, "wb") as output:
        yield output
        output.flush()
        os.fsync(output.fileno())


def _zip_info(name, kind):
    info = zipfile.ZipInfo("data/" + name + ("/" if kind == "directory" else ""))
    info.create_system = 3
    info.external_attr = ((stat.S_IFDIR | 0o700) if kind == "directory"
                          else (stat.S_IFREG | 0o600)) << 16
    if kind == "directory":
        info.external_attr |= 0x10
    return info


def _stats(manifest):
    return {key: manifest[key] for key in ("file_count", "directory_count", "total_bytes")}


def _write_archive(source, archive_path):
    records = _scan_source(source)
    manifest = {"format": FORMAT, "version": 1, "entries": [], "file_count": 0,
                "directory_count": 0, "total_bytes": 0}
    with _new_file(archive_path) as raw:
        with zipfile.ZipFile(raw, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            for name, kind, size, signature in records:
                info = _zip_info(name, kind)
                entry = {"path": name, "type": kind}
                if kind == "directory":
                    archive.writestr(info, b"")
                    manifest["directory_count"] += 1
                else:
                    digest, copied = hashlib.sha256(), 0
                    path = source.joinpath(*name.split("/"))
                    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
                                         | getattr(os, "O_BINARY", 0))
                    with os.fdopen(descriptor, "rb") as input_file:
                        value = os.fstat(input_file.fileno())
                        _plain_stat(value)
                        _check(_signature(value) == signature, "Source changed during packing")
                        with archive.open(info, "w", force_zip64=True) as output:
                            while chunk := input_file.read(CHUNK_BYTES):
                                copied += len(chunk)
                                _check(copied <= size, "Source changed during packing")
                                digest.update(chunk)
                                output.write(chunk)
                        _check(copied == size and
                               _signature(os.fstat(input_file.fileno())) == signature,
                               "Source changed during packing")
                    entry.update(size=size, sha256=digest.hexdigest())
                    manifest["file_count"] += 1
                    manifest["total_bytes"] += size
                manifest["entries"].append(entry)
            encoded = json.dumps(manifest, ensure_ascii=True, sort_keys=True,
                                 separators=(",", ":")).encode("utf-8")
            _check(len(encoded) <= MAX_MANIFEST_BYTES, "Manifest exceeds size limit")
            archive.writestr(MANIFEST_NAME, encoded)
    _check(records == _scan_source(source), "Source changed during packing")
    _check(archive_path.stat().st_size <= MAX_ARCHIVE_BYTES, "Archive exceeds GCM size limit")
    _zip_bounds(archive_path)
    return manifest


def _write_key(key_file, key):
    # A hard-link publishes exclusively and retains the private Windows ACL
    # inherited from the temporary directory, unlike creating in a public parent.
    with _private_temp(key_file.parent) as temporary:
        staged = temporary / "key"
        with _new_file(staged) as output:
            output.write(base64.b64encode(key) + b"\n")
        identity = staged.stat()
        os.link(staged, key_file)
        return identity


def _remove_owned_file(path, identity):
    try:
        value = path.lstat()
        if (value.st_dev, value.st_ino) == (identity.st_dev, identity.st_ino):
            path.unlink()
    except FileNotFoundError:
        pass


def _encrypt_archive(archive_path, partial, key):
    length = archive_path.stat().st_size
    _check(22 <= length <= MAX_ARCHIVE_BYTES, "Invalid archive length")
    nonce = os.urandom(12)
    header = HEADER.pack(MAGIC, nonce, length)
    encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
    encryptor.authenticate_additional_data(header)
    with archive_path.open("rb") as input_file, _new_file(partial) as output:
        output.write(header)
        copied = 0
        while chunk := input_file.read(CHUNK_BYTES):
            copied += len(chunk)
            _check(copied <= length, "Archive changed during encryption")
            output.write(encryptor.update(chunk))
        _check(copied == length, "Archive changed during encryption")
        output.write(encryptor.finalize())
        output.write(encryptor.tag)


def create_bundle(source: Path, bundle: Path, key_file: Path) -> dict:
    """Pack a prepared export; never replace a bundle/key or disclose secrets."""
    source, bundle, key_file = map(_absolute, (source, bundle, key_file))
    _existing(source, directory=True)
    _check(bundle.suffix.lower() == ".xiaoan", "Bundle extension must be .xiaoan")
    _check(str(bundle).casefold() != str(key_file).casefold(), "Key must be separate")
    _check(not bundle.is_relative_to(source) and not key_file.is_relative_to(source),
           "Bundle and key must be outside the source")
    _new_path(bundle)
    _new_path(key_file)
    key_identity, published = None, False
    try:
        with _private_temp(bundle.parent) as temporary:
            archive, partial = temporary / "payload.zip", temporary / "encrypted.part"
            manifest = _write_archive(source, archive)
            key = os.urandom(32)
            key_identity = _write_key(key_file, key)
            _encrypt_archive(archive, partial, key)
            bundle_bytes = partial.stat().st_size
            os.link(partial, bundle)  # Atomic no-replace publication, including Windows.
            published = True
            return {**_stats(manifest), "bundle_bytes": bundle_bytes}
    finally:
        if key_identity is not None and not published:
            _remove_owned_file(key_file, key_identity)


def _read_key(key_file):
    _existing(key_file)
    with key_file.open("rb") as input_file:
        encoded = input_file.read(128)
    _check(len(encoded) < 128, "Invalid key file")
    encoded = encoded.removesuffix(b"\n").removesuffix(b"\r")
    try:
        key = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("Invalid key file") from error
    _check(len(key) == 32 and base64.b64encode(key) == encoded, "Invalid key file")
    return key


def _decrypt_archive(bundle, archive_path, key):
    with bundle.open("rb") as input_file:
        header = input_file.read(HEADER.size)
        _check(len(header) == HEADER.size, "Truncated bundle header")
        magic, nonce, length = HEADER.unpack(header)
        _check(magic == MAGIC, "Unsupported bundle format")
        _check(22 <= length <= MAX_ARCHIVE_BYTES, "Invalid bundle length")
        _check(os.fstat(input_file.fileno()).st_size == HEADER.size + length + TAG_BYTES,
               "Truncated bundle or trailing data")
        input_file.seek(HEADER.size + length)
        tag = input_file.read(TAG_BYTES)
        _check(len(tag) == TAG_BYTES, "Truncated authentication tag")
        input_file.seek(HEADER.size)
        decryptor = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
        decryptor.authenticate_additional_data(header)
        with _new_file(archive_path) as output:
            remaining = length
            while remaining:
                chunk = input_file.read(min(CHUNK_BYTES, remaining))
                _check(chunk, "Truncated ciphertext")
                remaining -= len(chunk)
                output.write(decryptor.update(chunk))
            try:
                output.write(decryptor.finalize())
            except InvalidTag as error:
                raise ValueError("Bundle authentication failed") from error


def _zip_bounds(path):
    """Bound central-directory allocation before letting ZipFile parse anything."""
    size = path.stat().st_size
    _check(22 <= size <= MAX_ARCHIVE_BYTES, "Invalid ZIP size")
    with path.open("rb") as raw:
        raw.seek(size - 22)
        end = struct.unpack("<4s4H2LH", raw.read(22))
        _check(end[0] == b"PK\x05\x06" and end[1:3] == (0, 0)
               and end[3] == end[4] and end[7] == 0, "Invalid ZIP end record")
        count, directory_size, offset = end[4:7]
        boundary = size - 22
        raw.seek(max(0, boundary - 20))
        locator = raw.read(20)
        if locator[:4] == b"PK\x06\x07":
            _, disk, record_offset, disks = struct.unpack("<4sLQL", locator)
            _check(disk == 0 and disks == 1 and record_offset + 56 == boundary - 20,
                   "Invalid ZIP64 locator")
            raw.seek(record_offset)
            record = struct.unpack("<4sQ2H2L4Q", raw.read(56))
            _check(record[0] == b"PK\x06\x06" and record[1] == 44
                   and record[4:6] == (0, 0) and record[6] == record[7],
                   "Invalid ZIP64 end record")
            count, directory_size, offset = record[7:10]
            _check(end[4] in (count, 0xFFFF) and end[5] in (directory_size, 0xFFFFFFFF)
                   and end[6] in (offset, 0xFFFFFFFF), "Inconsistent ZIP64 end records")
            boundary = record_offset
        _check(1 <= count <= MAX_MEMBERS and 0 < directory_size <= MAX_CENTRAL_DIRECTORY_BYTES
               and offset + directory_size == boundary, "ZIP directory exceeds bounds")
        raw.seek(offset)
        actual_count = 0
        while raw.tell() < boundary:
            fixed = raw.read(46)
            _check(len(fixed) == 46 and fixed[:4] == b"PK\x01\x02", "Invalid ZIP directory")
            name_length, extra_length, comment_length, disk = struct.unpack_from("<4H", fixed, 28)
            _check(0 < name_length <= MAX_PATH_BYTES + 6 and extra_length <= 64
                   and comment_length == 0 and disk == 0, "Invalid ZIP metadata bounds")
            next_offset = raw.tell() + name_length + extra_length
            _check(next_offset <= boundary, "Truncated ZIP directory")
            actual_count += 1
            _check(actual_count <= MAX_MEMBERS, "Too many archive members")
            raw.seek(next_offset)
        _check(actual_count == count, "ZIP member count mismatch")
    return offset, count


def _extra_fields(extra):
    result = {}
    while extra:
        _check(len(extra) >= 4, "Invalid ZIP extra field")
        field_id, length = struct.unpack("<HH", extra[:4])
        _check(field_id == 1 and field_id not in result and length <= len(extra) - 4,
               "Unsupported ZIP extra field (links and extensions are forbidden)")
        result[field_id] = extra[4:4 + length]
        extra = extra[4 + length:]
    return result


def _check_local_records(path, infos, directory_offset):
    cursor = 0
    with path.open("rb") as raw:
        for info in infos:
            _check(info.header_offset == cursor, "Overlapping or hidden ZIP records")
            raw.seek(cursor)
            fixed = raw.read(30)
            _check(len(fixed) == 30, "Truncated ZIP member")
            local = struct.unpack("<4s5H3L2H", fixed)
            _check(local[0] == b"PK\x03\x04" and local[2] == info.flag_bits
                   and local[3] == zipfile.ZIP_STORED and local[6] == info.CRC
                   and 0 < local[9] <= MAX_PATH_BYTES + 6 and local[10] <= 64,
                   "Invalid local ZIP record")
            name = raw.read(local[9]).decode("utf-8" if info.flag_bits & 0x800 else "cp437")
            _check(name == info.filename, "ZIP filename mismatch")
            extra = _extra_fields(raw.read(local[10]))
            compressed, size = local[7:9]
            if compressed == 0xFFFFFFFF or size == 0xFFFFFFFF:
                extended = extra.get(1, b"")
                _check(len(extended) == 16, "Invalid local ZIP64 size")
                size64, compressed64 = struct.unpack("<QQ", extended)
                if size == 0xFFFFFFFF:
                    size = size64
                if compressed == 0xFFFFFFFF:
                    compressed = compressed64
            _check(size == info.file_size and compressed == info.compress_size,
                   "ZIP size mismatch")
            cursor = raw.tell() + compressed
            _check(cursor <= directory_offset, "ZIP member exceeds bounds")
        _check(cursor == directory_offset, "Unexpected data outside ZIP members")


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        _check(key not in result, "Duplicate manifest key")
        result[key] = value
    return result


def _validate_manifest(manifest, data_members):
    keys = {"format", "version", "entries", "file_count", "directory_count", "total_bytes"}
    _check(isinstance(manifest, dict) and set(manifest) == keys, "Invalid manifest schema")
    _check(manifest["format"] == FORMAT and type(manifest["version"]) is int
           and manifest["version"] == 1, "Unsupported manifest version")
    _check(isinstance(manifest["entries"], list)
           and len(manifest["entries"]) < MAX_MEMBERS, "Invalid manifest member count")
    paths, aliases, files, directories, total = {}, {}, 0, 0, 0
    for entry in manifest["entries"]:
        _check(isinstance(entry, dict) and entry.get("type") in ("file", "directory"),
               "Invalid manifest entry")
        kind = entry["type"]
        expected = {"path", "type", "size", "sha256"} if kind == "file" else {"path", "type"}
        _check(set(entry) == expected, "Invalid manifest entry schema")
        name = entry["path"]
        _register_path(name, kind, paths, aliases)
        _check(name in data_members and data_members[name][1] == kind,
               "Manifest/archive members differ")
        info = data_members[name][0]
        if kind == "file":
            _check(type(entry["size"]) is int and 0 <= entry["size"] <= MAX_FILE_BYTES
                   and entry["size"] == info.file_size, "Invalid manifest file size")
            _check(isinstance(entry["sha256"], str)
                   and re.fullmatch("[0-9a-f]{64}", entry["sha256"]), "Invalid SHA-256")
            files += 1
            total += entry["size"]
            _check(total <= MAX_TOTAL_BYTES, "Export exceeds size limit")
        else:
            directories += 1
    _check(set(paths) == set(data_members), "Manifest/archive members differ")
    _check_parents(paths)
    for key, expected in (("file_count", files), ("directory_count", directories),
                          ("total_bytes", total)):
        _check(type(manifest[key]) is int and manifest[key] == expected,
               "Manifest statistics mismatch")
    return manifest


def _read_manifest(path, archive, count, directory_offset):
    infos = archive.infolist()
    _check(len(infos) == count, "ZIP member count mismatch")
    data, paths, aliases, manifest_info, total = {}, {}, {}, None, 0
    for info in infos:
        _check(info.orig_filename == info.filename and not info.comment
               and info.compress_type == zipfile.ZIP_STORED
               and info.flag_bits & ~0x800 == 0 and info.volume == 0
               and info.file_size == info.compress_size
               and 0 <= info.file_size <= MAX_FILE_BYTES, "Unsupported ZIP member")
        _extra_fields(info.extra)
        mode = stat.S_IFMT(info.external_attr >> 16)
        kind = "directory" if info.is_dir() else "file"
        _check(mode in (0, stat.S_IFDIR if kind == "directory" else stat.S_IFREG)
               and not info.external_attr & 0x400, "Links and special ZIP entries are forbidden")
        if kind == "directory":
            _check(info.file_size == 0, "Directory has content")
        if info.filename == MANIFEST_NAME:
            _check(manifest_info is None and kind == "file"
                   and info.file_size <= MAX_MANIFEST_BYTES, "Invalid manifest member")
            manifest_info = info
            continue
        _check(info.filename.startswith("data/"), "Unexpected archive member")
        name = info.filename[5:-1] if kind == "directory" else info.filename[5:]
        _register_path(name, kind, paths, aliases)
        data[name] = (info, kind)
        total += info.file_size
        _check(total <= MAX_TOTAL_BYTES, "Export exceeds size limit")
    _check(manifest_info is not None, "Manifest missing")
    _check_parents(paths)
    _check_local_records(path, infos, directory_offset)
    with archive.open(manifest_info) as source:
        encoded = source.read(MAX_MANIFEST_BYTES + 1)
        _check(len(encoded) == manifest_info.file_size, "Invalid manifest length")
    try:
        manifest = json.loads(encoded.decode("utf-8"), object_pairs_hook=_unique_object)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise ValueError("Invalid manifest JSON") from error
    return _validate_manifest(manifest, data), data


def _extract_verified_archive(archive_path, staging):
    directory_offset, count = _zip_bounds(archive_path)
    try:
        with zipfile.ZipFile(archive_path, "r") as archive:
            manifest, data = _read_manifest(archive_path, archive, count, directory_offset)
            staging.mkdir(mode=0o700)
            directories = sorted((e["path"] for e in manifest["entries"]
                                  if e["type"] == "directory"), key=lambda p: p.count("/"))
            for name in directories:
                staging.joinpath(*name.split("/")).mkdir(mode=0o700)
            for entry in manifest["entries"]:
                if entry["type"] != "file":
                    continue
                info = data[entry["path"]][0]
                target = staging.joinpath(*entry["path"].split("/"))
                digest, copied = hashlib.sha256(), 0
                with archive.open(info) as source, _new_file(target) as output:
                    while chunk := source.read(CHUNK_BYTES):
                        copied += len(chunk)
                        _check(copied <= entry["size"], "File exceeds declared size")
                        digest.update(chunk)
                        output.write(chunk)
                _check(copied == entry["size"] and digest.hexdigest() == entry["sha256"],
                       "File SHA-256 or size mismatch")
    except (zipfile.BadZipFile, UnicodeError, struct.error, NotImplementedError) as error:
        raise ValueError("Invalid private archive") from error
    return manifest


def _rename_directory(source, destination):
    # os.rename on POSIX can silently replace an existing empty directory.
    if os.name == "nt":
        os.rename(source, destination)
        return
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform.startswith("linux") and hasattr(libc, "renameat2"):
        rename = libc.renameat2
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p,
                           ctypes.c_uint]
        rename.restype = ctypes.c_int
        result = rename(-100, os.fsencode(source), -100, os.fsencode(destination), 1)
    elif sys.platform == "darwin" and hasattr(libc, "renamex_np"):
        rename = libc.renamex_np
        rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        result = rename(os.fsencode(source), os.fsencode(destination), 4)
    else:
        raise OSError(errno.ENOTSUP, "Atomic no-replace directory rename is unavailable")
    if result:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))


def _copy_verified_directory(source, destination, manifest):
    """Publish across Windows volumes only after hashing the copied result again."""
    _new_path(destination)
    shutil.copytree(source, destination, copy_function=shutil.copyfile)
    for entry in manifest["entries"]:
        target = destination.joinpath(*entry["path"].split("/"))
        metadata = target.lstat()
        _check(not target.is_symlink(), "Copied private archive contains a link")
        if entry["type"] == "directory":
            _check(stat.S_ISDIR(metadata.st_mode), "Copied private archive directory is invalid")
            continue
        _check(stat.S_ISREG(metadata.st_mode) and metadata.st_size == entry["size"],
               "Copied private archive file metadata differs")
        digest = hashlib.sha256()
        with target.open("rb") as copied:
            while chunk := copied.read(CHUNK_BYTES):
                digest.update(chunk)
        _check(digest.hexdigest() == entry["sha256"], "Copied private archive checksum differs")


def _publish_extracted_directory(source, destination, manifest):
    try:
        _rename_directory(source, destination)
    except OSError as error:
        cross_device = error.errno == errno.EXDEV or getattr(error, "winerror", None) == 17
        if not cross_device:
            raise
        _copy_verified_directory(source, destination, manifest)


def extract_bundle(bundle: Path, key_file: Path, destination: Path) -> dict:
    """Authenticate, validate and restore into a new directory; return its manifest."""
    bundle, key_file, destination = map(_absolute, (bundle, key_file, destination))
    _existing(bundle)
    _check(bundle.suffix.lower() == ".xiaoan", "Bundle extension must be .xiaoan")
    _new_path(destination)
    key = _read_key(key_file)
    with _private_temp(destination.parent) as temporary:
        archive_path, staging = temporary / "payload.zip", temporary / "restored"
        _decrypt_archive(bundle, archive_path, key)
        # No ZIP parsing or extraction until GCM.finalize() has verified the tag.
        manifest = _extract_verified_archive(archive_path, staging)
        _publish_extracted_directory(staging, destination, manifest)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description="Encrypted private migration bundles")
    commands = parser.add_subparsers(dest="command", required=True)
    pack = commands.add_parser("pack")
    pack.add_argument("--source", type=Path, required=True)
    pack.add_argument("--bundle", type=Path, required=True)
    pack.add_argument("--key-file", type=Path, required=True)
    unpack = commands.add_parser("unpack")
    unpack.add_argument("--bundle", type=Path, required=True)
    unpack.add_argument("--key-file", type=Path, required=True)
    unpack.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "pack":
            summary = create_bundle(args.source, args.bundle, args.key_file)
        else:
            summary = _stats(extract_bundle(args.bundle, args.key_file, args.destination))
    except (OSError, ValueError, RuntimeError) as error:
        # Do not echo exception details, names, key material, or manifest contents.
        print("Private bundle operation failed: " + type(error).__name__, file=sys.stderr)
        if os.getenv("XIAOAN_PRIVATE_BUNDLE_DIAGNOSTICS") == "1" and isinstance(error, OSError):
            print("Private bundle diagnostic: " + json.dumps({
                "errno": error.errno, "winerror": getattr(error, "winerror", None),
                "reason": error.strerror,
            }, ensure_ascii=True, sort_keys=True), file=sys.stderr)
        return 1
    print(json.dumps(summary, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
