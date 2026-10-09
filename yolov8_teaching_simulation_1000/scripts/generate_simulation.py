"""
Generate 1000-round YOLO teaching simulation data.
All values are formula-generated; no training log is read.
"""
from __future__ import annotations

from pathlib import Path
import argparse
import json
import hashlib
from datetime import date

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

ROOT = Path(__file__).resolve().parents[1]
TAG = "教学模拟数据｜非实测｜公式生成"
DISCLAIMER = "公式仅为课堂示意；模拟数据不可作为真实训练记录或模型性能结论。"

GROUPS = [
    {
        "group_id": "G1",
        "name": "稳定收敛",
        "seed": 20260929,
        "params": {
            "train_loss": {"L_inf": 0.220, "A": 1.550, "k": 0.0105, "noise_start": 0.018, "noise_floor": 0.0030, "phi": 0.93},
            "val_loss": {"L_inf": 0.285, "A": 1.350, "k": 0.0085, "overfit_start": 700, "overfit_amp": 0.055, "overfit_power": 1.35, "noise_start": 0.020, "noise_floor": 0.0035, "phi": 0.92},
            "precision": {"M_inf": 0.940, "B": 0.760, "k": 0.0095, "noise_start": 0.026, "noise_floor": 0.0040, "phi": 0.91},
            "recall": {"M_inf": 0.905, "B": 0.710, "k": 0.0080, "noise_start": 0.029, "noise_floor": 0.0045, "phi": 0.91},
            "mAP": {"M_inf": 0.885, "B": 0.735, "k": 0.0087, "noise_start": 0.025, "noise_floor": 0.0040, "phi": 0.92},
        },
    },
    {
        "group_id": "G2",
        "name": "较快提升",
        "seed": 20261001,
        "params": {
            "train_loss": {"L_inf": 0.205, "A": 1.580, "k": 0.0120, "noise_start": 0.021, "noise_floor": 0.0035, "phi": 0.92},
            "val_loss": {"L_inf": 0.270, "A": 1.390, "k": 0.0100, "overfit_start": 730, "overfit_amp": 0.060, "overfit_power": 1.30, "noise_start": 0.022, "noise_floor": 0.0035, "phi": 0.91},
            "precision": {"M_inf": 0.952, "B": 0.780, "k": 0.0110, "noise_start": 0.029, "noise_floor": 0.0040, "phi": 0.90},
            "recall": {"M_inf": 0.918, "B": 0.735, "k": 0.0098, "noise_start": 0.031, "noise_floor": 0.0045, "phi": 0.90},
            "mAP": {"M_inf": 0.900, "B": 0.755, "k": 0.0102, "noise_start": 0.028, "noise_floor": 0.0040, "phi": 0.91},
        },
    },
    {
        "group_id": "G3",
        "name": "波动稍大",
        "seed": 20261003,
        "params": {
            "train_loss": {"L_inf": 0.235, "A": 1.500, "k": 0.0098, "noise_start": 0.026, "noise_floor": 0.0040, "phi": 0.90},
            "val_loss": {"L_inf": 0.300, "A": 1.320, "k": 0.0078, "overfit_start": 680, "overfit_amp": 0.050, "overfit_power": 1.40, "noise_start": 0.026, "noise_floor": 0.0040, "phi": 0.90},
            "precision": {"M_inf": 0.928, "B": 0.745, "k": 0.0088, "noise_start": 0.034, "noise_floor": 0.0050, "phi": 0.89},
            "recall": {"M_inf": 0.892, "B": 0.700, "k": 0.0074, "noise_start": 0.036, "noise_floor": 0.0055, "phi": 0.89},
            "mAP": {"M_inf": 0.870, "B": 0.720, "k": 0.0079, "noise_start": 0.033, "noise_floor": 0.0050, "phi": 0.90},
        },
    },
]

METRICS = ["train_loss", "val_loss", "precision", "recall", "mAP"]
METRIC_LABELS = {
    "train_loss": "Train loss",
    "val_loss": "Validation loss",
    "precision": "Precision",
    "recall": "Recall",
    "mAP": "mAP",
}
COLORS = {"G1": "#2563eb", "G2": "#dc2626", "G3": "#059669"}


