import importlib.util
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "configure.py"


class ConfigurationTests(unittest.TestCase):
    def load_module(self):
        self.assertTrue(SCRIPT.is_file(), "Deployment configuration generator is missing")
        spec = importlib.util.spec_from_file_location("configure", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_fresh_install_has_unique_secrets_and_loopback_binding(self):
        module = self.load_module()
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            module.configure(Path(first))
            module.configure(Path(second))
            one = module.read_config(Path(first) / ".env")
            two = module.read_config(Path(second) / ".env")
            self.assertEqual(one["WEB_BIND"], "127.0.0.1")
            self.assertEqual(one["WEB_PORT"], "8080")
            for key in ("POSTGRES_PASSWORD", "CICSIC_ADMIN_TOKEN"):
                self.assertRegex(one[key], r"^[a-f0-9]{64}$")
                self.assertNotEqual(one[key], two[key])
            self.assertNotEqual(one["POSTGRES_PASSWORD"], one["CICSIC_ADMIN_TOKEN"])

    def test_restart_never_changes_existing_passwords(self):
        module = self.load_module()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            module.configure(path)
            before = (path / ".env").read_bytes()
            module.configure(path)
            self.assertEqual((path / ".env").read_bytes(), before)

    def test_invalid_existing_file_is_rejected_without_replacing_it(self):
        module = self.load_module()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / ".env").write_text("POSTGRES_PASSWORD=example\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                module.configure(path)
            self.assertEqual((path / ".env").read_text(), "POSTGRES_PASSWORD=example\n")


if __name__ == "__main__":
    unittest.main()
