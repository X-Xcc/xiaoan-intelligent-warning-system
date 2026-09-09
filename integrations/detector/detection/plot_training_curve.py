"""Plot YOLO training curves from one or many results.csv files."""

from __future__ import annotations

import argparse
import csv
import shutil
from pathlib import Path


def smooth(values: list[float], window: int = 7) -> list[float]:
    if len(values) <= 2 or window <= 1:
        return values
    half = window // 2
    out: list[float] = []
    for idx in range(len(values)):
        start = max(0, idx - half)
        end = min(len(values), idx + half + 1)
        chunk = values[start:end]
        out.append(sum(chunk) / len(chunk))
    return out


def metric(row: dict[str, str], name: str) -> float:
    return float(row.get(name, row.get(f" {name}", "nan")).strip())


def load_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise SystemExit(f"{csv_path} has no rows")
    return rows


def fallback_plot(csv_path: Path, output: Path | None = None) -> Path:
    rows = load_rows(csv_path)
    columns = [name for name in rows[0].keys() if "loss" in name or "metric" in name]
    if not columns:
        raise SystemExit(f"{csv_path} has no loss or metric columns")
    epoch_col = next(iter(rows[0].keys()))

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    x = [metric(row, epoch_col) for row in rows]
    cols = len(columns)
    nrows = 2
    ncols = (cols + 1) // 2
    fig, axes = plt.subplots(nrows, ncols, figsize=(max(10, ncols * 3.2), 6), tight_layout=True)
    axes_list = list(axes.ravel())

    for idx, column in enumerate(columns):
        y = [metric(row, column) for row in rows]
        ax = axes_list[idx]
        ax.plot(x, y, marker=".", label="results", linewidth=2, markersize=5)
        ax.plot(x, smooth(y), ":", label="smooth", linewidth=2)
        ax.set_title(column, fontsize=11)

    for ax in axes_list[cols:]:
        ax.axis("off")

    if columns:
        axes_list[min(1, cols - 1)].legend()

    target = output or csv_path.with_name("results.png")
    fig.savefig(target, dpi=200)
    plt.close(fig)
    return target


def plot_one(csv_path: Path, output: Path | None = None) -> Path:
    try:
        from ultralytics.utils.plotting import plot_results as ultralytics_plot_results
    except Exception:
        return fallback_plot(csv_path, output)

    ultralytics_plot_results(file=str(csv_path))
    default_output = csv_path.with_name("results.png")
    if output and output.resolve() != default_output.resolve():
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(default_output, output)
        return output
    return default_output


def find_csvs(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("results.csv") if p.is_file())


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--csv", type=Path, help="Path to one results.csv file")
    group.add_argument("--root", type=Path, help="Root folder to scan recursively")
    parser.add_argument("--output", type=Path, help="Output image path for a single CSV")
    args = parser.parse_args()

    if args.csv:
        saved = plot_one(args.csv, args.output)
        print(saved.resolve())
        return

    csv_files = find_csvs(args.root)
    if not csv_files:
        raise SystemExit(f"No results.csv files found under {args.root.resolve()}")

    for csv_file in csv_files:
        saved = plot_one(csv_file)
        print(saved.resolve())


if __name__ == "__main__":
    main()
