"""Generate a single-group ten-metric YOLO teaching simulation."""
from __future__ import annotations
from pathlib import Path
import argparse
import hashlib
import json
import sys
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate_ten_metrics as base

TAG = base.TAG
DISCLAIMER = base.DISCLAIMER
GROUP = base.GROUPS[0]
METRICS = base.METRICS
TITLES = base.TITLES
LOSS_METRICS = base.LOSS_METRICS
SCORE_METRICS = base.SCORE_METRICS


def build_data():
    e = np.arange(1, 1001, dtype=int)
    rng = np.random.default_rng(GROUP["seed"])
    data = {"epoch": e}
    for metric in METRICS:
        data[metric] = base.simulate(e.astype(float), metric, GROUP["params"][metric], rng)
    data["group_id"] = GROUP["group_id"]
    data["group_name"] = GROUP["name"]
    return pd.DataFrame(data)


def write_data(df, out_dir):
    data_dir = out_dir / "data_single_group"
    data_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "metadata_tag": TAG, "group_id": GROUP["group_id"], "group_name": GROUP["name"],
        "seed": GROUP["seed"], "rounds": 1000, "metric_count": 10,
        "formula_note": "Losses: L_inf + A*exp(-k*e); scores: M_inf - B*exp(-k*e); validation losses include a small smooth post-plateau rise; fluctuations are seeded AR(1)-style correlated noise.",
        "disclaimer": DISCLAIMER,
    }
    path = data_dir / "yolo_1000_rounds_10_metrics_single.csv"
    header = "\n".join([
        f"# {TAG}", f"# {json.dumps(payload, ensure_ascii=False)}",
        "# Values are formula-generated teaching data; no training log was read.",
        "# One group only: train_box_loss, train_cls_loss, train_dfl_loss, precision, recall, val_box_loss, val_cls_loss, val_dfl_loss, mAP50, mAP50_95",
    ]) + "\n"
    path.write_text(header, encoding="utf-8-sig")
    df.to_csv(path, mode="a", index=False, float_format="%.8f", encoding="utf-8-sig")
    rows = [
        {"key": "metadata_tag", "value": TAG}, {"key": "group_id", "value": GROUP["group_id"]},
        {"key": "group_name", "value": GROUP["name"]}, {"key": "seed", "value": str(GROUP["seed"])},
        {"key": "rounds", "value": "1000"}, {"key": "metric_count", "value": "10"},
        {"key": "training_log_source", "value": "none; no real training log read"},
        {"key": "formula_losses", "value": "L(e) = L_inf + A*exp(-k*e)"},
        {"key": "formula_scores", "value": "M(e) = M_inf - B*exp(-k*e)"},
        {"key": "correlated_fluctuation", "value": "seeded AR(1)-style process with decaying amplitude and nonzero late floor"},
        {"key": "disclaimer", "value": DISCLAIMER},
    ]
    pd.DataFrame(rows).to_csv(data_dir / "metadata.csv", index=False, encoding="utf-8-sig")
    (data_dir / "parameters.json").write_text(json.dumps({"metadata_tag": TAG, "group": GROUP, "metric_order": METRICS, "disclaimer": DISCLAIMER}, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def plot_data(df, out_dir):
    plt.rcParams.update({"font.family": "Microsoft YaHei", "axes.unicode_minus": False})
    fig, axes = plt.subplots(2, 5, figsize=(20, 9), constrained_layout=False)
    fig.subplots_adjust(left=0.055, right=0.985, top=0.78, bottom=0.12, wspace=0.27, hspace=0.38)
    fig.suptitle(f"YOLO 1000轮十项指标单组教学模拟｜{TAG}", fontsize=18, fontweight="bold", y=0.965)
    fig.text(0.5, 0.925, "单一模拟轨迹；公式示意；固定随机种子生成连续相关波动；不可作为真实训练记录或模型性能结论", ha="center", va="center", fontsize=10.5, color="#7f1d1d")
    fig.text(0.5, 0.045, TAG, ha="center", va="center", fontsize=11, color="#991b1b", fontweight="bold", bbox={"boxstyle": "round,pad=0.35", "facecolor": "#fef2f2", "edgecolor": "#ef4444", "linewidth": 1.2})
    fig.text(0.012, 0.69, "训练", rotation=90, ha="center", va="center", fontsize=11, fontweight="bold", color="#334155")
    fig.text(0.012, 0.29, "验证", rotation=90, ha="center", va="center", fontsize=11, fontweight="bold", color="#334155")
    for idx, metric in enumerate(METRICS):
        row = 0 if idx < 5 else 1
        ax = axes[row, idx % 5]
        ax.plot(df["epoch"], df[metric], color="#2f75b5", lw=1.25)
        ax.set_title(TITLES[metric], fontsize=11.5, pad=8)
        ax.set_xlabel("轮次", fontsize=9)
        ax.set_xlim(1, 1000)
        ax.grid(True, alpha=0.20, linewidth=0.65)
        ax.tick_params(labelsize=8.5)
        if metric in SCORE_METRICS:
            ax.set_ylim(0, 1)
            ax.set_ylabel("分数", fontsize=9)
        else:
            y = df[metric].to_numpy(); pad = 0.07 * (float(y.max()) - float(y.min()))
            ax.set_ylim(max(0, float(y.min()) - pad), float(y.max()) + pad)
            ax.set_ylabel("损失", fontsize=9)
        if metric.startswith("val_"):
            ax.axvline(GROUP["params"][metric]["overfit_start"], color="#d97706", ls="--", lw=0.8, alpha=0.35)
    fig_path = out_dir / "figures" / "yolo_1000_rounds_10_metrics_single_2x5.png"
    fig_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(fig_path, dpi=300, facecolor="white")
    fig.savefig(fig_path.with_suffix(".pdf"), facecolor="white")
    plt.close(fig)
    return fig_path


def write_readme(out_dir, fig_path):
    text = f"""# YOLO 1000轮十项指标单组教学模拟｜{TAG}

这是单一参数组、单一固定随机种子的 1000 轮教学模拟。十项指标按附件排布：训练/定位损失、训练/分类损失、训练/分布焦点损失、精确度、召回率；验证/定位损失、验证/分类损失、验证/分布焦点损失、mAP@0.5、mAP@0.5:0.95。

曲线由公式生成，未读取真实训练日志。它可以做成更接近常见 YOLO 收敛形态的课堂示例，但不能保证与任何真实训练记录无限接近，也不能作为真实模型性能结论。

文件：

- `{fig_path.relative_to(out_dir).as_posix()}`：单组两行五列图，无三组图例。
- `data_single_group/yolo_1000_rounds_10_metrics_single.csv`：1000 轮单组数据。
- `data_single_group/metadata.csv`、`parameters.json`：元数据和参数。
- `scripts/generate_single_group.py`：可复现生成脚本。

损失使用 `L(e) = L∞ + A·exp(-k·e)`；精确度、召回率和 mAP 使用 `M(e) = M∞ - B·exp(-k·e)`。验证损失带有小幅平滑后期上升项，仅用于过拟合现象示意。波动为固定种子生成的 AR(1) 连续相关过程，后期保留非零下限。

**{TAG}**。{DISCLAIMER}
"""
    (out_dir / "说明_单组十项指标.md").write_text(text, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--out", type=Path, default=ROOT); args = parser.parse_args()
    out_dir = args.out.resolve(); df = build_data(); write_data(df, out_dir); fig = plot_data(df, out_dir); write_readme(out_dir, fig)
    manifest = {"metadata_tag": TAG, "group_id": GROUP["group_id"], "seed": GROUP["seed"], "rows": len(df), "metric_count": 10, "figure": str(fig.relative_to(out_dir)), "sha256": hashlib.sha256(fig.read_bytes()).hexdigest(), "disclaimer": DISCLAIMER}
    (out_dir / "生成清单_单组十项指标.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
