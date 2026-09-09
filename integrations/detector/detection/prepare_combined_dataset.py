"""Build a balanced 5-class dataset from the action set and person datasets."""

from __future__ import annotations

import argparse
import random
import shutil
from pathlib import Path


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
ACTION_CLASSES = {"0", "1", "2", "3"}


def pairs_for(root: Path, split: str) -> list[tuple[Path, Path]]:
    if (root / "images" / split).exists():
        image_dir = root / "images" / split
        label_dir = root / "labels" / split
    else:
        image_dir = root / split / "images"
        label_dir = root / split / "labels"
    pairs: list[tuple[Path, Path]] = []
    for image in sorted(image_dir.iterdir()):
        if image.is_file() and image.suffix.lower() in IMAGE_EXTS:
            label = label_dir / f"{image.stem}.txt"
            if label.exists():
                pairs.append((image, label))
    return pairs


def normalize_label_line(label_path: Path, line_number: int, raw: str, class_id: str) -> str | None:
    parts = raw.split()
    if not parts:
        return None
    if parts[0] != "0":
        raise ValueError(f"{label_path}:{line_number}: expected source class 0")
    values = [float(value) for value in parts[1:]]
    if len(values) == 4:
        x, y, w, h = values
        coords = (x, y, w, h)
    elif len(values) >= 6 and len(values) % 2 == 0:
        xs = values[0::2]
        ys = values[1::2]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        coords = (
            (x_min + x_max) / 2,
            (y_min + y_max) / 2,
            x_max - x_min,
            y_max - y_min,
        )
    else:
        raise ValueError(f"{label_path}:{line_number}: unsupported YOLO label with {len(values)} coordinates")
    if any(value < 0 or value > 1 for value in coords):
        raise ValueError(f"{label_path}:{line_number}: coordinates must be 0..1")
    return f"{class_id} " + " ".join(f"{value:.6f}" for value in coords)


def validate_person_label(label_path: Path) -> None:
    for line_number, raw in enumerate(
        label_path.read_text(encoding="utf-8").splitlines(), 1
    ):
        normalize_label_line(label_path, line_number, raw, "4")


def write_label(label_path: Path, destination: Path, person: bool) -> None:
    lines = []
    for line_number, raw in enumerate(label_path.read_text(encoding="utf-8").splitlines(), 1):
        parts = raw.split()
        if not parts:
            continue
        if person:
            lines.append(normalize_label_line(label_path, line_number, raw, "4"))
        else:
            if parts[0] not in ACTION_CLASSES or len(parts) != 5:
                raise ValueError(f"{label_path}:{line_number}: unexpected action label")
            lines.append(" ".join(parts))
    destination.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def copy_pairs(
    pairs: list[tuple[Path, Path]],
    output: Path,
    split: str,
    prefix: str,
    person: bool,
) -> int:
    image_out = output / "images" / split
    label_out = output / "labels" / split
    image_out.mkdir(parents=True, exist_ok=True)
    label_out.mkdir(parents=True, exist_ok=True)
    for index, (image, label) in enumerate(pairs, 1):
        stem = f"{prefix}_{index:05d}_{image.stem}"
        shutil.copy2(image, image_out / f"{stem}{image.suffix.lower()}")
        write_label(label, label_out / f"{stem}.txt", person=person)
    return len(pairs)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--action-root", type=Path, required=True)
    parser.add_argument("--person-root", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--train-per-source", type=int, default=1000)
    parser.add_argument("--val-per-source", type=int, default=300)
    parser.add_argument("--seed", type=int, default=20260828)
    args = parser.parse_args()

    if len(args.person_root) != 3:
        raise SystemExit("exactly three --person-root values are required")

    if args.output.exists():
        shutil.rmtree(args.output)
    randomizer = random.Random(args.seed)
    train_count = copy_pairs(
        pairs_for(args.action_root, "train"),
        args.output,
        "train",
        "action",
        person=False,
    )
    val_count = copy_pairs(
        pairs_for(args.action_root, "val"),
        args.output,
        "val",
        "action",
        person=False,
    )

    person_train = person_val = 0
    for source_index, root in enumerate(args.person_root, 1):
        train_pairs = pairs_for(root, "train")
        val_split = "valid" if (root / "valid").exists() else "val"
        val_pairs = pairs_for(root, val_split)
        for label in [label for _, label in train_pairs + val_pairs]:
            validate_person_label(label)
        randomizer.shuffle(train_pairs)
        randomizer.shuffle(val_pairs)
        train_pairs = train_pairs[: args.train_per_source]
        val_pairs = val_pairs[: args.val_per_source]
        person_train += copy_pairs(
            train_pairs,
            args.output,
            "train",
            f"person{source_index}",
            person=True,
        )
        person_val += copy_pairs(
            val_pairs,
            args.output,
            "val",
            f"person{source_index}",
            person=True,
        )

    yaml = "\n".join(
        [
            f"path: {args.output.resolve().as_posix()}",
            "train: images/train",
            "val: images/val",
            "",
            "names:",
            "  0: fall",
            "  1: fight",
            "  2: gather",
            "  3: suicide",
            "  4: person",
            "",
        ]
    )
    (args.output / "action_person_data.yaml").write_text(yaml, encoding="utf-8")
    print(f"output: {args.output.resolve()}")
    print(f"action train/val: {train_count}/{val_count}")
    print(f"person train/val: {person_train}/{person_val}")
    print(f"total train/val: {train_count + person_train}/{val_count + person_val}")
    print("classes: fall, fight, gather, suicide, person")


if __name__ == "__main__":
    main()