def ar1_noise(rng: np.random.Generator, n: int, phi: float) -> np.ndarray:
    """Stationary AR(1) process with unit marginal variance."""
    z = np.zeros(n, dtype=float)
    z[0] = rng.normal()
    innovation_scale = np.sqrt(max(1.0 - phi * phi, 1e-9))
    for i in range(1, n):
        z[i] = phi * z[i - 1] + innovation_scale * rng.normal()
    return z


def amplitude_schedule(e: np.ndarray, start: float, floor: float) -> np.ndarray:
    # Early rounds have larger variation; a nonzero floor keeps late rounds visibly non-flat.
    return floor + (start - floor) * np.exp(-(e - 1.0) / 260.0)


def simulate_metric(e: np.ndarray, metric: str, spec: dict, rng: np.random.Generator) -> np.ndarray:
    if metric in {"train_loss", "val_loss"}:
        base = spec["L_inf"] + spec["A"] * np.exp(-spec["k"] * e)
        if metric == "val_loss":
            after = np.maximum(e - spec["overfit_start"], 0.0)
            span = max(1000.0 - spec["overfit_start"], 1.0)
            base = base + spec["overfit_amp"] * (after / span) ** spec["overfit_power"]
    else:
        base = spec["M_inf"] - spec["B"] * np.exp(-spec["k"] * e)
    noise = amplitude_schedule(e, spec["noise_start"], spec["noise_floor"]) * ar1_noise(rng, len(e), spec["phi"])
    values = base + noise
    if metric in {"precision", "recall", "mAP"}:
        values = np.clip(values, 0.0, 1.0)
    return values


def csv_header(group: dict) -> str:
    payload = {
        "metadata_tag": TAG,
        "group_id": group["group_id"],
        "group_name": group["name"],
        "seed": group["seed"],
        "rounds": 1000,
        "formula_note": "Loss: L_inf + A*exp(-k*e); metrics: M_inf - B*exp(-k*e); validation loss adds a small smooth post-plateau rise; fluctuations are seeded AR(1)-style correlated noise.",
        "disclaimer": DISCLAIMER,
    }
    return "\n".join([f"# {TAG}", f"# {json.dumps(payload, ensure_ascii=False)}", "# Values are formula-generated teaching data; no training log was read.", "# Columns: epoch, train_loss, val_loss, precision, recall, mAP, group_id, group_name"]) + "\n"


def build_data() -> tuple[pd.DataFrame, dict]:
    epochs = np.arange(1, 1001, dtype=int)
    frames = []
    for group in GROUPS:
        rng = np.random.default_rng(group["seed"])
        data = {"epoch": epochs}
        for metric in METRICS:
            data[metric] = simulate_metric(epochs.astype(float), metric, group["params"][metric], rng)
        data["group_id"] = group["group_id"]
        data["group_name"] = group["name"]
        frames.append(pd.DataFrame(data))
    return pd.concat(frames, ignore_index=True), {g["group_id"]: g for g in GROUPS}


