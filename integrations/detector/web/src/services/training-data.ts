export interface TrainingUploadItem {
  id: string;
  name: string;
  size: string;
  type: 'video' | 'image';
  status: 'ready' | 'uploading' | 'done' | 'error';
  progress: number;
  previewUrl?: string;
  serverFilename?: string;
}

export interface TrainingAlgoVersion {
  label: string;
  sublabel: string;
}

export interface TrainingLogEntry {
  level: 'INFO' | 'ALGO' | 'WARN' | 'SYNC' | 'DATA' | 'RECOG';
  message: string;
  timestamp: string;
}

export const TRAINING_ALGO_VERSIONS: TrainingAlgoVersion[] = [
  { label: '第一代算法', sublabel: '基础版 (v1.0)' },
  { label: '第二代算法', sublabel: '轻量版 (v2.1)' },
  { label: '第三代算法', sublabel: '精度版 (v3.0)' },
  { label: '第四代算法', sublabel: '增强版 (v4.2)' },
];

export const TRAINING_LOG_MESSAGES: Array<{ level: TrainingLogEntry['level']; msg: string }> = [
  { level: 'RECOG', msg: '识别任务启动，加载 YOLOv8n-pose 打架检测模型...' },
  { level: 'INFO', msg: '模型加载完成: YOLOv8n-pose, 17关键点, 输入 512×512' },
  { level: 'DATA', msg: '区域A(监舍走廊) — 4人在线, 正在逐帧分析肢体动作' },
  { level: 'ALGO', msg: '第一代算法: 拳击/推搡动作分类器已激活' },
  { level: 'ALGO', msg: '第四代算法: 基于姿态关键点的冲突预测引擎已激活' },
  { level: 'SYNC', msg: 'GPU: RTX 5060, CUDA 12.8, 推理耗时 34ms/帧' },
  { level: 'DATA', msg: '帧 86 — 两名在押人员距离 0.8m，手臂姿态正常' },
  { level: 'DATA', msg: '帧 173 — 左侧人员转身，右手抬起角度 72°，判定为挥手' },
  { level: 'DATA', msg: '帧 261 — 两人接近至 0.3m，上肢关节运动幅度增大' },
  { level: 'DATA', msg: '帧 348 — 右侧人员左拳挥出，手腕加速度 12.4m/s²，肘关节屈曲 35°' },
  { level: 'DATA', msg: '帧 445 — 冲突持续 3.2s，已抓拍 6 张关键帧证据' },
  { level: 'DATA', msg: '帧 537 — 第三人靠近，疑似拉架，手臂环绕动作' },
  { level: 'DATA', msg: '帧 628 — 冲突双方分开，距离恢复至 1.5m，运动幅度下降' },
  { level: 'DATA', msg: '帧 714 — 姿态恢复正常站立，打斗结束，持续时长 6.8s' },
  { level: 'DATA', msg: '帧 842 — 全区域扫描: 当前无异常行为，4 人正常活动' },
];

export function formatTrainingAssetSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createTrainingUploadItem(file: File, id: string): TrainingUploadItem {
  return {
    id,
    name: file.name,
    size: formatTrainingAssetSize(file.size),
    type: file.type.startsWith('video') ? 'video' : 'image',
    status: 'uploading',
    progress: 0,
  };
}

export function toggleTrainingAlgoSelection(selected: number[], idx: number) {
  return selected.includes(idx) ? selected.filter(item => item !== idx) : [...selected, idx];
}

export function buildTrainingUploadSuccessLog(file: File, timestamp: string): TrainingLogEntry {
  return {
    level: 'INFO',
    message: `素材上传成功: ${file.name} (${formatTrainingAssetSize(file.size)})`,
    timestamp,
  };
}

export function buildTrainingUploadErrorLog(message: string, timestamp: string): TrainingLogEntry {
  return {
    level: 'WARN',
    message: `素材上传失败: ${message}`,
    timestamp,
  };
}

export function buildTrainingLoadedLog(filename: string, timestamp: string): TrainingLogEntry {
  return {
    level: 'DATA',
    message: `素材已加载: ${filename || '未知文件'}`,
    timestamp,
  };
}

export function getRecognitionProgress(elapsedMs: number, totalDurationMs: number) {
  return Math.min(Math.round((elapsedMs / totalDurationMs) * 100), 100);
}

export function buildTrainingWarnLogs(timestamp: string): TrainingLogEntry[] {
  return [
    { level: 'WARN', message: '区域 A 检测到打架: 拳击动作 (置信度 0.93, 关键点偏移量 38px)', timestamp },
    { level: 'SYNC', message: '报警推送: 已通知监控中心，编号 #ALM-2026-0514-001', timestamp },
  ];
}

export function buildTrainingCompleteLog(timestamp: string): TrainingLogEntry {
  return {
    level: 'RECOG',
    message: '识别任务完成。本次共检测到 1 起打架事件，已记录关键帧。',
    timestamp,
  };
}

export function getTrainingProgressStatus(progress: number, isRecognizing: boolean) {
  return isRecognizing ? '识别中...' : progress >= 100 ? '已完成' : '等待开始';
}

export function getTrainingProgressDetail(progress: number) {
  return progress < 100 ? `剩余 ${100 - progress}%` : '就绪';
}
