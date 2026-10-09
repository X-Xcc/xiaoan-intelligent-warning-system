# Qwen-VL 动作风险微调

这套脚本把 YOLO 动作框标注转换为 Qwen2.5-VL 的多模态监督微调数据，并用 4-bit QLoRA 训练视觉问答适配器。

本次训练使用：

- 基座模型：`Qwen2.5-VL-3B-Instruct`
- 数据：`D:\Dev\yolov8_security\detection\datasets\actions`
- 类别：`fall`、`fight`、`gather`、`suicide`
- 训练/验证：244/63 张图
- 训练配置：1 epoch、LoRA rank 8、学习率 `2e-4`、图像最多约 40 万像素

重新转换数据：

```powershell
& D:\Dev\yolov8_security\.train-venv\Scripts\python.exe `
  tools\qwen_vl_finetune\prepare_action_sft.py `
  --source D:\Dev\yolov8_security\detection\datasets\actions `
  --output qwen_vl_finetune\action_sft
```

重新训练：

```powershell
& D:\Dev\yolov8_security\.train-venv\Scripts\python.exe `
  tools\qwen_vl_finetune\train_qwen_vl_lora.py `
  --model D:\CICSIC\qwen_models\models\Qwen--Qwen2.5-VL-3B-Instruct\snapshots\master `
  --train qwen_vl_finetune\action_sft\train.jsonl `
  --val qwen_vl_finetune\action_sft\val.jsonl `
  --output qwen_vl_finetune\runs\action_qwen2_5_vl_3b_lora `
  --epochs 1 --max-length 768
```

最终适配器在 `qwen_vl_finetune\runs\action_qwen2_5_vl_3b_lora\adapter`，大小约 30MB。推理时需要同时加载相同的 3B 基座模型和这个 adapter；`infer_qwen_vl.py` 与 `eval_qwen_vl.py` 可直接用于单图推理和抽样验证。

本次抽取的 8 张验证图风险类别准确率为 8/8。这个数值只是快速冒烟验证，不等同于完整测试集指标；原始数据中 `gather` 只有极少样本，后续应补充该类别再继续训练。
