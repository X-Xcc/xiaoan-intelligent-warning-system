"""Create portable training configuration copies; never rewrite private exports."""

import hashlib
import os
from pathlib import Path, PureWindowsPath
import tempfile

import yaml


def portable_dataset_config(source, datasets_root, output_root=None):
    source = Path(source).resolve()
    datasets_root = Path(datasets_root).resolve()
    original = source.read_bytes()
    config = yaml.safe_load(original)
    if not isinstance(config, dict):
        raise ValueError("Dataset YAML must contain a mapping")

    def resolve(value, relative_root):
        text = str(value)
        windows = PureWindowsPath(text)
        native = Path(text)
        if windows.is_absolute() or native.is_absolute():
            if native.is_absolute() and native.resolve().is_relative_to(datasets_root):
                result = native
            else:
                parts = windows.parts if windows.is_absolute() else native.parts
                anchors = [i for i, part in enumerate(parts)
                           if part.lower() in {"datasets", "training-datasets"}]
                if not anchors:
                    raise ValueError("Foreign dataset path has no datasets root; provide a separate portable YAML")
                result = datasets_root.joinpath(*parts[anchors[-1] + 1:])
        else:
            result = relative_root.joinpath(*windows.parts)
        result = result.resolve()
        if not result.is_relative_to(datasets_root):
            raise ValueError("Dataset paths must stay inside TRAINING_DATASETS_DIR")
        if not result.exists():
            raise ValueError("Mapped dataset path is missing; restore the complete private dataset")
        return str(result)

    config["path"] = resolve(config.get("path") or str(source.parent), source.parent)
    for key in ("train", "val", "test"):
        value = config.get(key)
        if value:
            config[key] = ([resolve(item, Path(config["path"])) for item in value]
                           if isinstance(value, list) else resolve(value, Path(config["path"])))
    # Dataset-supplied download hooks must not run during a private restoration.
    config.pop("download", None)
    destination = Path(output_root or os.environ.get("XDG_CACHE_HOME", tempfile.gettempdir())) / "dataset-configs"
    destination.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(original + str(datasets_root).encode()).hexdigest()[:20]
    result = destination / f"{digest}.yaml"
    fd, temporary = tempfile.mkstemp(dir=destination, suffix=".yaml")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            yaml.safe_dump(config, handle, allow_unicode=True, sort_keys=False)
        os.replace(temporary, result)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return result
