"""
YOLOv8 Pose 模型训练脚本
用法:
    python train_pose.py                          # 默认参数
    python train_pose.py --epochs 200 --batch 16  # 自定义
    python train_pose.py --device cpu             # CPU 训练
"""

# ┌──────────────────────────────────────────────────────┐
# │  YOLOv8 Pose 微调训练脚本                             │
# │  演讲提示: "不是从零训练，是在预训练模型上微调，       │
# │            预训练模型已在COCO数据集学过人体姿态，      │
# │            我们只需教它监狱场景的特殊行为"            │
# └──────────────────────────────────────────────────────┘
import argparse
import os
import sys

from ultralytics import YOLO
from dataset_paths import portable_dataset_config


def main():
    parser = argparse.ArgumentParser(description="YOLOv8 Pose 模型训练")
    # --data: 数据集配置，指定训练/验证图片路径和关键点标注
    parser.add_argument("--data", default=os.path.join(os.environ.get("TRAINING_DATASETS_DIR", "datasets"), "pose_data.yaml"), help="数据集配置文件路径")
    # --epochs: 100轮，每轮看一遍所有训练图片
    parser.add_argument("--epochs", type=int, default=100, help="训练轮数")
    # --batch: 8，一次处理8张图片（受显存限制）
    parser.add_argument("--batch", type=int, default=8, help="批次大小")
    # --imgsz: 640，输入图片统一缩放到640x640
    parser.add_argument("--imgsz", type=int, default=640, help="输入图片尺寸")
    # --lr: 0.01，学习率，控制模型参数更新步长
    parser.add_argument("--lr", type=float, default=0.01, help="初始学习率")
    # --device: "0"，使用第0号GPU
    parser.add_argument("--device", default=os.environ.get("YOLOV8_DEVICE", "cpu"), help="GPU 编号，无 GPU 写 cpu")
    parser.add_argument("--workers", type=int, default=4, help="数据加载线程数")
    args = parser.parse_args()

    # 检查数据集配置
    if not os.path.exists(args.data):
        print(f"错误: 数据集配置不存在: {args.data}")
        print("请先准备数据集，目录结构:")
        print("  datasets/pose/")
        print("  ├── images/train/   # 训练图片")
        print("  ├── images/val/     # 验证图片")
        print("  ├── labels/train/   # 训练标注 (.txt)")
        print("  └── labels/val/     # 验证标注 (.txt)")
        sys.exit(1)

    # 检查预训练权重
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    pretrained = os.environ.get("YOLOV8_MODEL_PATH", os.path.join(project_root, "models", "yolov8n-pose.pt"))

    if not os.path.exists(pretrained):
        print(f"错误: 预训练权重不存在: {pretrained}")
        print("Automatic model downloads are disabled; restore the local pose model")
        sys.exit(1)

    args.data = str(portable_dataset_config(
        args.data, os.environ.get("TRAINING_DATASETS_DIR", os.path.join(script_dir, "datasets"))
    ))

    print(f"预训练权重: {pretrained}")
    print(f"数据集配置: {args.data}")
    print(f"训练参数: epochs={args.epochs}, batch={args.batch}, "
          f"imgsz={args.imgsz}, lr={args.lr}, device={args.device}")

    # 加载预训练权重 — 不是从零开始，是在已有知识上微调
    model = YOLO(pretrained)

    # 训练 — 内部自动做数据增强(翻转/旋转/裁剪/色彩抖动)
    # save=True: 保存每个epoch的权重
    # val=True: 每个epoch自动在验证集上评估
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        lr0=args.lr,
        device=args.device,
        workers=args.workers,
        save=True,
        val=True,
        project=os.path.join(os.environ.get("TRAINING_RUNS_DIR", os.path.join(project_root, "runs")), "pose"),
        name="train",
        exist_ok=True,
    )

    # 输出最佳权重路径
    # best.pt 是验证集上mAP最高的权重
    # 演讲提示: "训练完把best.pt替换到models/目录，重启Python就生效了"
    best_path = os.path.join(os.environ.get("TRAINING_RUNS_DIR", os.path.join(project_root, "runs")), "pose", "train", "weights", "best.pt")
    if os.path.exists(best_path):
        print(f"\n训练完成!")
        print(f"最佳权重: {best_path}")
        print(f"替换模型: copy {best_path} {pretrained}")
    else:
        print("\n训练完成，但未找到 best.pt，请检查训练日志")


if __name__ == "__main__":
    main()
