"""
Prepare the action annotation dataset for YOLO detection training.

Input labels use names such as:
    Fight 0.57 0.49 0.33 0.98

Output labels use YOLO class ids and an 80/20 train/val split.
"""

from __future__ import annotations

import argparse
import random
import shutil
from collections import Counter
from pathlib import Path


CLASS_MAP = {
    "Fall": 0,
    "Fight": 1,
    "Gather": 2,
    "Suicide": 3,
}

CLASS_NAMES = {
    0: "fall",
    1: "fight",
    2: "gather",
    3: "suicide",
}

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG")


def find_image_for_label(label_path: Path) -> Path | None:
    for ext in IMAGE_EXTS:
        image_path = label_path.with_suffix(ext)
        if image_path.exists():
            return image_path
    return None


def convert_label(src: Path, dst: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    output_lines: list[str] = []

    for line_number, raw_line in enumerate(src.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 5:
            raise ValueError(f"{src}:{line_number}: expected 5 fields, got {len(parts)}")

        label = parts[0]
        if label not in CLASS_MAP:
            raise ValueError(f"{src}:{line_number}: unknown label {label!r}")

        coords = [float(value) for value in parts[1:]]
        if any(value < 0 or value > 1 for value in coords):
            raise ValueError(f"{src}:{line_number}: coordinates must be normalized to 0..1")

        counts[label] += 1
        output_lines.append(f"{CLASS_MAP[label]} {' '.join(f'{value:.6f}' for value in coords)}")

    dst.write_text("\n".join(output_lines) + "\n", encoding="utf-8")
    return counts


def clean_output(root: Path) -> None:
    if not root.exists():
        return
    for child in root.iterdir():
        if child.is_dir() and child.name in {"images", "labels"}:
            shutil.rmtree(child)
        elif child.is_file() and child.name == "action_data.yaml":
            child.unlink()


def prepare_dataset(source: Path, output: Path, val_ratio: float, seed: int) -> None:
    pairs: list[tuple[Path, Path]] = []
    missing_images: list[Path] = []

    for label_path in sorted(source.rglob("*.txt")):
        image_path = find_image_for_label(label_path)
        if image_path is None:
            missing_images.append(label_path)
            continue
        pairs.append((image_path, label_path))

    if not pairs:
        raise SystemExit(f"No image/label pairs found under {source}")

    random.Random(seed).shuffle(pairs)
    val_count = max(1, round(len(pairs) * val_ratio))
    train_pairs = pairs[val_count:]
    val_pairs = pairs[:val_count]

    clean_output(output)
    for split in ("train", "val"):
        (output / "images" / split).mkdir(parents=True, exist_ok=True)
        (output / "labels" / split).mkdir(parents=True, exist_ok=True)

    class_counts: Counter[str] = Counter()
    split_counts: dict[str, int] = {}

    for split, split_pairs in (("train", train_pairs), ("val", val_pairs)):
        split_counts[split] = len(split_pairs)
        for index, (image_path, label_path) in enumerate(split_pairs, 1):
            safe_stem = f"{label_path.parent.name}_{label_path.stem}_{index:05d}"
            image_dst = output / "images" / split / f"{safe_stem}{image_path.suffix.lower()}"
            label_dst = output / "labels" / split / f"{safe_stem}.txt"
            shutil.copy2(image_path, image_dst)
            class_counts.update(convert_label(label_path, label_dst))

    yaml_text = "\n".join(
        [
            f"path: {output.as_posix()}",
            "train: images/train",
            "val: images/val",
            "",
            "names:",
            *[f"  {class_id}: {name}" for class_id, name in CLASS_NAMES.items()],
            "",
        ]
    )
    (output / "action_data.yaml").write_text(yaml_text, encoding="utf-8")

    print(f"source: {source}")
    print(f"output: {output}")
    print(f"pairs: {len(pairs)}")
    print(f"train: {split_counts['train']}")
    print(f"val: {split_counts['val']}")
    print(f"objects: {sum(class_counts.values())}")
    print("classes:")
    for label, count in sorted(class_counts.items()):
        print(f"  {label}: {count}")
    print(f"missing_images: {len(missing_images)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare action annotations for YOLO detection training")
    parser.add_argument("--source", required=True, help="Private source dataset directory")
    parser.add_argument("--output", default="detection/datasets/actions")
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=20260828)
    args = parser.parse_args()

    prepare_dataset(
        source=Path(args.source),
        output=Path(args.output).resolve(),
        val_ratio=args.val_ratio,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