def write_outputs(df: pd.DataFrame, groups: dict, out_dir: Path) -> None:
    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    for gid, group in groups.items():
        sub = df[df["group_id"] == gid].copy()
        path = data_dir / f"yolo_1000_rounds_{gid}.csv"
        path.write_text(csv_header(group), encoding="utf-8-sig")
        sub.to_csv(path, mode="a", index=False, float_format="%.8f", encoding="utf-8-sig")
    combined_path = data_dir / "yolo_1000_rounds_all_groups.csv"
    combined_meta = {
        "metadata_tag": TAG,
        "groups": [{"group_id": g["group_id"], "name": g["name"], "seed": g["seed"]} for g in groups.values()],
        "rounds_per_group": 1000,
        "total_rows": int(len(df)),
        "disclaimer": DISCLAIMER,
    }
    combined_path.write_text("\n".join([f"# {TAG}", f"# {json.dumps(combined_meta, ensure_ascii=False)}", "# Values are formula-generated teaching data; no training log was read."]) + "\n", encoding="utf-8-sig")
    df.to_csv(combined_path, mode="a", index=False, float_format="%.8f", encoding="utf-8-sig")

    metadata_rows = [
        {"key": "metadata_tag", "value": TAG},
        {"key": "data_type", "value": "formula-generated teaching simulation"},
        {"key": "training_log_source", "value": "none; no real training log read"},
        {"key": "rounds_per_group", "value": "1000"},
        {"key": "groups", "value": "G1, G2, G3"},
        {"key": "formula_loss", "value": "L(e) = L_inf + A*exp(-k*e)"},
        {"key": "formula_metrics", "value": "M(e) = M_inf - B*exp(-k*e)"},
        {"key": "validation_loss_extension", "value": "small smooth post-plateau rise for classroom overfitting illustration only"},
        {"key": "correlated_fluctuation", "value": "seeded AR(1)-style process with decaying amplitude and nonzero late floor"},
        {"key": "disclaimer", "value": DISCLAIMER},
    ]
    for g in groups.values():
        metadata_rows.append({"key": f"{g['group_id']}_seed", "value": str(g["seed"])})
        metadata_rows.append({"key": f"{g['group_id']}_parameters_json", "value": json.dumps(g["params"], ensure_ascii=False, separators=(",", ":"))})
    pd.DataFrame(metadata_rows).to_csv(data_dir / "metadata.csv", index=False, encoding="utf-8-sig")
    (data_dir / "parameters.json").write_text(json.dumps({"metadata_tag": TAG, "groups": list(groups.values()), "disclaimer": DISCLAIMER}, ensure_ascii=False, indent=2), encoding="utf-8")


def plot_data(df: pd.DataFrame, groups: dict, out_dir: Path) -> Path:
    plt.rcParams.update({"font.family": "Microsoft YaHei", "axes.unicode_minus": False})
    fig, axes = plt.subplots(2, 5, figsize=(21, 9.5), constrained_layout=False)
    fig.subplots_adjust(left=0.055, right=0.985, top=0.79, bottom=0.13, wspace=0.24, hspace=0.34)
    fig.suptitle(f"YOLO 1000轮指标教学模拟｜{TAG}", fontsize=18, fontweight="bold", y=0.965)
    fig.text(0.5, 0.925, "公式示意；波动为固定随机种子生成的连续相关过程；不可作为真实训练记录或模型性能结论", ha="center", va="center", fontsize=10.5, color="#7f1d1d")
    fig.text(0.5, 0.052, TAG, ha="center", va="center", fontsize=11, color="#991b1b", fontweight="bold",
             bbox={"boxstyle": "round,pad=0.35", "facecolor": "#fef2f2", "edgecolor": "#ef4444", "linewidth": 1.2})
    fig.text(0.012, 0.72, "全程\n1–1000轮", rotation=90, ha="center", va="center", fontsize=11, fontweight="bold", color="#334155")
    fig.text(0.012, 0.30, "后期放大\n700–1000轮", rotation=90, ha="center", va="center", fontsize=11, fontweight="bold", color="#334155")

    for col, metric in enumerate(METRICS):
        for row, (xlim, title_suffix) in enumerate([((1, 1000), "全程"), ((700, 1000), "后期放大")]):
            ax = axes[row, col]
            for gid, group in groups.items():
                sub = df[df["group_id"] == gid]
                ax.plot(sub["epoch"], sub[metric], lw=1.35 if row == 0 else 1.55, color=COLORS[gid], alpha=0.92, label=f"{gid} {group['name']} (seed={group['seed']})")
            ax.set_xlim(*xlim)
            ax.set_title(f"{METRIC_LABELS[metric]} · {title_suffix}", fontsize=11, pad=7)
            ax.set_xlabel("epoch", fontsize=9)
            ax.grid(True, alpha=0.23, linewidth=0.7)
            ax.tick_params(labelsize=8.5)
            if metric in {"precision", "recall", "mAP"}:
                ax.set_ylim(0, 1)
                ax.set_ylabel("score", fontsize=9)
                ax.set_yticks(np.linspace(0, 1, 6))
            else:
                y_min = float(df[metric].min())
                y_max = float(df[metric].max())
                pad = 0.07 * (y_max - y_min)
                ax.set_ylim(max(0, y_min - pad), y_max + pad)
                ax.set_ylabel("loss", fontsize=9)
            if metric == "val_loss":
                for group in groups.values():
                    if row == 0:
                        ax.axvline(group["params"][metric]["overfit_start"], color=COLORS[group["group_id"]], ls="--", lw=0.7, alpha=0.38)
                if row == 0:
                    ax.text(0.98, 0.07, "小幅后期上升项\n课堂过拟合示意", transform=ax.transAxes, ha="right", va="bottom", fontsize=8, color="#7f1d1d")
    handles = [Line2D([0], [0], color=COLORS[g["group_id"]], lw=2, label=f"{g['group_id']} {g['name']} · seed={g['seed']}") for g in groups.values()]
    fig.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, 0.855), ncol=3, fontsize=9.2, frameon=False)
    fig_path = out_dir / "figures" / "yolo_1000_rounds_2x5_metrics.png"
    fig.savefig(fig_path, dpi=300, facecolor="white")
    fig.savefig(out_dir / "figures" / "yolo_1000_rounds_2x5_metrics.pdf", facecolor="white")
    plt.close(fig)
    return fig_path


