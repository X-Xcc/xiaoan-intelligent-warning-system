export enum UserRole {
  SUPER_ADMIN = "超级管理员",
  PRISON_ADMIN = "监狱管理员",
  ON_DUTY_OFFICER = "值班干警",
}

export enum CameraStatus {
  ONLINE = "online",
  OFFLINE = "offline",
  SIGNAL_LOST = "signal_lost",
}

export interface Camera {
  id: string;
  name: string;
  type: "usb" | "rtsp" | "http_snapshot";
  address: string | number;
  user?: string;
  password?: string;
  brand?: string;
  model?: string;
  go2rtcId?: string;
  httpMjpegUrl?: string;
  ip?: string;
  port?: number;
  // computed at runtime
  status: CameraStatus;
  streamUrl: string;
  personCount: number;
}

export interface DiscoveredCamera {
  ip: string;
  name: string;
  brand: string | null;
  model: string | null;
  rtspUrl: string;
  serviceUrl: string;
}

export enum AlertLevel {
  CRITICAL = "high",
  WARNING = "medium",
  MINOR = "minor",
  INFO = "low",
}

export enum AlertType {
  FIGHT = "打架",
  FALL = "跌倒",
  CROWD = "人员聚集",
  ABSENCE = "离岗",
}

export interface Alert {
  id: string;
  cameraId: string;
  cameraName: string;
  type: AlertType;
  level: AlertLevel;
  time: string;
  snapshotUrl: string;
  status: "pending" | "confirmed" | "ignored";
  confidence: number;
  duration?: string;
  message?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  operatorId: string;
  operatorName: string;
  category: string;
  action: string;
  riskLevel: "high" | "medium" | "low";
  status: boolean;
}

export interface SystemStatus {
  cpuUsage: number;
  memoryUsage: number;
  storageUsage: number;
  gpuUsage: number;
  version: string;
  lastUpdate: string;
  engine?: string;
  onlineDevices?: number;
  totalDevices?: number;
  activeModels?: number;
  totalModels?: number;
  dataDirSizeMb?: number;
  detectionCount?: number;
  services: {
    name: string;
    uptime: string;
    status: string;
    health: 'healthy' | 'warning' | 'error';
  }[];
}

export interface UserAccount {
  uid: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastLogin: string;
}

export interface UserCredentials {
  uid: string;
  username: string;
  password: string; // In a real app, this would be hashed
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface TrendData {
  labels: string[];
  data: Record<string, number[]>;
}

export interface RegionalStat {
  name: string;
  value: number;
  color?: string;
}

export interface EvidenceStats {
  total: number;
  archived: number;
  critical: number;
  onlineRate: number;
}

export type StatsCompare = Record<string, { today: number; yesterday: number; change: number }>;

export interface AiSensitivity {
  fightDetection: number;
  fallDetection: number;
  climbingDetection: number;
  crowdGathering: number;
}

export interface AppNotifications {
  email: boolean;
  sms: boolean;
  centralAlarm: boolean;
}

export interface StorageSettings {
  autoOverwrite: boolean;
}

export interface Settings {
  confidence: number;
  iou: number;
  interval: number;
  maxPeople: number;
  cooldown: number;
  fatigueThreshold: number;
  aiSensitivity: AiSensitivity;
  notifications: AppNotifications;
  storage: StorageSettings;
}

export interface AlertFilterParams {
  type?: string;
  status?: string;
  since?: string;
  page?: number;
  size?: number;
}

export interface AuditFilterParams {
  search?: string;
  category?: string;
  riskLevel?: string;
  page?: number;
  size?: number;
}

export interface FpsStats {
  avg: number;
  min: number;
  max: number;
  count: number;
}

export interface StatsSummary {
  behaviorCounts: Record<string, number>;
  total: number;
  compare: StatsCompare;
}

export interface ModelInfo {
  model_size_mb: number;
  device: string;
  precision: string;
}

export interface SystemInfo {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  gpuPercent: number;
  version: string;
  engine: string;
  uptime?: string;
  onlineDevices?: number;
  totalDevices?: number;
  dataDirSizeMb?: number;
  detectionCount?: number;
}

export interface Detection {
  filename: string;
  timestamp: string;
  type: string;
  confidence: number;
  camera?: string;
}

export interface FullStatsResponse {
  totalDetections: number;
  totalImages: number;
  behaviorCounts: Record<string, number>;
  allDetections: Detection[];
  recentDetections: Detection[];
  personCount: number;
}

// --- Annotation ---

export interface BBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  labels: string[];
  confidence: number;
  source: string;
}

export interface AnnotationData {
  imageFilename: string;
  imageWidth: number;
  imageHeight: number;
  annotator: string;
  annotatedAt: string;
  status: "unlabeled" | "ai_pending" | "reviewed";
  labels: string[];
  bboxes: BBox[];
}

export interface ImageItem {
  filename: string;
  path: string;
  hasAnnotation: boolean;
  annotationStatus?: "unlabeled" | "ai_pending" | "reviewed";
}

export interface LabelOption {
  id: number;
  name: string;
  color: string;
}

// ID 与后端 COCO 导出 category ID 一致；id 2,3 保留给 fatigue/eye_fatigue（本页未使用）
export const LABEL_OPTIONS: LabelOption[] = [
  { id: 0, name: "跌倒", color: "#f97316" },
  { id: 1, name: "打架", color: "#ef4444" },
  { id: 4, name: "离岗", color: "#ef4444" },
  { id: 5, name: "聚集", color: "#3b82f6" },
];

// --- Model Training ---

/** 训练配置 — 提交训练任务时发送 */
export interface TrainingConfig {
  epochs: number;
  prompt: string;
  dataset_file: string;
  learning_rate?: number;
  img_size?: number;
  batch_size?: number;
}

/** 训练状态 — 轮询 / SSE 返回 */
export interface TrainingStatus {
  status: "idle" | "running" | "completed" | "error";
  current_epoch: number;
  total_epochs: number;
  learning_rate: number;
  map50: number;
  loss: number;
  elapsed_seconds: number;
  eta_seconds: number;
  gpu_memory_mb: number;
}

/** 日志条目 */
export interface TrainingLog {
  level: "INFO" | "TRAIN" | "DATA" | "WARN" | "SYNC";
  message: string;
  timestamp: string;
}
