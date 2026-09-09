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

    def test_detector_credentials_are_generated_once_and_preserved(self):
        module = self.load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            module.configure(root)
            module.configure_detector(root)
            before = (root / "detector.env").read_bytes()
            values = module.read_config(root / "detector.env")
            self.assertEqual(values["ADMIN_USERNAME"], "xiaoan-admin")
            for key in ("ADMIN_PASSWORD", "API_KEY", "JWT_SECRET"):
                self.assertGreaterEqual(len(values[key]), 32)
            module.configure_detector(root)
            self.assertEqual((root / "detector.env").read_bytes(), before)

    def test_detector_does_not_replace_restored_credentials(self):
        module = self.load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            module.configure(root)
            original = 'ADMIN_USERNAME="original"\nADMIN_PASSWORD="original-password"\n'
            (root / "detector.env").write_text(original)
            module.configure_detector(root)
            after = (root / "detector.env").read_text()
            self.assertTrue(after.startswith(original))
            self.assertEqual(after.count("ADMIN_PASSWORD="), 1)


if __name__ == "__main__":
    unittest.main()
