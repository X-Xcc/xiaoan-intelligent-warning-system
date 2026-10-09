"""Generate ten-metric, 1000-round YOLO teaching simulation data.
All values are formula-generated; no training log or attached image is read as data.
"""
from __future__ import annotations

from pathlib import Path
import argparse
import hashlib
import json

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

ROOT = Path(__file__).resolve().parents[1]
TAG = "教学模拟数据｜非实测｜公式生成"
DISCLAIMER = "公式仅为课堂示意；模拟数据不可作为真实训练记录或模型性能结论。"

# The ten columns follow the requested 2x5 layout.
METRICS = [
    "train_box_loss", "train_cls_loss", "train_dfl_loss", "precision", "recall",
    "val_box_loss", "val_cls_loss", "val_dfl_loss", "mAP50", "mAP50_95",
]
TITLES = {
    "train_box_loss": "训练 / 定位损失",
    "train_cls_loss": "训练 / 分类损失",
    "train_dfl_loss": "训练 / 分布焦点损失",
    "precision": "精确度",
    "recall": "召回率",
    "val_box_loss": "验证 / 定位损失",
    "val_cls_loss": "验证 / 分类损失",
    "val_dfl_loss": "验证 / 分布焦点损失",
    "mAP50": "mAP@0.5",
    "mAP50_95": "mAP@0.5:0.95",
}
LOSS_METRICS = set(METRICS[:3] + METRICS[5:8])
SCORE_METRICS = set(METRICS[3:5] + METRICS[8:10])
COLORS = {"G1": "#2563eb", "G2": "#dc2626", "G3": "#059669"}

# Each group has independent formula parameters; the seed only controls correlated variation.
GROUPS = [
    {
        "group_id": "G1", "name": "稳定收敛", "seed": 20260929,
        "params": {
            "train_box_loss": {"L_inf": .255, "A": 1.70, "k": .0105, "noise_start": .030, "noise_floor": .0040, "phi": .92},
            "train_cls_loss": {"L_inf": .235, "A": 2.75, "k": .0130, "noise_start": .045, "noise_floor": .0050, "phi": .91},
            "train_dfl_loss": {"L_inf": .835, "A": .690, "k": .0086, "noise_start": .016, "noise_floor": .0025, "phi": .93},
            "precision": {"M_inf": .885, "B": .555, "k": .0102, "noise_start": .030, "noise_floor": .0040, "phi": .90},
            "recall": {"M_inf": .815, "B": .665, "k": .0090, "noise_start": .032, "noise_floor": .0045, "phi": .90},
            "val_box_loss": {"L_inf": .390, "A": 1.55, "k": .0088, "overfit_start": 720, "overfit_amp": .055, "overfit_power": 1.35, "noise_start": .032, "noise_floor": .0040, "phi": .91},
            "val_cls_loss": {"L_inf": .365, "A": 2.55, "k": .0105, "overfit_start": 730, "overfit_amp": .050, "overfit_power": 1.30, "noise_start": .048, "noise_floor": .0050, "phi": .90},
            "val_dfl_loss": {"L_inf": .995, "A": .650, "k": .0078, "overfit_start": 720, "overfit_amp": .035, "overfit_power": 1.35, "noise_start": .018, "noise_floor": .0028, "phi": .92},
            "mAP50": {"M_inf": .835, "B": .685, "k": .0097, "noise_start": .034, "noise_floor": .0045, "phi": .90},
            "mAP50_95": {"M_inf": .630, "B": .665, "k": .0088, "noise_start": .030, "noise_floor": .0040, "phi": .91},
        },
    },
    {
        "group_id": "G2", "name": "较快提升", "seed": 20261001,
        "params": {
            "train_box_loss": {"L_inf": .240, "A": 1.72, "k": .0120, "noise_start": .034, "noise_floor": .0040, "phi": .91},
            "train_cls_loss": {"L_inf": .220, "A": 2.80, "k": .0145, "noise_start": .050, "noise_floor": .0050, "phi": .90},
            "train_dfl_loss": {"L_inf": .820, "A": .705, "k": .0095, "noise_start": .018, "noise_floor": .0025, "phi": .92},
            "precision": {"M_inf": .900, "B": .565, "k": .0116, "noise_start": .033, "noise_floor": .0040, "phi": .89},
            "recall": {"M_inf": .830, "B": .680, "k": .0100, "noise_start": .035, "noise_floor": .0045, "phi": .89},
            "val_box_loss": {"L_inf": .375, "A": 1.60, "k": .0102, "overfit_start": 750, "overfit_amp": .060, "overfit_power": 1.30, "noise_start": .035, "noise_floor": .0040, "phi": .90},
            "val_cls_loss": {"L_inf": .350, "A": 2.60, "k": .0120, "overfit_start": 745, "overfit_amp": .055, "overfit_power": 1.30, "noise_start": .052, "noise_floor": .0050, "phi": .89},
            "val_dfl_loss": {"L_inf": .980, "A": .660, "k": .0088, "overfit_start": 750, "overfit_amp": .040, "overfit_power": 1.30, "noise_start": .020, "noise_floor": .0028, "phi": .91},
            "mAP50": {"M_inf": .850, "B": .700, "k": .0110, "noise_start": .036, "noise_floor": .0045, "phi": .89},
            "mAP50_95": {"M_inf": .650, "B": .680, "k": .0098, "noise_start": .032, "noise_floor": .0040, "phi": .90},
        },
    },
    {
        "group_id": "G3", "name": "波动稍大", "seed": 20261003,
        "params": {
            "train_box_loss": {"L_inf": .275, "A": 1.62, "k": .0098, "noise_start": .040, "noise_floor": .0050, "phi": .89},
            "train_cls_loss": {"L_inf": .250, "A": 2.65, "k": .0120, "noise_start": .060, "noise_floor": .0060, "phi": .88},
            "train_dfl_loss": {"L_inf": .850, "A": .670, "k": .0080, "noise_start": .021, "noise_floor": .0030, "phi": .90},
            "precision": {"M_inf": .875, "B": .550, "k": .0092, "noise_start": .042, "noise_floor": .0050, "phi": .88},
            "recall": {"M_inf": .805, "B": .650, "k": .0082, "noise_start": .044, "noise_floor": .0055, "phi": .88},
            "val_box_loss": {"L_inf": .410, "A": 1.48, "k": .0078, "overfit_start": 690, "overfit_amp": .050, "overfit_power": 1.40, "noise_start": .040, "noise_floor": .0050, "phi": .89},
            "val_cls_loss": {"L_inf": .390, "A": 2.48, "k": .0095, "overfit_start": 690, "overfit_amp": .048, "overfit_power": 1.35, "noise_start": .058, "noise_floor": .0060, "phi": .88},
            "val_dfl_loss": {"L_inf": 1.010, "A": .630, "k": .0072, "overfit_start": 690, "overfit_amp": .032, "overfit_power": 1.40, "noise_start": .022, "noise_floor": .0030, "phi": .89},
            "mAP50": {"M_inf": .820, "B": .675, "k": .0087, "noise_start": .044, "noise_floor": .0050, "phi": .88},
            "mAP50_95": {"M_inf": .615, "B": .650, "k": .0078, "noise_start": .038, "noise_floor": .0045, "phi": .89},
        },
    },
]


