"""
YOLOv8 action detection training script.

Usage:
    python train_action.py --epochs 100 --batch 8
    python train_action.py --device cpu
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from ultralytics import YOLO
from dataset_paths import portable_dataset_config


def main() -> None:
    parser = argparse.ArgumentParser(description="YOLOv8 action detection training")
    datasets = Path(os.environ.get("TRAINING_DATASETS_DIR", Path(__file__).resolve().parent / "datasets"))
    parser.add_argument("--data", default=str(datasets / "actions" / "action_data.yaml"), help="private dataset yaml path")
    parser.add_argument("--model", required=True, help="existing local detection model")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--lr", type=float, default=0.01)
    parser.add_argument("--device", default=os.environ.get("YOLOV8_DEVICE", "cpu"), help="GPU id, or cpu")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--amp", action="store_true", help="enable automatic mixed precision")
    parser.add_argument("--patience", type=int, default=50)
    parser.add_argument("--cache", default=False, help="false, ram, or disk")
    parser.add_argument("--name", default="action", help="run name under runs/detect")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    data_path = (script_dir / args.data).resolve()
    model_path = (script_dir / args.model).resolve()

    if not model_path.is_file():
        parser.error("Local model is missing; automatic model downloads are disabled")
    if not data_path.is_file():
        parser.error("Private dataset configuration is missing")
    data_path = portable_dataset_config(data_path, datasets)
    model_ref = str(model_path)
    runs = Path(os.environ.get("TRAINING_RUNS_DIR", project_root / "runs"))

    print(f"base model: {model_ref}")
    print(f"dataset: {data_path}")
    print(
        "params: "
        f"epochs={args.epochs}, batch={args.batch}, imgsz={args.imgsz}, "
        f"lr={args.lr}, device={args.device}, workers={args.workers}"
    )

    model = YOLO(model_ref)
    model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        lr0=args.lr,
        device=args.device,
        workers=args.workers,
        amp=args.amp,
        patience=args.patience,
        cache=args.cache,
        save=True,
        val=True,
        project=str(runs / "detect"),
        name=args.name,
        exist_ok=True,
    )

    best_path = runs / "detect" / args.name / "weights" / "best.pt"
    if best_path.exists():
        print(f"best weights: {best_path}")


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    main()
