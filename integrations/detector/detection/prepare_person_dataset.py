"""Build a one-class person dataset from Roboflow YOLO exports."""

from __future__ import annotations

import argparse
import random
import shutil
from pathlib import Path


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def pairs_for(root: Path, split: str) -> list[tuple[Path, Path]]:
    if (root / "images" / split).exists():
        image_dir = root / "images" / split
        label_dir = root / "labels" / split
    else:
        image_dir = root / split / "images"
        label_dir = root / split / "labels"
    pairs = []
    for image in sorted(image_dir.iterdir()):
        if image.is_file() and image.suffix.lower() in IMAGE_EXTS:
            label = label_dir / f"{image.stem}.txt"
            if label.exists():
                pairs.append((image, label))
    return pairs


def convert_label(source: Path, destination: Path) -> None:
    output = []
    for line_number, raw in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
        parts = raw.split()
        if not parts:
            continue
        if parts[0] != "0":
            raise ValueError(f"{source}:{line_number}: expected source class 0")
        values = [float(value) for value in parts[1:]]
        if len(values) == 4:
            coords = values
        elif len(values) >= 6 and len(values) % 2 == 0:
            xs = values[0::2]
            ys = values[1::2]
            x_min, x_max = min(xs), max(xs)
            y_min, y_max = min(ys), max(ys)
            coords = [(x_min + x_max) / 2, (y_min + y_max) / 2, x_max - x_min, y_max - y_min]
        else:
            raise ValueError(f"{source}:{line_number}: unsupported label format")
        if any(value < 0 or value > 1 for value in coords):
            raise ValueError(f"{source}:{line_number}: coordinates must be 0..1")
        output.append("0 " + " ".join(f"{value:.6f}" for value in coords))
    destination.write_text("\n".join(output) + ("\n" if output else ""), encoding="utf-8")


def copy_pairs(pairs, output: Path, split: str, prefix: str) -> int:
    image_dir = output / "images" / split
    label_dir = output / "labels" / split
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    for index, (image, label) in enumerate(pairs, 1):
        stem = f"{prefix}_{index:05d}_{image.stem}"
        shutil.copy2(image, image_dir / f"{stem}{image.suffix.lower()}")
        convert_label(label, label_dir / f"{stem}.txt")
    return len(pairs)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--person-root", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260828)
    args = parser.parse_args()
    if len(args.person_root) != 3:
        raise SystemExit("exactly three --person-root values are required")

    if args.output.exists():
        shutil.rmtree(args.output)
    output = args.output.resolve()
    randomizer = random.Random(args.seed)
    train_count = val_count = 0
    for source_index, root in enumerate(args.person_root, 1):
        train_pairs = pairs_for(root, "train")
        val_split = "valid" if (root / "valid").exists() else "val"
        val_pairs = pairs_for(root, val_split)
        randomizer.shuffle(train_pairs)
        randomizer.shuffle(val_pairs)
        train_count += copy_pairs(train_pairs, output, "train", f"person{source_index}")
        val_count += copy_pairs(val_pairs, output, "val", f"person{source_index}")

    yaml = "\n".join([
        f"path: {output.as_posix()}",
        "train: images/train",
        "val: images/val",
        "",
        "names:",
        "  0: person",
        "",
    ])
    (output / "person_data.yaml").write_text(yaml, encoding="utf-8")
    print(f"output: {output}")
    print(f"train/val: {train_count}/{val_count}")


if __name__ == "__main__":
    main()
