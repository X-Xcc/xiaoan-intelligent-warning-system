import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("source_snapshot", Path(__file__).parents[1] / "source_snapshot.py")
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SourceSnapshotTests(unittest.TestCase):
    def test_database_password_is_only_in_environment(self):
        environment = snapshot.pg_environment("postgresql+psycopg://reader:a%3Ab@localhost:5444/source")
        self.assertEqual(environment["PGPASSWORD"], "a:b")
        self.assertEqual(environment["PGDATABASE"], "source")
        self.assertIn("read_only=on", environment["PGOPTIONS"])

    def test_rejects_incomplete_database_url(self):
        for value in ("", "sqlite:///file", "postgresql:///source", "postgresql://localhost/"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                snapshot.pg_environment(value)

    def test_copy_tree_keeps_files_and_empty_folders(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            (source / "empty").mkdir()
            (source / "data.bin").write_bytes(bytes(range(256)))
            result = snapshot.copy_stable_tree(source, root / "copy")
            self.assertEqual(result, {"files": 1, "bytes": 256})
            self.assertTrue((root / "copy/empty").is_dir())
            self.assertEqual((root / "copy/data.bin").read_bytes(), bytes(range(256)))

    def test_snapshot_never_overwrites_an_existing_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ValueError):
                snapshot.snapshot(root, root, root)

    def test_private_json_is_exclusive(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "private.json"
            snapshot.private_json(path, {"token": "synthetic"})
            with self.assertRaises(FileExistsError):
                snapshot.private_json(path, {"token": "replacement"})
            self.assertIn("synthetic", path.read_text())


if __name__ == "__main__":
    unittest.main()
