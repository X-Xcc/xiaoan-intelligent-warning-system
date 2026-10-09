"""Generate a companion YOLO dataset-statistics figure.

The source project contains formula-generated teaching data rather than a real
training log.  This figure follows the attached four-panel layout and keeps
that same reproducible, explicitly simulated character.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Rectangle


ROOT = Path(__file__).resolve().parents[1]
SEED = 20260929
TAG = "教学模拟数据｜非实测｜公式生成"
SCENARIO_IMAGES = 42000
SYNTHETIC_SCENES = 4200
BASE_SCENE_COUNTS = np.array([933, 2439, 51, 777], dtype=int)
COUNTS = BASE_SCENE_COUNTS * (SCENARIO_IMAGES // SYNTHETIC_SCENES)
CLASS_NAMES = ["fall", "fight", "gather", "suicide"]
BAR_COLORS = ["#3430f0", "#4bc9d9", "#dbe4fa", "#4fd0b3"]
BOX_COLORS = ["#3635ee", "#45c8d6", "#63d7c1", "#77dfe4"]


def _clip(a: np.ndarray) -> np.ndarray:
    return np.clip(a, 0.02, 0.98)


def make_points(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Create normalized centers and width/height values for four classes."""
    centers = np.array([
        [0.52, 0.49],  # broad, low cluster
        [0.58, 0.74],  # upper cluster
        [0.66, 0.61],  # single rare sample
        [0.56, 0.50],  # second broad cluster
    ])
    spreads = np.array([
        [0.075, 0.018],
        [0.055, 0.060],
        [0.001, 0.001],
        [0.100, 0.050],
    ])
    centers_xy: list[np.ndarray] = []
    widths: list[np.ndarray] = []
    heights: list[np.ndarray] = []
    labels: list[np.ndarray] = []
    # Keep the scatter panels readable while the bars represent the full
    # nominal 42,000-image scenario.
    plot_counts = np.maximum(1, np.rint(COUNTS / SCENARIO_IMAGES * 900).astype(int))
    for idx, n in enumerate(plot_counts):
        xy = rng.normal(centers[idx], spreads[idx], size=(n, 2))
        xy = _clip(xy)
        if idx == 0:
            wh = np.column_stack([rng.normal(0.23, 0.095, n), rng.normal(0.12, 0.040, n)])
        elif idx == 1:
            wh = np.column_stack([rng.normal(0.16, 0.070, n), rng.normal(0.24, 0.075, n)])
        elif idx == 2:
            wh = np.tile(np.array([[0.22, 0.55]]), (n, 1))
        else:
            wh = np.column_stack([rng.normal(0.30, 0.120, n), rng.normal(0.18, 0.065, n)])
        wh = np.clip(wh, 0.025, 0.72)
        # Keep every box inside the normalized image area.
        wh[:, 0] = np.minimum(wh[:, 0], 2 * np.minimum(xy[:, 0], 1 - xy[:, 0]) - 0.01)
        wh[:, 1] = np.minimum(wh[:, 1], 2 * np.minimum(xy[:, 1], 1 - xy[:, 1]) - 0.01)
        wh = np.clip(wh, 0.02, 0.72)
        centers_xy.append(xy)
        widths.append(wh[:, 0])
        heights.append(wh[:, 1])
        labels.append(np.full(n, idx, dtype=int))
    return np.vstack(centers_xy), np.concatenate(widths), np.concatenate(heights), np.concatenate(labels)


def style_axes(ax: plt.Axes) -> None:
    ax.set_facecolor("white")
    ax.tick_params(axis="both", labelsize=7, length=2, width=0.6, colors="#111827")
    for spine in ax.spines.values():
        spine.set_color("#e5e7eb")
        spine.set_linewidth(0.6)


def make_overlay_boxes(rng: np.random.Generator) -> list[tuple[float, float, float, float, int]]:
    """Create the layered horizontal/vertical box overlay in the reference."""
    boxes: list[tuple[float, float, float, float, int]] = []
    modes = [
        (0.54, 0.52, 0.66, 0.23, 24, 1),
        (0.57, 0.52, 0.25, 0.78, 20, 0),
        (0.53, 0.50, 0.74, 0.18, 23, 2),
        (0.56, 0.54, 0.31, 0.70, 19, 3),
    ]
    for cx, cy, w_mean, h_mean, count, class_id in modes:
        for _ in range(count):
            x, y = rng.normal([cx, cy], [0.055, 0.045])
            w = abs(rng.normal(w_mean, 0.09 if w_mean > h_mean else 0.045))
            h = abs(rng.normal(h_mean, 0.055 if w_mean > h_mean else 0.09))
            w = min(w, 2 * min(x, 1 - x) - 0.015)
            h = min(h, 2 * min(y, 1 - y) - 0.015)
            boxes.append((x, y, max(0.03, w), max(0.03, h), class_id))
    return boxes


