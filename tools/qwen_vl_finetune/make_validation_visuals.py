#!/usr/bin/env python3
"""Make honest validation visuals: risk accuracy and GT-box sample montage."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import matplotlib.pyplot as plt
from PIL import Image, ImageDraw, ImageFont


def font(size: int):
    for path in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--eval-log", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False

    data_records = [json.loads(line) for line in args.data.read_text(encoding="utf-8").splitlines() if line.strip()]
    records = {x["id"]: x for x in data_records}
    results = [json.loads(line) for line in args.eval_log.read_text(encoding="utf-8").splitlines() if '"expected"' in line]
    by_class = defaultdict(lambda: [0, 0])
    for row in results:
        by_class[row["expected"]][0] += 1
        by_class[row["expected"]][1] += int(row["correct"])
    classes = list(by_class)
    names = {"fight": "打架", "suicide": "自杀", "gather": "聚集", "fall | fight": "摔倒+打架"}
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=160)
    accuracy = [100 * by_class[c][1] / by_class[c][0] for c in classes]
    bars = ax.bar([names.get(c, c) for c in classes], accuracy, color=["#2563eb", "#dc2626", "#16a34a", "#f59e0b"][: len(classes)])
    ax.set_ylim(0, 105)
    ax.set_ylabel("风险字符串准确率 (%)")
    ax.set_title("验证集风险判断准确率（按样本标签统计）")
    ax.grid(axis="y", alpha=0.25)
    for bar, c in zip(bars, classes):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2, f"{by_class[c][1]}/{by_class[c][0]}", ha="center")
    fig.tight_layout()
    fig.savefig(args.output / "validation_risk_accuracy.png", bbox_inches="tight")
    plt.close(fig)

    chosen = []
    for wanted in ["fight", "suicide", "gather", "fall | fight"]:
        row_index = next((i for i, r in enumerate(results) if r["expected"] == wanted), None)
        if row_index is not None and row_index < len(data_records):
            row = results[row_index]
            chosen.append((row, data_records[row_index]))
    tiles = []
    for row, rec in chosen:
        image = Image.open(rec["image"]).convert("RGB")
        draw = ImageDraw.Draw(image)
        label_json = json.loads(rec["messages"][1]["content"][0]["text"])
        for obj in label_json["objects"]:
            _, _, w, h = obj["bbox"]
            cx, cy = obj["bbox"][:2]
            x1 = int((cx - w / 2) * image.width)
            y1 = int((cy - h / 2) * image.height)
            x2 = int((cx + w / 2) * image.width)
            y2 = int((cy + h / 2) * image.height)
            draw.rectangle((x1, y1, x2, y2), outline=(0, 255, 0), width=max(3, image.width // 300))
        caption = f"真实: {names.get(row['expected'], row['expected'])} | Qwen: {names.get(row['predicted'], row['predicted'])}"
        draw.rectangle((0, 0, image.width, 48), fill=(0, 0, 0))
        draw.text((10, 10), caption, fill=(255, 255, 255), font=font(max(18, image.width // 55)))
        image.thumbnail((720, 420))
        tiles.append(image)
    if tiles:
        canvas = Image.new("RGB", (1440, 840), "white")
        for i, tile in enumerate(tiles):
            x = (i % 2) * 720
            y = (i // 2) * 420
            canvas.paste(tile, (x, y))
        canvas.save(args.output / "validation_gt_boxes_qwen_risk.png")
    print(args.output)


if __name__ == "__main__":
    main()
