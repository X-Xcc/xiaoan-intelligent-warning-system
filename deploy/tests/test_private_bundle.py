import base64
import errno
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zipfile

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


SCRIPT = Path(__file__).resolve().parents[1] / "private_bundle.py"


class PrivateBundleTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.is_file(), "Private bundle implementation is missing")
        spec = importlib.util.spec_from_file_location("private_bundle", SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        (self.source / "database.sql").write_bytes(b"private database\n")
        self.bundle = self.root / "migration.xiaoan"
        self.key_file = self.root / "migration.key"
        self.destination = self.root / "restored"

    def pack(self):
        return self.module.create_bundle(self.source, self.bundle, self.key_file)

    def test_manifest_limit_covers_full_training_dataset(self):
        entry = {"path": "training/datasets/" + "synthetic-" * 9 + "000001.jpg",
                 "type": "file", "size": 100000, "sha256": "0" * 64}
        encoded_entry = json.dumps(entry, sort_keys=True, separators=(",", ":")).encode()
        estimated_bytes = (len(encoded_entry) + 1) * 90350 + 1024
        self.assertGreater(estimated_bytes, 16 * 1024 * 1024)
        self.assertGreaterEqual(self.module.MAX_MANIFEST_BYTES, estimated_bytes)

    def unpack(self):
        return self.module.extract_bundle(self.bundle, self.key_file, self.destination)

    def assert_no_temporary_files(self):
        self.assertFalse(list(self.root.glob(".xiaoan-private-*")))

    def seal_archive(self, members, manifest=None, *, transform=None):
        """Construct independently encrypted, authenticated adversarial fixtures."""
        if manifest is None:
            manifest = {
                "format": "xiaoan-private-bundle",
                "version": 1,
                "entries": [],
                "file_count": 0,
                "directory_count": 0,
                "total_bytes": 0,
            }
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
            for name, content, mode in members:
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.external_attr = mode << 16
                archive.writestr(info, content)
            archive.writestr(
                "manifest.json",
                manifest if isinstance(manifest, bytes) else json.dumps(manifest).encode(),
            )
        payload = stream.getvalue()
        if transform is not None:
            payload = transform(payload)
        self.seal_bytes(payload)

    def seal_bytes(self, payload):
        key = os.urandom(32)
        self.key_file.write_bytes(base64.b64encode(key) + b"\n")
        nonce = os.urandom(12)
        header = struct.pack(">8s12sQ", b"XIAOAN\x00\x01", nonce, len(payload))
        encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
        encryptor.authenticate_additional_data(header)
        ciphertext = encryptor.update(payload) + encryptor.finalize()
        self.bundle.write_bytes(header + ciphertext + encryptor.tag)

    def file_manifest(self, path="secret.txt", content=b"secret"):
        return {
            "format": "xiaoan-private-bundle",
            "version": 1,
            "entries": [{
                "path": path, "type": "file", "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }],
            "file_count": 1,
            "directory_count": 0,
            "total_bytes": len(content),
        }

    def test_roundtrip_unicode_empty_directories_and_chunked_video(self):
        (self.source / "\u8bc1\u636e").mkdir()
        video = self.source / "\u8bc1\u636e" / "\u73b0\u573a.mp4"
        video.write_bytes(bytes(range(256)) * 32768)
        (self.source / "empty").mkdir()
        (self.source / "zero").touch()
        with mock.patch.object(Path, "read_bytes", side_effect=AssertionError("no bulk reads")):
            summary = self.pack()
            manifest = self.unpack()
        self.assertEqual(summary["file_count"], 3)
        self.assertEqual(summary["directory_count"], 2)
        self.assertEqual(summary["total_bytes"], video.stat().st_size + 17)
        self.assertEqual(summary["bundle_bytes"], self.bundle.stat().st_size)
        self.assertEqual(manifest["file_count"], summary["file_count"])
        self.assertEqual((self.destination / "\u8bc1\u636e" / "\u73b0\u573a.mp4").read_bytes(),
                         video.read_bytes())
        self.assertTrue((self.destination / "empty").is_dir())
        self.assertEqual((self.destination / "zero").stat().st_size, 0)
        self.assertEqual(len(base64.b64decode(self.key_file.read_bytes(), validate=False)), 32)
        self.assertNotIn(b"private database", self.bundle.read_bytes())
        self.assertNotIn("manifest.json", [p.name for p in self.destination.iterdir()])
        self.assert_no_temporary_files()
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(self.key_file.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(self.destination.stat().st_mode), 0o700)

    def test_empty_source(self):
        (self.source / "database.sql").unlink()
        self.pack()
        result = self.unpack()
        self.assertEqual(result["entries"], [])
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_independently_created_valid_archive(self):
        manifest = self.file_manifest()
        self.seal_archive([("data/secret.txt", b"secret", stat.S_IFREG | 0o600)], manifest)
        self.assertEqual(self.unpack(), manifest)
        self.assertEqual((self.destination / "secret.txt").read_bytes(), b"secret")

    def test_random_keys_and_nonces_are_independent(self):
        self.pack()
        other = self.root / "other.xiaoan"
        other_key = self.root / "other.key"
        self.module.create_bundle(self.source, other, other_key)
        self.assertNotEqual(self.key_file.read_bytes(), other_key.read_bytes())
        self.assertNotEqual(self.bundle.read_bytes()[8:20], other.read_bytes()[8:20])

    def test_wrong_key_and_ciphertext_tag_header_tampering(self):
        self.pack()
        original = self.bundle.read_bytes()
        original_key = self.key_file.read_bytes()
        for offset in (0, 8, 20, 35, len(original) - 1):
            with self.subTest(offset=offset):
                damaged = bytearray(original)
                damaged[offset] ^= 1
                self.bundle.write_bytes(damaged)
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())
                self.assert_no_temporary_files()
        self.bundle.write_bytes(original)
        self.key_file.write_bytes(base64.b64encode(os.urandom(32)) + b"\n")
        with self.assertRaises(ValueError):
            self.unpack()
        self.assertFalse(self.destination.exists())
        self.key_file.write_bytes(original_key)

    def test_truncated_and_appended_bundles(self):
        self.pack()
        original = self.bundle.read_bytes()
        for damaged in (b"", original[:10], original[:40], original[:-1], original + b"extra"):
            with self.subTest(length=len(damaged)):
                self.bundle.write_bytes(damaged)
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())
                self.assert_no_temporary_files()

    def test_authentication_happens_before_zip_parsing(self):
        self.pack()
        damaged = bytearray(self.bundle.read_bytes())
        damaged[-1] ^= 1
        self.bundle.write_bytes(damaged)
        with mock.patch.object(self.module.zipfile, "ZipFile",
                               side_effect=AssertionError("Unauthenticated ZIP parsed")):
            with self.assertRaises(ValueError):
                self.unpack()
        self.assertFalse(self.destination.exists())

    def test_authenticated_traversal_and_windows_path_tricks(self):
        paths = (
            "../escape", "/absolute", "a/../../escape", "a\\escape", "C:/escape",
            "C:escape", "//host/share", "./escape", "a//b", "a/./b", "a/../b",
            "NUL.txt", "aux", "COM1", "LPT9.txt", "COM\u00b9.txt", "a:stream",
            "trailing.", "trailing ", "a/\x01bad", "a/CONOUT$", "a/<bad>",
            "a/quo?te", "a/pipe|name", "a/*wild", "a/\u202eevil",
        )
        for path in paths:
            with self.subTest(path=path):
                self.seal_archive([("data/" + path, b"secret", stat.S_IFREG | 0o600)],
                                  self.file_manifest(path))
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())
                self.assert_no_temporary_files()

    def test_duplicate_case_and_unicode_normalization_collisions(self):
        for first, second in (("same", "same"), ("Name", "name"),
                              ("A/one", "a/two"), ("\u00e9", "e\u0301")):
            with self.subTest(first=first, second=second):
                import warnings
                entries, members = [], []
                for name in (first, second):
                    if "/" in name:
                        parent = name.split("/")[0]
                        entries.append({"path": parent, "type": "directory"})
                        members.append(("data/" + parent + "/", b"", stat.S_IFDIR | 0o700))
                    entries.append(self.file_manifest(name, b"x")["entries"][0])
                    members.append(("data/" + name, b"x", stat.S_IFREG | 0o600))
                manifest = self.file_manifest(first, b"x")
                manifest.update(entries=entries, file_count=2,
                                directory_count=len(entries) - 2, total_bytes=2)
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    self.seal_archive(members, manifest)
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())

    def test_symlink_device_and_fifo_zip_entries_rejected(self):
        for file_type in (stat.S_IFLNK, stat.S_IFCHR, stat.S_IFBLK, stat.S_IFIFO,
                          stat.S_IFSOCK):
            with self.subTest(file_type=file_type):
                self.seal_archive([("data/secret.txt", b"secret", file_type | 0o600)],
                                  self.file_manifest())
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())

    def test_manifest_hash_member_set_and_schema_verified(self):
        manifest = self.file_manifest()
        cases = []
        wrong_hash = json.loads(json.dumps(manifest))
        wrong_hash["entries"][0]["sha256"] = "0" * 64
        cases.append(([("data/secret.txt", b"secret", stat.S_IFREG | 0o600)], wrong_hash))
        cases.append(([], manifest))
        cases.append(([("data/extra.txt", b"secret", stat.S_IFREG | 0o600)], manifest))
        cases.append(([("data/secret.txt", b"secret", stat.S_IFREG | 0o600)],
                      b'{"version":1,"version":2}'))
        wrong_size = json.loads(json.dumps(manifest))
        wrong_size["entries"][0]["size"] = True
        cases.append(([("data/secret.txt", b"secret", stat.S_IFREG | 0o600)], wrong_size))
        for members, bad_manifest in cases:
            with self.subTest(manifest=bad_manifest):
                self.seal_archive(members, bad_manifest)
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())
                self.assert_no_temporary_files()

    def test_declared_limits_rejected_without_publishing(self):
        self.pack()
        for constant, value in (("MAX_MEMBERS", 1), ("MAX_TOTAL_BYTES", 1),
                                ("MAX_FILE_BYTES", 1), ("MAX_MANIFEST_BYTES", 1),
                                ("MAX_CENTRAL_DIRECTORY_BYTES", 1)):
            with self.subTest(constant=constant):
                with mock.patch.object(self.module, constant, value):
                    with self.assertRaises(ValueError):
                        self.unpack()
                self.assertFalse(self.destination.exists())

    def test_oversized_header_rejected_before_decryption(self):
        self.pack()
        data = bytearray(self.bundle.read_bytes())
        struct.pack_into(">Q", data, 20, 2 ** 64 - 1)
        self.bundle.write_bytes(data)
        with mock.patch.object(self.module, "Cipher", side_effect=AssertionError("cipher called")):
            with self.assertRaises(ValueError):
                self.unpack()
        self.assertFalse(self.destination.exists())
        self.assert_no_temporary_files()

    def test_zip_count_size_and_local_header_lies(self):
        def incorrect_count(payload):
            modified = bytearray(payload)
            struct.pack_into("<HH", modified, len(payload) - 14, 1, 1)
            return bytes(modified)

        def incorrect_size(payload):
            modified = bytearray(payload)
            directory = modified.index(b"PK\x01\x02")
            struct.pack_into("<II", modified, directory + 20, 0x7FFFFFFF, 0x7FFFFFFF)
            return bytes(modified)

        def nul_local_name(payload):
            modified = bytearray(payload)
            modified[35] = 0
            return bytes(modified)

        def bad_crc(payload):
            modified = bytearray(payload)
            directory = modified.index(b"PK\x01\x02")
            struct.pack_into("<I", modified, directory + 16, 0)
            struct.pack_into("<I", modified, 14, 0)
            return bytes(modified)

        for transform in (incorrect_count, incorrect_size, nul_local_name, bad_crc):
            with self.subTest(transform=transform.__name__):
                self.seal_archive([("data/secret.txt", b"secret", stat.S_IFREG | 0o600)],
                                  self.file_manifest(), transform=transform)
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())
                self.assert_no_temporary_files()

    def test_zip64_end_record_roundtrip_without_gigabyte_fixture(self):
        def zip64_end(payload):
            end_offset = len(payload) - 22
            end = struct.unpack("<4s4H2LH", payload[end_offset:])
            record = struct.pack("<4sQ2H2L4Q", b"PK\x06\x06", 44, 45, 45, 0, 0,
                                 end[4], end[4], end[5], end[6])
            locator = struct.pack("<4sLQL", b"PK\x06\x07", 0, end_offset, 1)
            footer = struct.pack("<4s4H2LH", b"PK\x05\x06", 0, 0, 0xFFFF, 0xFFFF,
                                 0xFFFFFFFF, 0xFFFFFFFF, 0)
            return payload[:end_offset] + record + locator + footer

        self.seal_archive([("data/secret.txt", b"secret", stat.S_IFREG | 0o600)],
                          self.file_manifest(), transform=zip64_end)
        self.assertEqual(self.unpack()["file_count"], 1)

    def test_zip64_sizes_and_offsets_roundtrip(self):
        with mock.patch.object(self.module.zipfile, "ZIP64_LIMIT", 128):
            (self.source / "video").write_bytes(b"video" * 100)
            self.pack()
            self.assertEqual(self.unpack()["file_count"], 2)
            self.assertEqual((self.destination / "video").read_bytes(), b"video" * 100)

    def test_implicit_path_prefix_count_is_bounded(self):
        with mock.patch.object(self.module, "MAX_MEMBERS", 2):
            with self.assertRaises(ValueError):
                self.module._register_path("a/b/c", "file", {}, {})

    def test_zip_extensions_for_hardlinks_and_compression_are_rejected(self):
        for extra, compression in ((b"\x0d\x00\x00\x00", zipfile.ZIP_STORED),
                                   (b"", zipfile.ZIP_DEFLATED)):
            with self.subTest(compression=compression, extra=extra):
                raw = io.BytesIO()
                with zipfile.ZipFile(raw, "w") as archive:
                    info = zipfile.ZipInfo("data/secret.txt")
                    info.compress_type = compression
                    info.extra = extra
                    archive.writestr(info, b"secret")
                    archive.writestr("manifest.json", json.dumps(self.file_manifest()))
                self.seal_bytes(raw.getvalue())
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())

    def test_tar_hardlinks_and_arbitrary_authenticated_bytes_are_rejected(self):
        import tarfile
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode="w") as archive:
            info = tarfile.TarInfo("link")
            info.type = tarfile.LNKTYPE
            info.linkname = "../outside"
            archive.addfile(info)
        for content in (raw.getvalue(), b"not a ZIP" * 10):
            self.seal_bytes(content)
            with self.assertRaises(ValueError):
                self.unpack()
            self.assertFalse(self.destination.exists())

    def test_existing_outputs_and_key_are_never_replaced(self):
        for target in (self.bundle, self.key_file):
            with self.subTest(target=target.name):
                target.write_bytes(b"previous output")
                with self.assertRaises(FileExistsError):
                    self.pack()
                self.assertEqual(target.read_bytes(), b"previous output")
                other = self.key_file if target == self.bundle else self.bundle
                self.assertFalse(other.exists())
                target.unlink()
        self.pack()
        self.destination.mkdir()
        with self.assertRaises(FileExistsError):
            self.unpack()
        self.assertEqual(list(self.destination.iterdir()), [])
        self.assert_no_temporary_files()

    def test_source_links_and_special_files_rejected(self):
        original = self.source / "database.sql"
        linked = self.source / "link"
        try:
            linked.symlink_to(original)
        except OSError:
            self.skipTest("Symbolic link creation unavailable")
        with self.assertRaises(ValueError):
            self.pack()
        self.assertFalse(self.bundle.exists())
        self.assertFalse(self.key_file.exists())
        self.assertTrue(original.is_file())
        self.assert_no_temporary_files()

    def test_source_hardlinks_rejected(self):
        try:
            os.link(self.source / "database.sql", self.source / "hardlink")
        except OSError:
            self.skipTest("Hard links unavailable")
        with self.assertRaises(ValueError):
            self.pack()
        self.assertFalse(self.bundle.exists())
        self.assertFalse(self.key_file.exists())

    @unittest.skipIf(os.name == "nt", "FIFO requires POSIX")
    def test_source_fifo_rejected(self):
        os.mkfifo(self.source / "fifo")
        with self.assertRaises(ValueError):
            self.pack()
        self.assertFalse(self.key_file.exists())
        self.assert_no_temporary_files()

    def test_reparse_flag_rejected_even_for_regular_file(self):
        from types import SimpleNamespace
        value = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_nlink=1,
                                st_file_attributes=0x400)
        with self.assertRaises(ValueError):
            self.module._plain_stat(value)

    def test_invalid_source_name_and_case_collisions(self):
        path = self.source / "NUL.txt"
        if os.name == "nt":
            self.skipTest("Windows prevents creating reserved names")
        path.write_bytes(b"nothing")
        with self.assertRaises(ValueError):
            self.pack()
        path.unlink()
        (self.source / "Database.sql").write_bytes(b"collision")
        with self.assertRaises(ValueError):
            self.pack()
        self.assertFalse(self.key_file.exists())

    def test_outputs_inside_source_and_invalid_extension_rejected(self):
        for bundle, key in ((self.source / "bad.xiaoan", self.key_file),
                            (self.bundle, self.source / "bad.key"),
                            (self.root / "bad.zip", self.key_file),
                            (self.bundle, self.bundle)):
            with self.subTest(bundle=bundle.name, key=key.name):
                with self.assertRaises(ValueError):
                    self.module.create_bundle(self.source, bundle, key)
                self.assertEqual(sorted(p.name for p in self.source.iterdir()),
                                 ["database.sql"])

    def test_failure_cleans_owned_key_and_temporary_files(self):
        with mock.patch.object(self.module, "_encrypt_archive", side_effect=OSError("disk")):
            with self.assertRaises(OSError):
                self.pack()
        self.assertFalse(self.bundle.exists())
        self.assertFalse(self.key_file.exists())
        self.assertEqual((self.source / "database.sql").read_bytes(), b"private database\n")
        self.assert_no_temporary_files()

    def test_concurrent_bundle_and_key_outputs_are_preserved(self):
        link = self.module.os.link
        for contested in (self.bundle, self.key_file):
            def publish(source, destination):
                if Path(destination) == contested:
                    contested.write_bytes(b"concurrent output")
                return link(source, destination)

            with self.subTest(contested=contested.name):
                with mock.patch.object(self.module.os, "link", side_effect=publish):
                    with self.assertRaises(FileExistsError):
                        self.pack()
                self.assertEqual(contested.read_bytes(), b"concurrent output")
                other = self.key_file if contested == self.bundle else self.bundle
                self.assertFalse(other.exists())
                contested.unlink()
                self.assert_no_temporary_files()

    def test_plaintext_files_live_in_private_temporary_directory(self):
        encrypt = self.module._encrypt_archive
        decrypt = self.module._decrypt_archive

        def check_private(archive):
            self.assertTrue(archive.parent.name.startswith(".xiaoan-private-"))
            if os.name != "nt":
                self.assertEqual(stat.S_IMODE(archive.parent.stat().st_mode), 0o700)
                self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)

        def checked_encrypt(archive, partial, key):
            check_private(archive)
            return encrypt(archive, partial, key)

        def checked_decrypt(bundle, archive, key):
            result = decrypt(bundle, archive, key)
            check_private(archive)
            return result

        with mock.patch.object(self.module, "_encrypt_archive", side_effect=checked_encrypt):
            self.pack()
        with mock.patch.object(self.module, "_decrypt_archive", side_effect=checked_decrypt):
            self.unpack()
        self.assert_no_temporary_files()

    def test_malformed_key_files_rejected(self):
        self.pack()
        for invalid in (b"", b"not-base64", base64.b64encode(b"short"),
                        base64.b64encode(os.urandom(32)) + b" garbage", b"x" * 1024):
            with self.subTest(length=len(invalid)):
                self.key_file.write_bytes(invalid)
                with self.assertRaises(ValueError):
                    self.unpack()
                self.assertFalse(self.destination.exists())
                self.assert_no_temporary_files()

    def test_concurrent_destination_creation_is_not_replaced(self):
        self.pack()
        original = self.module._rename_directory

        def create_then_publish(source, destination):
            destination.mkdir()
            return original(source, destination)

        with mock.patch.object(self.module, "_rename_directory", side_effect=create_then_publish):
            with self.assertRaises(FileExistsError):
                self.unpack()
        self.assertTrue(self.destination.is_dir())
        self.assertEqual(list(self.destination.iterdir()), [])
        self.assert_no_temporary_files()

    def test_cross_device_publish_recopies_and_verifies_before_publishing(self):
        source = self.root / "cross-device-source"
        source.mkdir()
        (source / "private.txt").write_bytes(b"verified private data")
        manifest = self.file_manifest("private.txt", b"verified private data")
        with mock.patch.object(self.module, "_rename_directory", side_effect=OSError(errno.EXDEV, "cross-device")):
            self.module._publish_extracted_directory(source, self.destination, manifest)
        self.assertEqual((self.destination / "private.txt").read_bytes(), b"verified private data")

    def test_cross_device_publish_rejects_a_corrupted_copy(self):
        source = self.root / "cross-device-source"
        source.mkdir()
        (source / "private.txt").write_bytes(b"verified private data")
        manifest = self.file_manifest("private.txt", b"verified private data")
        original = self.module.shutil.copytree

        def corrupt_copy(first, second, **kwargs):
            result = original(first, second, **kwargs)
            (Path(second) / "private.txt").write_bytes(b"modified")
            return result

        with (mock.patch.object(self.module, "_rename_directory", side_effect=OSError(errno.EXDEV, "cross-device")),
              mock.patch.object(self.module.shutil, "copytree", side_effect=corrupt_copy)):
            with self.assertRaises(ValueError):
                self.module._publish_extracted_directory(source, self.destination, manifest)
        self.assertTrue(self.destination.is_dir())

    def test_cli_stats_only_and_failure_does_not_leak_data(self):
        result = subprocess.run([
            sys.executable, "-B", str(SCRIPT), "pack", "--source", str(self.source),
            "--bundle", str(self.bundle), "--key-file", str(self.key_file),
        ], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout)["file_count"], 1)
        self.assertEqual(result.stderr, "")
        self.assertNotIn(self.key_file.read_text().strip(), result.stdout)
        result = subprocess.run([
            sys.executable, "-B", str(SCRIPT), "unpack", "--bundle", str(self.bundle),
            "--key-file", str(self.key_file), "--destination", str(self.destination),
        ], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout)["file_count"], 1)
        self.assertNotIn("database.sql", result.stdout)
        self.key_file.write_bytes(b"PRIVATE-INVALID-KEY")
        result = subprocess.run([
            sys.executable, "-B", str(SCRIPT), "unpack", "--bundle", str(self.bundle),
            "--key-file", str(self.key_file), "--destination", str(self.root / "failed"),
        ], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertNotIn("PRIVATE-INVALID-KEY", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_optional_oserror_diagnostic_has_no_paths_or_keys(self):
        self.pack()
        with mock.patch.object(self.module, "extract_bundle", side_effect=OSError(206, "Name too long")):
            with mock.patch.dict(os.environ, {"XIAOAN_PRIVATE_BUNDLE_DIAGNOSTICS": "1"}), \
                 mock.patch.object(sys, "argv", ["private_bundle.py", "unpack", "--bundle", str(self.bundle),
                                                   "--key-file", str(self.key_file), "--destination", str(self.destination)]), \
                 mock.patch("sys.stderr", new_callable=io.StringIO) as errors:
                self.assertEqual(self.module.main(), 1)
        message = errors.getvalue()
        self.assertIn('"winerror": null', message)
        self.assertNotIn(str(self.bundle), message)
        self.assertNotIn(self.key_file.read_text().strip(), message)


if __name__ == "__main__":
    unittest.main()
