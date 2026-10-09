#!/usr/bin/env python3
"""Convert YOLO action annotations into Qwen-VL supervised fine-tuning JSONL."""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path


CLASS_NAMES = {0: "fall", 1: "fight", 2: "gather", 3: "suicide"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def parse_labels(path: Path) -> list[dict[str, object]]:
    objects: list[dict[str, object]] = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        parts = raw.split()
        if not parts:
            continue
        if len(parts) != 5:
            raise ValueError(f"{path}:{line_no}: expected 5 YOLO fields, got {len(parts)}")
        class_id = int(parts[0])
        if class_id not in CLASS_NAMES:
            raise ValueError(f"{path}:{line_no}: unknown class id {class_id}")
        coords = [round(float(value), 6) for value in parts[1:]]
        if any(value < 0 or value > 1 for value in coords):
            raise ValueError(f"{path}:{line_no}: coordinates must be in [0, 1]")
        objects.append({"label": CLASS_NAMES[class_id], "bbox": coords})
    return objects


def find_pairs(root: Path, split: str) -> list[tuple[Path, Path]]:
    image_dir = root / "images" / split
    label_dir = root / "labels" / split
    pairs: list[tuple[Path, Path]] = []
    for image in sorted(image_dir.iterdir()):
        if image.is_file() and image.suffix.lower() in IMAGE_EXTS:
            label = label_dir / f"{image.stem}.txt"
            if label.is_file():
                pairs.append((image, label))
    return pairs


def make_record(image: Path, label_path: Path, split: str) -> dict[str, object]:
    objects = parse_labels(label_path)
    counts = Counter(obj["label"] for obj in objects)
    answer = {
        "risk": " | ".join(sorted(counts)) if counts else "none",
        "objects": objects,
    }
    prompt = (
        "你是夜市安防视觉研判助手。请分析这张监控图片，识别是否存在摔倒、打架、聚集或自杀风险。"
        "请只输出 JSON，字段为 risk（风险类别，用 | 分隔；没有则为 none）和 objects（每个目标的 label 与 YOLO 归一化框 [x_center,y_center,width,height]）。"
    )
    return {
        "id": f"{split}-{image.stem}",
        "image": str(image.resolve()),
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": str(image.resolve())},
                    {"type": "text", "text": prompt},
                ],
            },
            {
                "role": "assistant",
                "content": [{"type": "text", "text": json.dumps(answer, ensure_ascii=False)}],
            },
        ],
    }


def write_split(root: Path, output: Path, split: str, seed: int) -> tuple[int, Counter[str]]:
    pairs = find_pairs(root, split)
    random.Random(seed).shuffle(pairs)
    records: list[dict[str, object]] = []
    counts: Counter[str] = Counter()
    for image, label in pairs:
        record = make_record(image, label, split)
        records.append(record)
        for obj in parse_labels(label):
            counts[str(obj["label"])] += 1
    output.mkdir(parents=True, exist_ok=True)
    with (output / f"{split}.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return len(records), counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260929)
    args = parser.parse_args()

    train_count, train_classes = write_split(args.source, args.output, "train", args.seed)
    val_count, val_classes = write_split(args.source, args.output, "val", args.seed + 1)
    stats = {
        "source": str(args.source.resolve()),
        "train_examples": train_count,
        "val_examples": val_count,
        "train_objects": dict(sorted(train_classes.items())),
        "val_objects": dict(sorted(val_classes.items())),
        "classes": CLASS_NAMES,
    }
    (args.output / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
