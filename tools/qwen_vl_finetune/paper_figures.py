#!/usr/bin/env python3
"""Publication-ready figures from the completed Qwen-VL fine-tuning run."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib as mpl
import numpy as np
import seaborn as sns
from PIL import Image
from matplotlib.patches import Rectangle
from matplotlib import font_manager


TOKENS = {
    "surface": "#FCFCFD",
    "panel": "#FFFFFF",
    "ink": "#1F2430",
    "muted": "#6F768A",
    "grid": "#E6E8F0",
    "axis": "#D7DBE7",
}
BLUE = {"base": "#5477C4", "dark": "#2E4780", "light": "#CEDFFE", "xlight": "#EAF1FE"}
GOLD = {"base": "#B8A037", "dark": "#736422", "light": "#FFEA8F", "xlight": "#FFF4C2"}
ORANGE = {"base": "#CC6F47", "dark": "#804126", "light": "#FFBDA1", "xlight": "#FFEDDE"}
OLIVE = {"base": "#71B436", "dark": "#386411", "light": "#BEEB96", "xlight": "#D8ECBD"}
FONT_PATH = r"C:\Windows\Fonts\msyh.ttc"
FONT = ["Microsoft YaHei", "Noto Sans CJK SC", "SimHei", "Arial", "DejaVu Sans"]
MONO = ["Consolas", "DejaVu Sans Mono", "monospace"]


def setup() -> None:
    if Path(FONT_PATH).exists():
        font_manager.fontManager.addfont(FONT_PATH)
    sns.set_theme(style="whitegrid")
    mpl.rcParams.update({
        "figure.facecolor": TOKENS["surface"],
        "savefig.facecolor": TOKENS["surface"],
        "axes.facecolor": TOKENS["panel"],
        "axes.edgecolor": TOKENS["axis"],
        "axes.labelcolor": TOKENS["ink"],
        "xtick.color": TOKENS["muted"],
        "ytick.color": TOKENS["muted"],
        "text.color": TOKENS["ink"],
        "font.family": "Microsoft YaHei",
        "font.sans-serif": ["Microsoft YaHei"],
        "font.monospace": MONO,
        "axes.grid": True,
        "grid.color": TOKENS["grid"],
        "grid.linewidth": 0.8,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.titleweight": "semibold",
        "savefig.dpi": 300,
    })


def header(fig, ax, title: str, subtitle: str) -> None:
    ax.set_title("")
    fig.subplots_adjust(top=0.79)
    left = ax.get_position().x0
    fig.text(left, 0.965, title, ha="left", va="top", fontsize=13, fontweight="semibold")
    fig.text(left, 0.915, subtitle, ha="left", va="top", fontsize=8.6, color=TOKENS["muted"])


def save(fig, path: Path) -> None:
    fig.savefig(path.with_suffix(".png"), dpi=300, bbox_inches="tight")
    fig.savefig(path.with_suffix(".pdf"), bbox_inches="tight")
    fig.savefig(path.with_suffix(".svg"), bbox_inches="tight")
    plt.close(fig)


def load_eval(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if '"expected"' in line]


def make_training(run: Path, out: Path) -> None:
    state = json.loads((run / "checkpoint-31" / "trainer_state.json").read_text(encoding="utf-8"))
    rows = [r for r in state["log_history"] if "loss" in r]
    steps = [r["step"] for r in rows]
    losses = [r["loss"] for r in rows]
    fig, ax = plt.subplots(figsize=(7.6, 4.6))
    ax.plot(steps, losses, color=BLUE["base"], linewidth=1.7, marker="o", markersize=3.2, markerfacecolor=BLUE["base"], markeredgecolor=BLUE["dark"], markeredgewidth=0.5)
    ax.annotate(f"末步 {losses[-1]:.3f}", xy=(steps[-1], losses[-1]), xytext=(-50, 14), textcoords="offset points", fontsize=8, color=BLUE["dark"], arrowprops={"arrowstyle": "-", "color": BLUE["dark"], "lw": 0.8})
    ax.set_xlabel("优化步", fontsize=9)
    ax.set_ylabel("训练损失（Loss）", fontsize=9)
    ax.set_xlim(0, max(steps) + 1)
    ax.tick_params(labelsize=8)
    ax.grid(axis="y", alpha=0.8)
    ax.grid(axis="x", visible=False)
    header(fig, ax, "Qwen2.5-VL 视觉指令微调的训练损失", "1 个 epoch，31 个优化步；记录来自本次实际训练日志，采用 4-bit QLoRA。")
    save(fig, out / "fig_training_loss_paper")


def make_distribution(stats_path: Path, out: Path) -> None:
    stats = json.loads(stats_path.read_text(encoding="utf-8"))
    labels = ["摔倒", "打架", "聚集", "自杀"]
    keys = ["fall", "fight", "gather", "suicide"]
    train = [stats["train_objects"].get(k, 0) for k in keys]
    val = [stats["val_objects"].get(k, 0) for k in keys]
    x = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(7.6, 4.6))
    width = 0.34
    b1 = ax.bar(x - width / 2, train, width, label="训练集", color=BLUE["base"], edgecolor=BLUE["dark"], linewidth=0.8)
    b2 = ax.bar(x + width / 2, val, width, label="验证集", color=GOLD["base"], edgecolor=GOLD["dark"], linewidth=0.8)
    for bars in (b1, b2):
        for bar in bars:
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2, f"{int(bar.get_height())}", ha="center", va="bottom", fontsize=8, family=MONO)
    ax.set_xticks(x, labels)
    ax.set_ylabel("目标框数量", fontsize=9)
    ax.set_ylim(0, max(train) * 1.18)
    ax.legend(frameon=False, ncol=2, loc="upper right", fontsize=8)
    ax.tick_params(labelsize=8)
    ax.grid(axis="y", alpha=0.8)
    ax.grid(axis="x", visible=False)
    header(fig, ax, "动作风险数据的类别分布", "训练集 244 张、验证集 63 张；统计单位为标注目标框，不是图像数量。")
    save(fig, out / "fig_class_distribution_paper")


def make_risk_accuracy(eval_path: Path, out: Path) -> None:
    rows = load_eval(eval_path)
    keys = ["fight", "suicide", "gather", "fall | fight"]
    labels = ["打架", "自杀", "聚集", "摔倒+打架"]
    total = np.array([sum(r["expected"] == k for r in rows) for k in keys])
    correct = np.array([sum(r["expected"] == k and r["correct"] for r in rows) for k in keys])
    accuracy = np.divide(correct, total, out=np.zeros_like(correct, dtype=float), where=total > 0)
    fig, ax = plt.subplots(figsize=(7.6, 4.6))
    bars = ax.bar(np.arange(len(labels)), accuracy * 100, color=OLIVE["base"], edgecolor=OLIVE["dark"], linewidth=0.8)
    for i, (bar, c, n, a) in enumerate(zip(bars, correct, total, accuracy)):
        ax.text(bar.get_x() + bar.get_width() / 2, min(101, bar.get_height() + 3), f"{c}/{n}\n{a:.1%}", ha="center", va="bottom", fontsize=8, family=MONO)
    ax.set_xticks(np.arange(len(labels)), labels)
    ax.set_ylabel("risk 字段判断准确率（%）", fontsize=9)
    ax.set_ylim(0, 108)
    ax.axhline(87.3, color=TOKENS["ink"], linestyle=(0, (3, 2)), linewidth=0.9)
    ax.text(3.45, 88.8, "总体 55/63 = 87.3%", ha="right", va="bottom", fontsize=8, color=TOKENS["ink"])
    ax.tick_params(labelsize=8)
    ax.grid(axis="y", alpha=0.8)
    ax.grid(axis="x", visible=False)
    header(fig, ax, "验证集风险类别判断结果", "63 张验证图；按完整 risk 字符串统计，组合标签保留为“摔倒+打架”，不构造普通单标签混淆矩阵。")
    save(fig, out / "fig_validation_risk_accuracy_paper")


def parse_answer(sample: dict) -> list[dict]:
    try:
        answer = json.loads(sample["messages"][1]["content"][0]["text"])
        return answer.get("objects", [])
    except Exception:
        return []


def make_samples(data_path: Path, out: Path) -> None:
    samples = [json.loads(line) for line in data_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    wanted = ["fight", "suicide", "gather", "fall"]
    chosen: list[dict] = []
    for key in wanted:
        for sample in samples:
            if key in Path(sample["image"]).stem.lower() or any(obj.get("label") == key for obj in parse_answer(sample)):
                chosen.append(sample)
                break
    fig, axes = plt.subplots(2, 2, figsize=(8.4, 6.8), dpi=300)
    for ax, sample in zip(axes.flat, chosen):
        image_path = Path(sample["image"])
        image = Image.open(image_path).convert("RGB")
        ax.imshow(image)
        width, height = image.size
        for obj in parse_answer(sample):
            x, y, w, h = obj["bbox"]
            rect = Rectangle(((x - w / 2) * width, (y - h / 2) * height), w * width, h * height, fill=False, edgecolor=ORANGE["base"], linewidth=1.4)
            ax.add_patch(rect)
            ax.text((x - w / 2) * width, max(0, (y - h / 2) * height - 3), obj.get("label", ""), fontsize=7, color=ORANGE["dark"], bbox={"facecolor": "white", "alpha": 0.75, "edgecolor": "none", "pad": 1.2})
        ax.set_title(sample["id"], fontsize=8, pad=3)
        ax.axis("off")
    fig.suptitle("验证集代表性样本与人工标注框", x=0.08, ha="left", y=0.98, fontsize=13, fontweight="semibold")
    fig.text(0.08, 0.945, "橙色框为原始 YOLO 标注；该图用于展示数据格式，不代表模型预测结果。", ha="left", va="top", fontsize=8.6, color=TOKENS["muted"])
    fig.subplots_adjust(top=0.90, wspace=0.04, hspace=0.15)
    save(fig, out / "fig_representative_samples_paper")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--stats", type=Path, required=True)
    parser.add_argument("--eval-log", type=Path, required=True)
    parser.add_argument("--val-data", type=Path, required=True)
    args = parser.parse_args()
    setup()
    out = args.run / "paper_figures"
    out.mkdir(parents=True, exist_ok=True)
    make_training(args.run, out)
    make_distribution(args.stats, out)
    make_risk_accuracy(args.eval_log, out)
    make_samples(args.val_data, out)
    print(out)


if __name__ == "__main__":
    main()
