#!/usr/bin/env python3
"""Create compact training and validation plots for the Qwen-VL run."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--stats", type=Path, required=True)
    parser.add_argument("--eval-log", type=Path, required=True)
    args = parser.parse_args()
    out = args.run / "figures"
    out.mkdir(parents=True, exist_ok=True)
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False

    state = json.loads((args.run / "checkpoint-31" / "trainer_state.json").read_text(encoding="utf-8"))
    history = [x for x in state.get("log_history", []) if "loss" in x]
    steps = [x.get("step", i + 1) for i, x in enumerate(history)]
    losses = [x["loss"] for x in history]
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=160)
    ax.plot(steps, losses, marker="o", linewidth=1.8, markersize=3.5, color="#2563eb")
    ax.set_title("Qwen2.5-VL QLoRA 训练损失")
    ax.set_xlabel("优化步")
    ax.set_ylabel("Loss")
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(out / "training_loss.png", bbox_inches="tight")
    plt.close(fig)

    stats = json.loads(args.stats.read_text(encoding="utf-8"))
    labels = ["fall", "fight", "gather", "suicide"]
    train_counts = [stats["train_objects"].get(k, 0) for k in labels]
    val_counts = [stats["val_objects"].get(k, 0) for k in labels]
    x = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=160)
    ax.bar(x - 0.18, train_counts, 0.36, label="训练集", color="#0ea5e9")
    ax.bar(x + 0.18, val_counts, 0.36, label="验证集", color="#f97316")
    ax.set_xticks(x, ["摔倒", "打架", "聚集", "自杀"])
    ax.set_ylabel("目标框数量")
    ax.set_title("动作类别分布")
    ax.legend()
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(out / "class_distribution.png", bbox_inches="tight")
    plt.close(fig)

    rows = [json.loads(line) for line in args.eval_log.read_text(encoding="utf-8").splitlines() if '"expected"' in line]
    class_order = ["fight", "suicide", "gather", "fall | fight"]
    display_names = ["打架", "自杀", "聚集", "摔倒+打架"]
    total = [sum(row.get("expected") == key for row in rows) for key in class_order]
    correct = [sum(row.get("expected") == key and row.get("correct") for row in rows) for key in class_order]
    wrong = [a - b for a, b in zip(total, correct)]
    x = np.arange(len(class_order))
    fig, ax = plt.subplots(figsize=(8, 4.8), dpi=160)
    ax.bar(x, correct, color="#16a34a", label="判断正确")
    ax.bar(x, wrong, bottom=correct, color="#dc2626", label="判断错误")
    for i, (c, t) in enumerate(zip(correct, total)):
        if t:
            ax.text(i, t + 0.6, f"{c}/{t} ({c/t:.0%})", ha="center", va="bottom", fontsize=9)
    ax.set_xticks(x, display_names)
    ax.set_ylabel("验证样本数")
    ax.set_title("验证集风险判断（按完整 risk 字符串，非标准混淆矩阵）")
    ax.legend()
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(out / "validation_risk_accuracy.png", bbox_inches="tight")
    plt.close(fig)
    print(out)


if __name__ == "__main__":
    main()
