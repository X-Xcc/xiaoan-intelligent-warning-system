import type { TrainingLog, TrainingStatus } from '../types';

export const TRAINING_LOG_POOL: Array<{ level: TrainingLog['level']; msg: string }> = [
  { level: 'TRAIN', msg: '模型加载完成: YOLOv8n-pose (5.9M params, 17 keypoints)' },
  { level: 'DATA', msg: '数据集扫描完成: 发现 326 张训练图片, 82 张验证图片' },
  { level: 'DATA', msg: '数据增强配置: Mosaic=0.5, MixUp=0.1, HSV=(0.015, 0.7, 0.4)' },
  { level: 'INFO', msg: 'Epoch 1/50 完成: train_loss=0.892, val_loss=0.914, mAP50=0.012' },
  { level: 'INFO', msg: 'Epoch 5/50 完成: train_loss=0.534, val_loss=0.601, mAP50=0.156' },
  { level: 'INFO', msg: 'Epoch 10/50 完成: train_loss=0.298, val_loss=0.352, mAP50=0.342' },
  { level: 'INFO', msg: 'Epoch 20/50 完成: train_loss=0.112, val_loss=0.168, mAP50=0.601' },
  { level: 'INFO', msg: 'Epoch 30/50 完成: train_loss=0.056, val_loss=0.094, mAP50=0.756' },
  { level: 'INFO', msg: 'Epoch 40/50 完成: train_loss=0.031, val_loss=0.062, mAP50=0.834' },
  { level: 'WARN', msg: '学习率调整: cosine decay, lr=0.00342' },
  { level: 'WARN', msg: '学习率调整: lr 衰减至 0.00081, 接近末期' },
  { level: 'SYNC', msg: 'GPU: RTX 5060, CUDA 12.8, 显存占用 4812MB / 8192MB' },
  { level: 'SYNC', msg: 'GPU 温度 67°C, 推理速度 34ms/step' },
  { level: 'DATA', msg: '标签统计: 跌倒 89 例, 打架 56 例, 离岗 102 例, 聚集 79 例' },
];

export const MODEL_SCENE_TAGS = ['监舍走廊', '夜间场景', '操场', '食堂', '车间'];

export function buildTrainingMetrics(totalEpochs: number, epoch: number, trainingState: TrainingStatus['status'], startedAtMs: number, nowMs = Date.now(), gpuMemoryMb = 3200) {
  const progress = totalEpochs > 0 ? epoch / totalEpochs : 0;
  const loss = 0.04 + 0.96 * Math.exp(-4 * progress);
  const map50 = 0.89 / (1 + Math.exp(-10 * (progress - 0.3)));
  const learningRate = 0.0001 + 0.0099 * (1 + Math.cos(Math.PI * progress)) / 2;
  const elapsedSeconds = trainingState === 'idle' ? 0 : Math.round((nowMs - startedAtMs) / 1000);
  const etaSeconds = progress > 0 ? Math.round((elapsedSeconds / progress) * (1 - progress)) : 0;

  return {
    status: trainingState,
    current_epoch: epoch,
    total_epochs: totalEpochs,
    learning_rate: learningRate,
    map50,
    loss,
    elapsed_seconds: elapsedSeconds,
    eta_seconds: etaSeconds,
    gpu_memory_mb: gpuMemoryMb,
  } satisfies TrainingStatus;
}

export function getTrainingProgressPercent(currentEpoch: number, totalEpochs: number) {
  return totalEpochs > 0 ? Math.round((currentEpoch / totalEpochs) * 100) : 0;
}

export function formatTrainingSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTrainingDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

export function appendPromptTag(prompt: string, tag: string) {
  return prompt ? `${prompt} ${tag}` : tag;
}

export function getTrainingFileKind(file: File | null) {
  return {
    isImage: Boolean(file?.type.startsWith('image')),
    isVideo: Boolean(file?.type.startsWith('video')),
  };
}

export function shouldOpenTrainingDoneDialog(previousStatus: TrainingStatus['status'], nextStatus: TrainingStatus['status']) {
  return previousStatus === 'running' && nextStatus === 'completed';
}
