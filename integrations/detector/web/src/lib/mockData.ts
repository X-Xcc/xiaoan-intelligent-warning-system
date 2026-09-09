/**
 * 虚拟数据层 — 让前端在无后端环境下完整运行
 * 所有页面使用此数据源，模拟真实业务场景
 */

import { Camera, CameraStatus, Alert, AlertLevel, AlertType, AuditLog, SystemStatus, Settings } from "../types";

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function timeAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

/** 伪随机数生成器，按 seed 产生确定性序列 */
export function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── 摄像头数据 ───────────────────────────────────────────────────────────────

const CAMERA_NAMES = [
  { name: "视频1", type: "rtsp" as const, address: "rtsp://192.0.2.9:554/stream1" },
  { name: "视频2", type: "rtsp" as const, address: "rtsp://192.0.2.10:554/stream1" },
  { name: "视频3", type: "rtsp" as const, address: "rtsp://192.0.2.11:554/stream1" },
];

export function generateCameras(): Camera[] {
  return CAMERA_NAMES.map((cam, i) => ({
    id: `cam-${String(i + 1).padStart(3, "0")}`,
    name: cam.name,
    type: cam.type,
    address: cam.address,
    status: CameraStatus.ONLINE,
    streamUrl: `/video_feed?cam=${i}`,
    personCount: randomInt(1, 15),
  }));
}

// ── 告警数据 ─────────────────────────────────────────────────────────────────

const ALERT_TYPES: { type: AlertType; level: AlertLevel }[] = [
  { type: AlertType.FIGHT, level: AlertLevel.CRITICAL },
  { type: AlertType.FALL, level: AlertLevel.WARNING },
  { type: AlertType.CROWD, level: AlertLevel.MINOR },
  { type: AlertType.ABSENCE, level: AlertLevel.INFO },
];

const CAMERAS_FOR_ALERTS = CAMERA_NAMES;

