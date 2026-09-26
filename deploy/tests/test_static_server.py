"""HTTP-level confinement tests using temporary public and private fixtures."""
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
import os
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.parse import quote


SPEC = importlib.util.spec_from_file_location(
    "static_server", Path(__file__).parents[1] / "native/static_server.py"
)
static_server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(static_server)


class StaticServerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="native-http-")
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name).resolve()
        self.root = self.base / "public"
        self.root.mkdir()
        (self.root / "assets").mkdir()
        (self.root / "index.html").write_bytes(b"fixture-spa")
        (self.root / "assets/app.js").write_bytes(b"fixture-asset")
        (self.root / "assets/space name.js").write_bytes(b"fixture-space")
        self.outside = self.base / "private.txt"
        self.private = b"PRIVATE-FIXTURE-MUST-NOT-BE-SERVED"
        self.outside.write_bytes(self.private)

        class Handler(static_server.ApplicationHandler):
            root = self.root

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.addCleanup(self.server.server_close)
        thread = Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.01},
            daemon=True,
        )
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(self.server.shutdown)

    def request(self, path, method="GET"):
        connection = HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def assert_denied(self, path):
        for method in ("GET", "HEAD"):
            with self.subTest(path=path, method=method):
                status, body = self.request(path, method)
                self.assertEqual(status, 403)
                self.assertNotIn(self.private, body)
                self.assertNotIn(str(self.base).encode(), body)

    def test_assets_spa_routes_and_missing_assets_keep_their_http_semantics(self):
        for path, expected in (
            ("/", b"fixture-spa"),
            ("/admin/bridges?filter=active", b"fixture-spa"),
            ("/assets/app.js?v=1", b"fixture-asset"),
            ("/assets/space%20name.js", b"fixture-space"),
        ):
            with self.subTest(path=path):
                self.assertEqual(self.request(path), (200, expected))
                self.assertEqual(self.request(path, "HEAD"), (200, b""))
        for path in ("/assets/missing.js", "/assets/missing%2Ejs"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 404)

    def test_traversal_and_encoded_backslashes_are_forbidden(self):
        for path in (
            "/../private.txt", "/%2e%2e/private.txt",
            "/assets/%2e%2e/%2e%2e/private.txt",
            "/..%5cprivate.txt", "/assets%5c..%5c..%5cprivate.txt",
            "/assets/..%20/private.txt", "/assets/..%2e/private.txt",
        ):
            self.assert_denied(path)

    @unittest.skipUnless(os.name == "nt", "Windows drive paths")
    def test_windows_drive_and_device_paths_cannot_disclose_fixture(self):
        absolute = str(self.outside)
        for path in (
            "/" + absolute.replace("\\", "/"),
            "/" + quote(absolute, safe=""),
            "/" + quote("\\\\?\\" + absolute, safe=""),
            "/" + self.outside.drive + "private.txt",
        ):
            self.assert_denied(path)

    def test_unc_paths_are_rejected_before_filesystem_resolution(self):
        resolve = Path.resolve

        def resolve_without_network(path, *args, **kwargs):
            # Never contact a network share, even when testing vulnerable code.
            if str(path).startswith("\\\\"):
                return self.outside
            return resolve(path, *args, **kwargs)

        with patch.object(Path, "resolve", autospec=True, side_effect=resolve_without_network):
            for path in (
                "/%5c%5cfixture-host%5cshare%5cprivate.txt",
                "/%2f%2ffixture-host/share/private.txt",
                "/%5c%5c%3f%5cUNC%5cfixture-host%5cshare%5cprivate.txt",
            ):
                self.assert_denied(path)

    @unittest.skipUnless(os.name == "nt", "NTFS alternate data streams")
    def test_alternate_data_streams_are_not_served(self):
        asset = self.root / "assets/app.js"
        Path(str(asset) + ":private").write_bytes(self.private)
        for path in (
            "/assets/app.js:private", "/assets/app.js%3aprivate",
            "/assets/app.js::$DATA", "/assets/app.js%3a%3a%24DATA",
        ):
            self.assert_denied(path)

    def test_resolved_file_and_spa_index_escapes_are_denied(self):
        resolve = Path.resolve
        for escaped, request in (
            (self.root / "leak.txt", "/leak.txt"),
            (self.root / "linked", "/linked"),
            (self.root / "index.html", "/admin/bridges"),
        ):
            with self.subTest(escaped=escaped):
                def resolve_link(path, *args, **kwargs):
                    if path == escaped:
                        return self.outside
                    return resolve(path, *args, **kwargs)

                with patch.object(Path, "resolve", autospec=True, side_effect=resolve_link):
                    self.assert_denied(request)

    @unittest.skipUnless(os.name == "nt", "Windows directory junction")
    def test_directory_junction_cannot_escape_public_root(self):
        import subprocess

        link = self.root / "junction"
        result = subprocess.run(
            ["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(self.base)],
            capture_output=True, timeout=10, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        # Unlink the junction itself before TemporaryDirectory walks its parent.
        self.addCleanup(link.rmdir)
        self.assert_denied("/junction/private.txt")
        self.assert_denied("/junction/missing-route")

    def symlink(self, link, target, directory=False):
        try:
            link.symlink_to(target, target_is_directory=directory)
        except OSError as error:
            self.skipTest(f"Symlinks unavailable: {error}")

    def test_file_symlink_cannot_escape_public_root(self):
        self.symlink(self.root / "leak.txt", self.outside)
        self.assert_denied("/leak.txt")

    def test_directory_symlink_cannot_escape_public_root(self):
        self.symlink(self.root / "linked", self.base, directory=True)
        self.assert_denied("/linked/private.txt")
        self.assert_denied("/linked/missing-route")

    def test_spa_fallback_cannot_follow_an_escaping_index_symlink(self):
        (self.root / "index.html").unlink()
        self.symlink(self.root / "index.html", self.outside)
        self.assert_denied("/admin/bridges")

    def test_in_root_symlink_remains_servable(self):
        self.symlink(self.root / "alias.js", self.root / "assets/app.js")
        self.assertEqual(self.request("/alias.js"), (200, b"fixture-asset"))


if __name__ == "__main__":
    unittest.main()