def write_readme(df: pd.DataFrame, groups: dict, out_dir: Path, fig_path: Path) -> None:
    lines = [
        f"# YOLO 1000轮指标教学模拟数据｜{TAG}",
        "",
        "本目录包含 3 组、每组 1000 轮的可复现教学模拟轨迹。所有数值由明确公式与固定随机种子生成；脚本不读取训练日志，也不声称这些数值来自真实训练。",
        "",
        "## 文件",
        "",
        f"- `{fig_path.relative_to(out_dir).as_posix()}`：两行五列指标图。第一行是 1–1000 轮全程，第二行放大 700–1000 轮。",
        "- `data/yolo_1000_rounds_G1.csv`、`G2.csv`、`G3.csv`：各组 1000 行数据；文件开头的注释行包含 CSV 元数据。",
        "- `data/yolo_1000_rounds_all_groups.csv`：3000 行合并数据。",
        "- `data/metadata.csv`：元数据键值表；`data/parameters.json`：完整参数。",
        "- `scripts/generate_simulation.py`：生成脚本，可重复运行。",
        "",
        "## 公式",
        "",
        "对第 e 轮（e=1,…,1000），基础损失为 `L(e) = L∞ + A·exp(-k·e)`；Precision、Recall、mAP 的基础趋势为 `M(e) = M∞ - B·exp(-k·e)`。验证损失额外加入 `overfit_amp·((max(e−e0,0))/(1000−e0))^p` 的小幅、平滑后期上升项，仅用于课堂说明可能的过拟合现象。",
        "",
        "每条轨迹叠加固定随机种子生成的 AR(1) 连续相关波动；波动幅度随轮次减小但保留非零后期下限，因此 300 轮后仍可见连续小幅起伏，而不是独立白噪声或人为尖峰。Precision、Recall、mAP 最后裁剪到 0–1。",
        "",
        "## 3组参数与种子",
        "",
        "| 组 | 名称 | seed | 说明 |",
        "|---|---|---:|---|",
        *[f"| {g['group_id']} | {g['name']} | {g['seed']} | 参数见 `data/parameters.json` |" for g in groups.values()],
        "",
        f"**{TAG}**。{DISCLAIMER}",
        "",
        "生成日期：2026-09-29（Asia/Shanghai）。",
    ]
    (out_dir / "说明.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT)
    args = parser.parse_args()
    out_dir = args.out.resolve()
    df, groups = build_data()
    write_outputs(df, groups, out_dir)
    fig_path = plot_data(df, groups, out_dir)
    write_readme(df, groups, out_dir, fig_path)
    manifest = {
        "metadata_tag": TAG,
        "generated_on": "2026-09-29",
        "rows": int(len(df)),
        "rounds_per_group": 1000,
        "figure": str(fig_path.relative_to(out_dir)),
        "sha256": hashlib.sha256(fig_path.read_bytes()).hexdigest(),
        "disclaimer": DISCLAIMER,
    }
    (out_dir / "生成清单.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()