export function generateAlerts(count = 50): Alert[] {
  return Array.from({ length: count }, (_, i) => {
    const { type, level } = pick(ALERT_TYPES);
    const cam = pick(CAMERAS_FOR_ALERTS);
    const statuses: Alert["status"][] = ["pending", "confirmed", "ignored", "confirmed", "confirmed"];
    return {
      id: `ALT-${Date.now()}-${genId()}`,
      cameraId: `cam-${String(CAMERAS_FOR_ALERTS.indexOf(cam) + 1).padStart(3, "0")}`,
      cameraName: cam.name,
      type,
      level,
      time: timeAgo(randomInt(1, 1440)),
      snapshotUrl: "",
      status: pick(statuses),
      confidence: randomFloat(75, 99, 1),
      duration: `00:${randomInt(0, 5).toString().padStart(2, "0")}:${randomInt(0, 59).toString().padStart(2, "0")}`,
      message: `${cam.name}检测到${type}行为`,
    };
  }).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

// ── 审计日志 ─────────────────────────────────────────────────────────────────

const OPERATORS = [
  { id: "A001", name: "用户1" },
  { id: "A002", name: "用户2" },
  { id: "A003", name: "用户3" },
  { id: "B001", name: "用户4" },
];

const AUDIT_CATEGORIES = ["登录管理", "设备配置", "告警处理", "系统设置", "数据导出", "用户管理"];
const AUDIT_ACTIONS = [
  "用户登录系统", "修改摄像头配置", "确认打架告警", "调整AI灵敏度",
  "导出月度报表", "添加新设备", "删除过期数据", "修改通知策略",
  "重置密码", "查看监控回放", "批量确认告警", "更新系统固件",
];

export function generateAuditLogs(count = 100): AuditLog[] {
  return Array.from({ length: count }, (_, i) => {
    const op = pick(OPERATORS);
    const riskLevels: AuditLog["riskLevel"][] = ["high", "medium", "low", "low", "low", "medium"];
    return {
      id: `LOG-${genId()}`,
      timestamp: timeAgo(randomInt(1, 10080)),
      operatorId: op.id,
      operatorName: op.name,
      category: pick(AUDIT_CATEGORIES),
      action: pick(AUDIT_ACTIONS),
      riskLevel: pick(riskLevels),
      status: Math.random() > 0.1,
    };
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ── 系统状态 ─────────────────────────────────────────────────────────────────

export function generateSystemStatus(): SystemStatus {
  return {
    cpuUsage: randomInt(25, 75),
    memoryUsage: randomInt(40, 80),
    storageUsage: randomInt(30, 65),
    gpuUsage: randomInt(50, 95),
    version: "v3.2.1",
    lastUpdate: new Date().toLocaleString("zh-CN"),
    engine: "YOLOv8n-pose",
    onlineDevices: 3,
    totalDevices: 3,
    activeModels: 2,
    totalModels: 4,
    dataDirSizeMb: randomInt(800, 3200),
    detectionCount: randomInt(15000, 50000),
    services: [
      { name: "推理引擎 (YOLOv8)", uptime: "15天4小时", status: "Running", health: "healthy" as const },
      { name: "Spring Boot 后端", uptime: "15天4小时", status: "Running", health: "healthy" as const },
      { name: "SSE 事件总线", uptime: "15天4小时", status: "Running", health: "healthy" as const },
      { name: "视频流服务", uptime: "15天3小时", status: "Running", health: "healthy" as const },
      { name: "Qwen2.5-VL 服务", uptime: "8天12小时", status: "Running", health: "healthy" as const },
      { name: "数据清理服务", uptime: "15天4小时", status: "Running", health: "healthy" as const },
      { name: "告警推送服务", uptime: "15天4小时", status: "Running", health: "healthy" as const },
      { name: "Nginx 网关", uptime: "30天", status: "Running", health: "healthy" as const },
    ],
  };
}

// ── 趋势数据（确定性，使用 seed 保证刷新不跳变） ────────────────────────────────

export function generateTrendData(range: "day" | "week" | "month" | "quarter") {
  const keys = ["打架", "跌倒", "离岗", "人员聚集"] as const;

  // ── 月数据：主数据源（seeded 保证刷新不跳变） ──
  const rand = seededRandom(300);
  const monthLabels: string[] = [];
  const monthData: Record<string, number[]> = { "打架": [], "跌倒": [], "离岗": [], "人员聚集": [] };
  for (let i = 0; i < 30; i++) {
    monthLabels.push(`${i + 1}日`);
    const waveFactor = 0.6 + 0.4 * Math.sin((i / 7) * Math.PI);
    monthData["打架"].push(Math.round((rand() * 5 + 1) * waveFactor));
    monthData["跌倒"].push(Math.round((rand() * 3 + 0.5) * waveFactor));
    monthData["离岗"].push(Math.round((rand() * 8 + 2) * waveFactor));
    monthData["人员聚集"].push(Math.round((rand() * 4 + 1) * waveFactor));
  }

  if (range === "month") {
    return { labels: monthLabels, data: monthData };
  }

  if (range === "week") {
    // 本周7天真实日期
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // Monday=1, Sunday=7
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    const labels: string[] = [];
    const data: Record<string, number[]> = {};
    for (const key of keys) data[key] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      labels.push(`${d.getMonth() + 1}月${d.getDate()}日`);
      for (const key of keys) {
        const weekFactor = 0.6 + 0.4 * Math.sin((i / 7) * Math.PI);
        const weekdayFactor = i < 5 ? 1.0 : 0.5;
        const base = key === "打架" ? 3 : key === "跌倒" ? 2 : key === "离岗" ? 5 : 3;
        data[key].push(Math.round((rand() * base + 1) * weekFactor * weekdayFactor));
      }
    }
    return { labels, data };
  }

  if (range === "day") {
    // 今天真实日期
    const today2 = new Date();
    const labels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`);
    const data: Record<string, number[]> = {};
    for (const key of keys) {
      const base = key === "打架" ? 3 : key === "跌倒" ? 2 : key === "离岗" ? 5 : 3;
      data[key] = labels.map((_, hour) => {
        const f = (hour >= 2 && hour <= 5) ? 0.05 : (hour >= 8 && hour <= 20) ? 0.07 : 0.03;
        return Math.max(0, Math.round(base * f * (0.5 + rand() * 0.5)));
      });
    }
    return { labels, data };
  }

  // quarter: 90 天
  const qRand = seededRandom(400);
  const qLabels: string[] = [];
  const qData: Record<string, number[]> = { "打架": [], "跌倒": [], "离岗": [], "人员聚集": [] };
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - 90 + i);
    qLabels.push(`${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`);
    const weekFactor = 0.5 + 0.5 * Math.sin((i / 14) * Math.PI);
    const dayOfWeek = i % 7;
    const weekdayFactor = dayOfWeek < 5 ? 1.0 : 0.5;
    const factor = weekFactor * weekdayFactor;
    qData["打架"].push(Math.round((qRand() * 5 + 1) * factor));
    qData["跌倒"].push(Math.round((qRand() * 3 + 0.5) * factor));
    qData["离岗"].push(Math.round((qRand() * 8 + 2) * factor));
    qData["人员聚集"].push(Math.round((qRand() * 4 + 1) * factor));
  }
  return { labels: qLabels, data: qData };
}

// ── 统计对比 ─────────────────────────────────────────────────────────────────

export function generateStatsCompare() {
  return {
    "打架": { today: randomInt(2, 12), yesterday: randomInt(2, 12), change: randomInt(-30, 30) },
    "跌倒": { today: randomInt(0, 6), yesterday: randomInt(0, 6), change: randomInt(-40, 40) },
    "离岗": { today: randomInt(3, 15), yesterday: randomInt(3, 15), change: randomInt(-20, 20) },
    "人员聚集": { today: randomInt(1, 8), yesterday: randomInt(1, 8), change: randomInt(-25, 25) },
  };
}

// ── 统计摘要 ─────────────────────────────────────────────────────────────────

export function generateStatsSummary() {
  return {
    behaviorCounts: {
      "打架": randomInt(8, 35),
      "跌倒": randomInt(3, 18),
      "离岗": randomInt(12, 50),
      "人员聚集": randomInt(5, 25),
    },
    total: randomInt(2000, 8000),
    compare: {},
  };
}

// ── 区域统计 ─────────────────────────────────────────────────────────────────

export function generateRegionalStats() {
  return [
    { name: "A区", value: randomInt(10, 50), color: "#0051ae" },
    { name: "B区", value: randomInt(8, 40), color: "#0058be" },
    { name: "C区", value: randomInt(5, 30), color: "#bf8700" },
    { name: "D区", value: randomInt(3, 25), color: "#7c4dff" },
    { name: "E区", value: randomInt(2, 20), color: "#1a7f37" },
    { name: "F区", value: randomInt(1, 15), color: "#cf222e" },
  ];
}

// ── 证据列表 ─────────────────────────────────────────────────────────────────

export function generateEvidenceItems(count = 24) {
  const actions = ["打架", "跌倒", "离岗", "人员聚集"];
  return Array.from({ length: count }, (_, i) => {
    const cam = pick(CAMERAS_FOR_ALERTS);
    const camIdx = CAMERAS_FOR_ALERTS.indexOf(cam);
    return {
      id: `EV-${genId()}`,
      timestamp: timeAgo(randomInt(1, 4320)),
      actions: [pick(actions)],
      personCount: randomInt(1, 8),
      cameraName: cam.name,
      cameraId: `cam-${String(camIdx + 1).padStart(3, "0")}`,
      imageFilename: `detection_${Date.now()}_${genId()}.jpg`,
      snapshotUrl: null as string | null,
      confidence: randomFloat(70, 99),
    };
  });
}

// ── FPS 统计 ─────────────────────────────────────────────────────────────────

export function generateFpsStats() {
  return { avg: randomFloat(25, 32), min: randomFloat(18, 24), max: randomFloat(33, 38), count: randomInt(5000, 20000) };
}

// ── 模型信息 ─────────────────────────────────────────────────────────────────

export function generateModelInfo() {
  return { model_size_mb: 5.2, device: "CUDA (RTX 5060)", precision: "fp16" };
}

// ── 设置 ─────────────────────────────────────────────────────────────────────

export function generateSettings(): Settings {
  return {
    confidence: 0.5,
    iou: 0.45,
    interval: 2,
    maxPeople: 50,
    cooldown: 30,
    fatigueThreshold: 15,
    aiSensitivity: { fightDetection: 80, fallDetection: 75, climbingDetection: 70, crowdGathering: 65 },
    notifications: { email: true, sms: false, centralAlarm: true },
    storage: { autoOverwrite: true },
  };
}

// ── 证据统计 ─────────────────────────────────────────────────────────────────

export function generateEvidenceStats() {
  return { total: randomInt(5000, 20000), archived: randomInt(3000, 15000), critical: randomInt(50, 200), onlineRate: randomInt(85, 99) };
}

// ── 自动化率 ─────────────────────────────────────────────────────────────────

export function generateAutomationRate() {
  return { rate: randomInt(78, 96) };
}

// ── 审计趋势 ─────────────────────────────────────────────────────────────────

export function generateAuditTrend(range: "day" | "week") {
  const count = range === "day" ? 24 : 7;
  const labels: string[] = [];
  const data: number[] = [];
  for (let i = 0; i < count; i++) {
    if (range === "day") labels.push(`${i.toString().padStart(2, "0")}:00`);
    else labels.push(["周一", "周二", "周三", "周四", "周五", "周六", "周日"][i]);
    data.push(randomInt(5, 40));
  }
  return { labels, data };
}

// ── 热力图数据（监区区域活动密度） ──────────────────────────────────────────────

export interface HeatmapZone {
  id: string;
  name: string;
  /** 相对位置 (百分比 0-100)，用于虚拟地图布局 */
  x: number;
  y: number;
  /** 区域宽高 (百分比) */
  w: number;
  h: number;
  /** 活动密度 0-100 */
  intensity: number;
  /** 该区域告警数 */
  alertCount: number;
  /** 主要行为类型 */
  topBehavior: string;
}

const ZONE_DEFS: Omit<HeatmapZone, "intensity" | "alertCount" | "topBehavior">[] = [
  { id: "A", name: "A区监舍", x: 5, y: 8, w: 28, h: 38 },
  { id: "B", name: "B区活动场", x: 36, y: 8, w: 28, h: 38 },
  { id: "C", name: "C区食堂", x: 67, y: 8, w: 28, h: 38 },
  { id: "D", name: "D区车间", x: 5, y: 54, w: 28, h: 38 },
  { id: "E", name: "E区会见室", x: 36, y: 54, w: 28, h: 38 },
  { id: "F", name: "F区医疗/图书", x: 67, y: 54, w: 28, h: 38 },
];

const BEHAVIORS = ["打架", "跌倒", "离岗", "人员聚集"];

export function generateHeatmapData(): HeatmapZone[] {
  const rand = seededRandom(500);
  return ZONE_DEFS.map(z => ({
    ...z,
    intensity: Math.round(rand() * 80 + 10),
    alertCount: Math.round(rand() * 20 + 1),
    topBehavior: BEHAVIORS[Math.floor(rand() * BEHAVIORS.length)],
  }));
}

// ── 报警类型 → 模拟监控截图（Unsplash，无水印） ─────────────────────────────

export const ALARM_SNAPSHOT_URLS: Record<string, string> = {
  fight:     "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
  fall:      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
  suicide:   "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80",
  gathering: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80",
  // AlertType 文字键也映射一份（供 Evidence / Alerts 详情使用）
  "打架":     "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
  "跌倒":     "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
  "人员聚集": "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80",
  "离岗":     "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80",
};
