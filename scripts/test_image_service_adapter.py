import base64
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from PIL import Image


class ImageServiceAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).with_name("image_service_adapter.py")
        if path.exists():
            spec = importlib.util.spec_from_file_location("adapter", path)
            cls.adapter = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.adapter)
        else:
            cls.adapter = None

    def setUp(self):
        self.assertIsNotNone(self.adapter, "Image response adapter must exist")
        image = io.BytesIO()
        Image.new("RGB", (1536, 1024), "#81909a").save(image, "PNG")
        self.png = image.getvalue()

    def test_base64_does_not_download(self):
        download = Mock()
        self.assertEqual(
            self.adapter.image_bytes(
                {"data": [{"b64_json": base64.b64encode(self.png).decode()}]}, download
            ),
            self.png,
        )
        download.assert_not_called()

    def test_url_response_with_null_base64_is_supported(self):
        download = Mock(return_value=self.png)
        self.assertEqual(
            self.adapter.image_bytes(
                {"data": [{"b64_json": None, "url": "https://cdn.example/image.png"}]},
                download,
            ),
            self.png,
        )
        download.assert_called_once_with("https://cdn.example/image.png")

    def test_missing_images_and_invalid_base64_fail_without_echoing_response(self):
        for payload in ({}, {"data": []}, {"data": [{}]},
                        {"data": [{"b64_json": "invalid-secret-value"}]}):
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError) as error:
                    self.adapter.image_bytes(payload, Mock())
                self.assertNotIn("secret-value", str(error.exception))

    def test_non_https_or_local_downloads_are_rejected(self):
        for url in ("file:///secret", "http://cdn.example/image.png",
                    "https://127.0.0.1/image.png", "https://localhost/image.png",
                    "https://user:pass@cdn.example/image.png"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.adapter.validate_url(url)

    def test_valid_image_saved_with_fictional_metadata_without_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preview.png"
            self.adapter.save_image(self.png, path)
            with Image.open(path) as image:
                self.assertEqual(image.size, (1536, 1024))
                self.assertIn("fictional", image.info["Description"])
            with self.assertRaises(FileExistsError):
                self.adapter.save_image(self.png, path)

    def test_html_or_truncated_image_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preview.png"
            for raw in (b"<html>error</html>", self.png[:80]):
                with self.assertRaises(ValueError):
                    self.adapter.save_image(raw, path)
                self.assertFalse(path.exists())

    def test_edit_sends_ordered_images_and_closes_files(self):
        self.assertTrue(hasattr(self.adapter, "request_image"), "Edit request helper must exist")
        client = Mock()
        captured = []
        def edit(**kwargs):
            captured.extend(kwargs["image"])
            self.assertEqual([file.read() for file in captured], [self.png, self.png])
            self.assertEqual(kwargs["model"], "gpt-image-2")
            self.assertNotIn("input_fidelity", kwargs)
            return "edited"
        client.images.edit.side_effect = edit
        with tempfile.TemporaryDirectory() as directory:
            scene, face = Path(directory) / "scene.png", Path(directory) / "face.png"
            scene.write_bytes(self.png)
            face.write_bytes(self.png)
            self.assertEqual(self.adapter.request_image(client, "edit", [scene, face]), "edited")
        self.assertTrue(all(file.closed for file in captured))
        client.images.generate.assert_not_called()

    def test_generate_still_uses_no_reference_files(self):
        self.assertTrue(hasattr(self.adapter, "request_image"), "Edit request helper must exist")
        client = Mock()
        self.adapter.request_image(client, "fictional scene", [])
        client.images.generate.assert_called_once()
        self.assertNotIn("image", client.images.generate.call_args.kwargs)
        client.images.edit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