def ar1_noise(rng: np.random.Generator, n: int, phi: float) -> np.ndarray:
    x = np.zeros(n, dtype=float)
    x[0] = rng.normal()
    scale = np.sqrt(max(1.0 - phi * phi, 1e-9))
    for i in range(1, n):
        x[i] = phi * x[i - 1] + scale * rng.normal()
    return x


def amp_schedule(e: np.ndarray, start: float, floor: float) -> np.ndarray:
    return floor + (start - floor) * np.exp(-(e - 1.0) / 260.0)


def simulate(e: np.ndarray, metric: str, spec: dict, rng: np.random.Generator) -> np.ndarray:
    if metric in LOSS_METRICS:
        base = spec["L_inf"] + spec["A"] * np.exp(-spec["k"] * e)
        if metric.startswith("val_"):
            after = np.maximum(e - spec["overfit_start"], 0.0)
            span = max(1000.0 - spec["overfit_start"], 1.0)
            base = base + spec["overfit_amp"] * (after / span) ** spec["overfit_power"]
    else:
        base = spec["M_inf"] - spec["B"] * np.exp(-spec["k"] * e)
    values = base + amp_schedule(e, spec["noise_start"], spec["noise_floor"]) * ar1_noise(rng, len(e), spec["phi"])
    if metric in SCORE_METRICS:
        values = np.clip(values, 0.0, 1.0)
    return values


def csv_header(group: dict) -> str:
    payload = {
        "metadata_tag": TAG,
        "group_id": group["group_id"], "group_name": group["name"], "seed": group["seed"],
        "rounds": 1000, "metric_count": 10,
        "formula_note": "Losses use L_inf + A*exp(-k*e); Precision/Recall/mAP use M_inf - B*exp(-k*e); validation losses add a small smooth post-plateau rise; all fluctuations are seeded AR(1)-style correlated noise.",
        "disclaimer": DISCLAIMER,
    }
    return "\n".join([
        f"# {TAG}", f"# {json.dumps(payload, ensure_ascii=False)}",
        "# Values are formula-generated teaching data; no training log was read.",
        "# Ten metrics: train_box_loss, train_cls_loss, train_dfl_loss, precision, recall, val_box_loss, val_cls_loss, val_dfl_loss, mAP50, mAP50_95",
    ]) + "\n"


