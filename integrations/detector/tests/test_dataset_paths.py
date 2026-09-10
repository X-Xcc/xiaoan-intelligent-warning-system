import importlib.util
from pathlib import Path
import tempfile
import unittest

import yaml


class DatasetPathsTests(unittest.TestCase):
    def test_windows_yaml_uses_runtime_copy_without_changing_export(self):
        module_path = Path(__file__).resolve().parents[1] / "detection" / "dataset_paths.py"
        self.assertTrue(module_path.is_file(), "Portable dataset configuration adapter is missing")
        spec = importlib.util.spec_from_file_location("dataset_paths", module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            datasets = root / "training-datasets"
            dataset = datasets / "actions"
            (dataset / "images" / "train").mkdir(parents=True)
            (dataset / "images" / "val").mkdir()
            original = dataset / "action_data.yaml"
            source = {
                "path": r"Z:\fixture\detection\datasets\actions",
                "train": r"Z:\fixture\detection\datasets\actions\images\train",
                "val": "images/val", "names": {0: "fixture"},
                "download": "raise RuntimeError('must never execute')",
            }
            original.write_text(yaml.safe_dump(source), encoding="utf-8")
            before = original.read_bytes()
            derived = module.portable_dataset_config(original, datasets, root / "runtime")
            result = yaml.safe_load(derived.read_text(encoding="utf-8"))
            self.assertEqual(original.read_bytes(), before)
            self.assertNotEqual(derived, original)
            self.assertEqual(result["path"], str(dataset.resolve()))
            self.assertEqual(result["train"], str((dataset / "images" / "train").resolve()))
            self.assertEqual(result["val"], str((dataset / "images" / "val").resolve()))
            self.assertEqual(result["names"], source["names"])
            self.assertNotIn("download", result)


if __name__ == "__main__":
    unittest.main()