def plot_figure(out_dir: Path) -> Path:
    rng = np.random.default_rng(SEED)
    xy, widths, heights, labels = make_points(rng)
    overlay_boxes = make_overlay_boxes(rng)

    plt.rcParams.update({
        "font.family": "DejaVu Sans",
        "axes.unicode_minus": False,
        "xtick.direction": "out",
        "ytick.direction": "out",
    })
    fig, axes = plt.subplots(2, 2, figsize=(4.0, 4.0), dpi=300)
    fig.subplots_adjust(left=0.14, right=0.98, bottom=0.13, top=0.98, wspace=0.34, hspace=0.42)

    # Upper-left: class counts.
    ax = axes[0, 0]
    style_axes(ax)
    bars = ax.bar(np.arange(4), COUNTS, color=BAR_COLORS, width=0.72, edgecolor="none")
    ax.set_ylabel("images", fontsize=7)
    ax.set_xticks(np.arange(4), CLASS_NAMES, rotation=90, fontsize=6.5)
    ax.set_ylim(0, 27000)
    ax.set_yticks([0, 5000, 10000, 15000, 20000, 25000])
    ax.set_yticklabels(["0", "5k", "10k", "15k", "20k", "25k"])
    ax.grid(axis="y", color="#e5e7eb", linewidth=0.45, alpha=0.55)
    ax.set_axisbelow(True)
    for bar, count in zip(bars, COUNTS):
        ax.text(bar.get_x() + bar.get_width() / 2, count + 2, str(int(count)),
                ha="center", va="bottom", fontsize=6.5, color="#111827")

    # Upper-right: normalized bounding-box distribution.
    ax = axes[0, 1]
    style_axes(ax)
    for x, y, w, h, class_id in overlay_boxes:
        ax.add_patch(Rectangle((x - w / 2, y - h / 2), w, h,
                               fill=False, edgecolor=BOX_COLORS[class_id],
                               linewidth=0.65 if class_id else 0.85,
                               alpha=0.22 if class_id else 0.38))
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_aspect("equal", adjustable="box")

    # Lower-left: centers.
    ax = axes[1, 0]
    style_axes(ax)
    ax.scatter(xy[:, 0], xy[:, 1], s=4, c="#4b5cf2", alpha=0.14, linewidths=0)
    ax.scatter(xy[:, 0], xy[:, 1], s=2.2, c="#3842e8", alpha=0.16, linewidths=0)
    ax.set_xlabel("x", fontsize=7)
    ax.set_ylabel("y", fontsize=7)
    ax.set_xlim(0.35, 0.78)
    ax.set_ylim(0.38, 0.84)
    ax.set_xticks([0.4, 0.5, 0.6, 0.7])
    ax.set_yticks([0.4, 0.5, 0.6, 0.7, 0.8])
    ax.grid(False)

    # Lower-right: width/height distribution.
    ax = axes[1, 1]
    style_axes(ax)
    ax.scatter(widths, heights, s=4, c="#4b5cf2", alpha=0.14, linewidths=0)
    ax.scatter(widths, heights, s=2.2, c="#3842e8", alpha=0.16, linewidths=0)
    ax.set_xlabel("width", fontsize=7)
    ax.set_ylabel("height", fontsize=7)
    ax.set_xlim(0.02, 0.75)
    ax.set_ylim(0.02, 0.78)
    ax.set_xticks([0.2, 0.4, 0.6])
    ax.set_yticks([0.2, 0.4, 0.6, 0.8])
    ax.grid(False)

    fig_path = out_dir / "figures" / "yolo_1000_rounds_companion_stats.png"
    fig_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(fig_path, dpi=300, facecolor="white")
    fig.savefig(fig_path.with_suffix(".pdf"), facecolor="white")
    plt.close(fig)
    return fig_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT)
    args = parser.parse_args()
    out_dir = args.out.resolve()
    fig_path = plot_figure(out_dir)
    manifest = {
        "metadata_tag": TAG,
        "seed": SEED,
        "scenario_images": SCENARIO_IMAGES,
        "synthetic_scenes": SYNTHETIC_SCENES,
        "base_scene_counts": BASE_SCENE_COUNTS.tolist(),
        "class_names": CLASS_NAMES,
        "class_counts": COUNTS.tolist(),
        "figure": str(fig_path.relative_to(out_dir)),
        "sha256": hashlib.sha256(fig_path.read_bytes()).hexdigest(),
        "disclaimer": "42,000张图像是名义模拟场景；图中统计不可作为真实数据集统计或模型性能结论。",
    }
    (out_dir / "生成清单_配套统计图.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "说明_配套统计图.md").write_text(
        "# YOLO 1000轮配套统计图\n\n"
        "图中四个面板分别表示类别图像数量、归一化框分布、目标中心点和目标宽高分布。"
        "类别数量沿用此前 4,200 个代理场景的比例，并扩展到名义 42,000 张图像；散点和框为固定随机种子生成的可视化抽样，未生成真实图像。\n\n"
        f"固定种子：`{SEED}`；名义场景图像数：`{SCENARIO_IMAGES}`；类别计数：`{COUNTS.tolist()}`。\n\n"
        f"**{TAG}**。42,000 张图像是模拟场景设定，不是本地真实独立图像数量。\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