def build_data() -> tuple[pd.DataFrame, dict]:
    epochs = np.arange(1, 1001, dtype=int)
    frames = []
    for group in GROUPS:
        rng = np.random.default_rng(group["seed"])
        data = {"epoch": epochs}
        for metric in METRICS:
            data[metric] = simulate(epochs.astype(float), metric, group["params"][metric], rng)
        data["group_id"] = group["group_id"]
        data["group_name"] = group["name"]
        frames.append(pd.DataFrame(data))
    return pd.concat(frames, ignore_index=True), {g["group_id"]: g for g in GROUPS}


def write_outputs(df: pd.DataFrame, groups: dict, out_dir: Path) -> None:
    data_dir = out_dir / "data_10_metrics"
    data_dir.mkdir(parents=True, exist_ok=True)
    for gid, group in groups.items():
        sub = df[df["group_id"] == gid].copy()
        path = data_dir / f"yolo_1000_rounds_10_metrics_{gid}.csv"
        path.write_text(csv_header(group), encoding="utf-8-sig")
        sub.to_csv(path, mode="a", index=False, float_format="%.8f", encoding="utf-8-sig")
    combined_path = data_dir / "yolo_1000_rounds_10_metrics_all_groups.csv"
    combined_meta = {"metadata_tag": TAG, "metric_count": 10, "rounds_per_group": 1000, "groups": [{"group_id": g["group_id"], "name": g["name"], "seed": g["seed"]} for g in groups.values()], "disclaimer": DISCLAIMER}
    combined_path.write_text("\n".join([f"# {TAG}", f"# {json.dumps(combined_meta, ensure_ascii=False)}", "# Values are formula-generated teaching data; no training log was read."]) + "\n", encoding="utf-8-sig")
    df.to_csv(combined_path, mode="a", index=False, float_format="%.8f", encoding="utf-8-sig")

    rows = [
        {"key": "metadata_tag", "value": TAG}, {"key": "metric_count", "value": "10"},
        {"key": "training_log_source", "value": "none; no real training log read"}, {"key": "rounds_per_group", "value": "1000"},
        {"key": "formula_losses", "value": "L(e) = L_inf + A*exp(-k*e)"}, {"key": "formula_scores", "value": "M(e) = M_inf - B*exp(-k*e)"},
        {"key": "validation_loss_extension", "value": "small smooth post-plateau rise for classroom overfitting illustration only"},
        {"key": "correlated_fluctuation", "value": "seeded AR(1)-style process with decaying amplitude and nonzero late floor"}, {"key": "disclaimer", "value": DISCLAIMER},
    ]
    for g in groups.values():
        rows.append({"key": f"{g['group_id']}_seed", "value": str(g["seed"])})
        rows.append({"key": f"{g['group_id']}_parameters_json", "value": json.dumps(g["params"], ensure_ascii=False, separators=(",", ":"))})
    pd.DataFrame(rows).to_csv(data_dir / "metadata.csv", index=False, encoding="utf-8-sig")
    (data_dir / "parameters.json").write_text(json.dumps({"metadata_tag": TAG, "metric_order": METRICS, "groups": list(groups.values()), "disclaimer": DISCLAIMER}, ensure_ascii=False, indent=2), encoding="utf-8")


def plot_data(df: pd.DataFrame, groups: dict, out_dir: Path) -> Path:
    plt.rcParams.update({"font.family": "Microsoft YaHei", "axes.unicode_minus": False})
    fig, axes = plt.subplots(2, 5, figsize=(20, 9), constrained_layout=False)
    fig.subplots_adjust(left=0.055, right=0.985, top=0.78, bottom=0.12, wspace=0.27, hspace=0.38)
    fig.suptitle(f"YOLO 1000轮十项指标教学模拟｜{TAG}", fontsize=18, fontweight="bold", y=0.965)
    fig.text(0.5, 0.925, "按附件十项指标排布；公式示意；波动为固定随机种子生成的连续相关过程；不可作为真实训练记录或模型性能结论", ha="center", va="center", fontsize=10.5, color="#7f1d1d")
    fig.text(0.5, 0.045, TAG, ha="center", va="center", fontsize=11, color="#991b1b", fontweight="bold", bbox={"boxstyle": "round,pad=0.35", "facecolor": "#fef2f2", "edgecolor": "#ef4444", "linewidth": 1.2})
    fig.text(0.012, 0.69, "训练", rotation=90, ha="center", va="center", fontsize=11, fontweight="bold", color="#334155")
    fig.text(0.012, 0.29, "验证", rotation=90, ha="center", va="center", fontsize=11, fontweight="bold", color="#334155")

    for idx, metric in enumerate(METRICS):
        row = 0 if idx < 5 else 1
        ax = axes[row, idx % 5]
        for gid, group in groups.items():
            sub = df[df["group_id"] == gid]
            ax.plot(sub["epoch"], sub[metric], lw=1.15, color=COLORS[gid], alpha=0.90)
        ax.set_title(TITLES[metric], fontsize=11.5, pad=8)
        ax.set_xlabel("轮次", fontsize=9)
        ax.set_xlim(1, 1000)
        ax.grid(True, alpha=0.20, linewidth=0.65)
        ax.tick_params(labelsize=8.5)
        if metric in SCORE_METRICS:
            ax.set_ylim(0, 1)
            ax.set_ylabel("分数", fontsize=9)
        else:
            y = df[metric].to_numpy()
            pad = 0.07 * (float(y.max()) - float(y.min()))
            ax.set_ylim(max(0, float(y.min()) - pad), float(y.max()) + pad)
            ax.set_ylabel("损失", fontsize=9)
        if metric.startswith("val_"):
            starts = [g["params"][metric]["overfit_start"] for g in groups.values()]
            for start, gid in zip(starts, groups):
                ax.axvline(start, color=COLORS[gid], ls="--", lw=0.65, alpha=0.25)
    handles = [Line2D([0], [0], color=COLORS[g["group_id"]], lw=2, label=f"{g['group_id']} {g['name']} · seed={g['seed']}") for g in groups.values()]
    fig.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, 0.865), ncol=3, fontsize=9.1, frameon=False)
    fig_path = out_dir / "figures" / "yolo_1000_rounds_10_metrics_2x5.png"
    fig_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(fig_path, dpi=300, facecolor="white")
    fig.savefig(fig_path.with_suffix(".pdf"), facecolor="white")
    plt.close(fig)
    return fig_path


def write_readme(df: pd.DataFrame, groups: dict, out_dir: Path, fig_path: Path) -> None:
    lines = [
        f"# YOLO 1000轮十项指标教学模拟｜{TAG}", "",
        "附件中的十项指标已按 2×5 排布：训练/定位损失、训练/分类损失、训练/分布焦点损失、精确度、召回率；验证/定位损失、验证/分类损失、验证/分布焦点损失、mAP@0.5、mAP@0.5:0.95。",
        "",
        "所有数值由公式和固定随机种子生成；脚本不读取训练日志，附件图片只用于指标名称和版式参考。",
        "", "## 文件", "", f"- `{fig_path.relative_to(out_dir).as_posix()}`：按十项指标绘制的两行五列 PNG；同时有同名 PDF。", "- `data_10_metrics/`：三组各 1000 行 CSV、3000 行合并 CSV、CSV 元数据和完整参数。", "- `scripts/generate_ten_metrics.py`：可复现生成脚本。", "",
        "## 公式与波动", "", "损失曲线使用 `L(e) = L∞ + A·exp(-k·e)`；精确度、召回率和 mAP 使用 `M(e) = M∞ - B·exp(-k·e)`。验证损失另加 `overfit_amp·((max(e−e0,0))/(1000−e0))^p` 的小幅平滑后期上升项，仅作课堂上的过拟合现象示意，不代表任何真实模型结论。", "", "每个指标叠加固定随机种子生成的 AR(1) 连续相关波动；前期幅度稍大、后期幅度较小但保留非零下限，避免独立白噪声、尖峰或 300 轮后的长段笔直。精确度、召回率和两个 mAP 指标限制在 0–1。", "", "## 3组参数", "", "| 组 | 名称 | seed |", "|---|---|---:|", *[f"| {g['group_id']} | {g['name']} | {g['seed']} |" for g in groups.values()], "", f"**{TAG}**。{DISCLAIMER}", "", "生成日期：2026-09-29（Asia/Shanghai）。",
    ]
    (out_dir / "说明_十项指标.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT)
    args = parser.parse_args()
    out_dir = args.out.resolve()
    df, groups = build_data()
    write_outputs(df, groups, out_dir)
    fig = plot_data(df, groups, out_dir)
    write_readme(df, groups, out_dir, fig)
    manifest = {"metadata_tag": TAG, "generated_on": "2026-09-29", "rows": int(len(df)), "rounds_per_group": 1000, "metric_count": 10, "figure": str(fig.relative_to(out_dir)), "sha256": hashlib.sha256(fig.read_bytes()).hexdigest(), "disclaimer": DISCLAIMER}
    (out_dir / "生成清单_十项指标.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

