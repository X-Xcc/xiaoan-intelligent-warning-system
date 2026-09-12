import { Camera, DiscoveredCamera, Alert, AuditLog, CameraStatus, SystemStatus, SystemInfo, Settings, PageResponse, TrendData, RegionalStat, EvidenceStats, AlertFilterParams, AuditFilterParams, FpsStats, StatsSummary, ModelInfo, FullStatsResponse, AnnotationData, ImageItem } from "../types";
import { apiGet, apiPost, apiPut, apiPatch, apiDelete, apiDownload, subscribeSse, API_BASE } from "../lib/api";
import { DEFAULT_DEVICE_SETTINGS } from "./devices-data";

// --- Camera Config ---

export async function fetchCameras(signal?: AbortSignal): Promise<Camera[]> {
  const raw = await apiGet<Record<string, unknown>[] | unknown>("/api/camera_config", signal);
  const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [];
  // Merge with active camera IDs to determine online status
  let activeIds = new Set<string>();
  try {
    const active = await apiGet<{ cameras: string[] }>("/api/cameras", signal);
    activeIds = new Set(active.cameras || []);
  } catch {}
  return items.map((c) => {
    const rawType = c.type;
    const camType: Camera["type"] = (rawType === "usb" || rawType === "rtsp" || rawType === "http_snapshot") ? rawType : "usb";
    return {
      id: String(c.id || ""),
      name: String(c.name || "未命名"),
      type: camType,
      address: typeof c.address === "string" || typeof c.address === "number" ? c.address : "",
      user: getString(c, "user"),
      brand: getString(c, "brand"),
      model: getString(c, "model"),
      go2rtcId: getString(c, "go2rtcId"),
      httpMjpegUrl: getString(c, "httpMjpegUrl"),
      ip: getString(c, "ip"),
      port: getNumber(c, "port"),
      status: activeIds.has(String(c.id || "")) ? CameraStatus.ONLINE : CameraStatus.OFFLINE,
      streamUrl: c.id ? `/video_feed?cam=${c.id}` : "",
      personCount: 0,
    };
  });
}

// --- Subscribe (SSE) ---

export function subscribeToCameras(callback: (cameras: Camera[]) => void): () => void {
  let activeCamIds = new Set<string>();

  // Fetch active cameras (those with live frames)
  async function refreshActive() {
    try {
      const data = await apiGet<{ cameras: string[] }>("/api/cameras");
      activeCamIds = new Set(data.cameras || []);
    } catch {}
  }

  // Initial fetch + periodic refresh
  refreshActive();
  const timer = setInterval(refreshActive, 5000);

  const unsubCameras = subscribeSse("cameras", (data: unknown) => {
    if (!Array.isArray(data)) { callback([]); return; }
    const cameras = data.map((raw: Record<string, unknown>) => transformCamera(raw, activeCamIds));
    callback(cameras);
  });
  const unsubStats = subscribeSse("camera_stats", () => refreshActive());

  return () => { clearInterval(timer); unsubCameras(); unsubStats(); };
}

export function subscribeToAlerts(callback: (alerts: Alert[]) => void): () => void {
  return subscribeSse("alerts", (data: unknown) => {
    if (!Array.isArray(data)) { callback([]); return; }
    callback(data.filter(isAlert));
  });
}

export function subscribeToSystemStatus(callback: (status: SystemStatus) => void): () => void {
  return subscribeSse("system_metrics", (data: unknown) => callback(transformSystemMetrics(data)));
}

export function subscribeToAuditLogs(callback: (logs: AuditLog[]) => void): () => void {
  return subscribeSse("audit_logs", (data: unknown) => {
    if (!Array.isArray(data)) { callback([]); return; }
    callback(data.filter(isAuditLog));
  });
}

// --- Camera Stats ---

export function subscribeToCameraStats(callback: (stats: Record<string, number>) => void): () => void {
  return subscribeSse("camera_stats", (data: unknown) => {
    if (isCameraStatsPayload(data)) {
      const map: Record<string, number> = {};
      for (const c of data.cameras) {
        map[c.camId] = c.personCount ?? 0;
      }
      callback(map);
    }
  });
}

// --- Stats ---

export async function fetchStats(): Promise<FullStatsResponse> {
  return apiGet("/api/stats");
}

/** Lightweight: returns behaviorCounts + totals only, no detection list. */
export async function fetchStatsSummary(signal?: AbortSignal): Promise<StatsSummary> {
  return apiGet("/api/stats/summary", signal);
}

export async function fetchTrendData(range: "day" | "week" | "month" = "day", signal?: AbortSignal): Promise<{ labels: string[]; data: Record<string, number[]> }> {
  return apiGet(`/api/stats/trend?range=${range}`, signal);
}

export async function fetchModelInfo(signal?: AbortSignal): Promise<ModelInfo> {
  return apiGet("/api/model_info", signal);
}

export async function fetchSystemInfo(signal?: AbortSignal): Promise<SystemInfo> {
  return apiGet("/api/system_info", signal);
}

// --- Write operations ---

export async function updateAlertStatus(alertId: string, status: "confirmed" | "ignored") {
  await apiPatch(`/api/alerts/${alertId}`, { status });
}

export type CameraInput = Omit<Camera, "id" | "status" | "streamUrl" | "personCount"> & { id?: string };

export async function addCamera(camera: CameraInput) {
  await apiPost("/api/camera_config", camera);
}

export async function updateCamera(cameraId: string, camera: Partial<CameraInput>) {
  await apiPut(`/api/camera_config/${cameraId}`, camera);
}

export async function deleteCamera(cameraId: string) {
  await apiDelete(`/api/camera_config/${cameraId}`);
}

export async function deleteAllCameras() {
  await apiDelete("/api/camera_config");
}

export async function testCamera(camera: { type: string; address: string | number; user?: string; password?: string }): Promise<{ reachable: boolean; message: string }> {
  return apiPost("/api/camera_config/test", camera);
}

export async function addAuditLog(log: Omit<AuditLog, "id" | "timestamp">) {
  await apiPost("/api/audit_logs", log);
}

// --- Screenshot ---

export async function takeScreenshot(type: string, cameraIds?: string[]): Promise<{ saved: number; alertIds: string[] }> {
  return apiPost("/api/screenshot", { type, cameraIds });
}

export interface UploadScreenshotResult {
  alertId: string;
  imageFilename: string;
  snapshotUrl: string;
}

export async function uploadScreenshot(params: {
  base64: string;
  type: string;
  cameraId: string;
  cameraName: string;
}): Promise<UploadScreenshotResult> {
  return apiPost("/api/screenshot/upload", params);
}

// --- Settings ---

export async function fetchSettings(signal?: AbortSignal): Promise<Settings> {
  const raw = await apiGet<Partial<Settings>>("/api/settings", signal);
  return {
    ...DEFAULT_DEVICE_SETTINGS,
    ...raw,
    aiSensitivity: {
      ...DEFAULT_DEVICE_SETTINGS.aiSensitivity,
      ...(raw?.aiSensitivity ?? {}),
    },
    notifications: {
      ...DEFAULT_DEVICE_SETTINGS.notifications,
      ...(raw?.notifications ?? {}),
    },
    storage: {
      ...DEFAULT_DEVICE_SETTINGS.storage,
      ...(raw?.storage ?? {}),
    },
  };
}

export async function updateSettings(settings: Partial<Settings>): Promise<Settings> {
  return apiPost("/api/settings", settings);
}

// --- Paged Alerts ---

export async function fetchAlertsPage(params: AlertFilterParams, signal?: AbortSignal): Promise<PageResponse<Alert>> {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.status) query.set("status", params.status);
  if (params.since) query.set("since", params.since);
  if (params.page != null) query.set("page", String(params.page));
  if (params.size != null) query.set("size", String(params.size));
  return apiGet(`/api/alerts?${query.toString()}`, signal);
}

export function exportAlerts(params?: AlertFilterParams): void {
  const query = new URLSearchParams();
  if (params?.type) query.set("type", params.type);
  if (params?.status) query.set("status", params.status);
  if (params?.since) query.set("since", params.since);
  apiDownload(`/api/alerts/export?${query.toString()}`);
}

// --- Paged Audit Logs ---

export async function fetchAuditLogsPage(params: AuditFilterParams, signal?: AbortSignal): Promise<PageResponse<AuditLog>> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.category) query.set("category", params.category);
  if (params.riskLevel) query.set("riskLevel", params.riskLevel);
  if (params.page != null) query.set("page", String(params.page));
  if (params.size != null) query.set("size", String(params.size));
  return apiGet(`/api/audit_logs?${query.toString()}`, signal);
}

export async function fetchAuditTrend(range: "day" | "week" = "day", signal?: AbortSignal): Promise<TrendData> {
  return apiGet(`/api/audit_logs/trend?range=${range}`, signal);
}

export function exportAuditLogs(params?: AuditFilterParams): void {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.category) query.set("category", params.category);
  if (params?.riskLevel) query.set("riskLevel", params.riskLevel);
  apiDownload(`/api/audit_logs/export?${query.toString()}`);
}

// --- Regional / Evidence / Compare ---

export async function fetchRegionalStats(signal?: AbortSignal): Promise<RegionalStat[]> {
  return apiGet("/api/stats/regional", signal);
}

export async function fetchEvidenceStats(signal?: AbortSignal): Promise<EvidenceStats> {
  return apiGet("/api/evidence/stats", signal);
}

export interface EvidenceItem {
  id: string;
  timestamp: string;
  actions: string[];
  personCount: number;
  cameraName: string;
  cameraId: string;
  imageFilename: string;
  snapshotUrl: string | null;
  confidence: number;
}

export interface EvidenceListResponse {
  items: EvidenceItem[];
  total: number;
  page: number;
  size: number;
}

export async function fetchEvidenceList(params: {
  date?: string;
  camera?: string;
  type?: string;
  page?: number;
  size?: number;
}, signal?: AbortSignal): Promise<EvidenceListResponse> {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.camera) query.set("camera", params.camera);
  if (params.type) query.set("type", params.type);
  if (params.page != null) query.set("page", String(params.page));
  if (params.size != null) query.set("size", String(params.size));
  return apiGet(`/api/evidence/list?${query.toString()}`, signal);
}

export async function openFolder(folderType: string): Promise<{ status: string; path: string; message: string }> {
  return apiPost("/api/open_folder", { folder_type: folderType });
}

export async function fetchFpsStats(signal?: AbortSignal): Promise<FpsStats> {
  return apiGet("/api/stats/fps", signal);
}

export async function fetchAutomationRate(signal?: AbortSignal): Promise<{ rate: number }> {
  return apiGet("/api/audit_logs/automation_rate", signal);
}

export function exportCsv(): void {
  apiDownload("/api/export/csv");
}

// --- Type guards ---

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isAlert(v: unknown): v is Alert {
  return isRecord(v) && typeof v.id === "string" && typeof v.type === "string";
}

function isAuditLog(v: unknown): v is AuditLog {
  return isRecord(v) && typeof v.id === "string" && typeof v.timestamp === "string";
}

interface CameraStatsEntry {
  camId: string;
  personCount: number;
}

interface CameraStatsPayload {
  cameras: CameraStatsEntry[];
}

function isCameraStatsPayload(v: unknown): v is CameraStatsPayload {
  return isRecord(v) && Array.isArray(v.cameras);
}

// --- Transformers ---

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function getNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" ? v : undefined;
}

function transformCamera(raw: Record<string, unknown>, activeCamIds?: Set<string>): Camera {
  const isActive = activeCamIds ? activeCamIds.has(String(raw.id || "")) : false;
  const rawType = raw.type;
  const camType: Camera["type"] = (rawType === "usb" || rawType === "rtsp" || rawType === "http_snapshot") ? rawType : "usb";
  return {
    id: String(raw.id || ""),
    name: String(raw.name || "未命名"),
    type: camType,
    address: typeof raw.address === "string" || typeof raw.address === "number" ? raw.address : "",
    user: getString(raw, "user"),
    brand: getString(raw, "brand"),
    model: getString(raw, "model"),
    go2rtcId: getString(raw, "go2rtcId"),
    ip: getString(raw, "ip"),
    port: getNumber(raw, "port"),
    status: isActive ? CameraStatus.ONLINE : (raw.status === CameraStatus.ONLINE || raw.status === CameraStatus.SIGNAL_LOST ? raw.status : CameraStatus.OFFLINE),
    streamUrl: raw.id ? `/video_feed?cam=${raw.id}` : "",
    personCount: typeof raw.personCount === "number" ? raw.personCount : 0,
  };
}

function transformSystemMetrics(raw: unknown): SystemStatus {
  // Handle double-encoded JSON from SSE
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = {}; }
  }
  const obj = isRecord(raw) ? raw : {};
  const rawServices = obj.services;
  const serviceArray = Array.isArray(rawServices) ? rawServices : [];
  return {
    cpuUsage: typeof obj.cpuPercent === "number" ? obj.cpuPercent : 0,
    memoryUsage: typeof obj.memoryPercent === "number" ? obj.memoryPercent : 0,
    storageUsage: typeof obj.diskPercent === "number" ? obj.diskPercent : 0,
    gpuUsage: typeof obj.gpuPercent === "number" ? obj.gpuPercent : 0,
    version: typeof obj.version === "string" ? obj.version : "unknown",
    lastUpdate: new Date().toLocaleString(),
    engine: typeof obj.engine === "string" ? obj.engine : undefined,
    onlineDevices: typeof obj.onlineDevices === "number" ? obj.onlineDevices : undefined,
    totalDevices: typeof obj.totalDevices === "number" ? obj.totalDevices : undefined,
    activeModels: typeof obj.activeModels === "number" ? obj.activeModels : undefined,
    totalModels: typeof obj.totalModels === "number" ? obj.totalModels : undefined,
    dataDirSizeMb: typeof obj.dataDirSizeMb === "number" ? obj.dataDirSizeMb : undefined,
    detectionCount: typeof obj.detectionCount === "number" ? obj.detectionCount : undefined,
    services: serviceArray.map((s) => transformService(s)),
  };
}

function transformService(s: unknown): SystemStatus["services"][number] {
  const obj = isRecord(s) ? s : {};
  const status = typeof obj.status === "string" ? obj.status : "unknown";
  return {
    name: typeof obj.name === "string" ? obj.name : (typeof obj.serviceName === "string" ? obj.serviceName : "Unknown"),
    uptime: typeof obj.uptime === "string" ? obj.uptime : "-",
    status,
    health: (obj.health === "healthy" || obj.health === "warning" || obj.health === "error")
      ? obj.health
      : (status === "Running" ? "healthy" : "warning"),
  };
}

// --- Annotation ---

export async function fetchAnnotationImages(signal?: AbortSignal): Promise<ImageItem[]> {
  return apiGet("/api/annotations/images", signal);
}

export async function fetchAnnotation(imageFilename: string, signal?: AbortSignal): Promise<AnnotationData | null> {
  try {
    return await apiGet(`/api/annotations/${encodeURIComponent(imageFilename)}`, signal);
  } catch (e: unknown) {
    if (e instanceof Error && e.message?.includes("标注不存在")) return null;
    throw e;
  }
}

export async function saveAnnotation(imageFilename: string, data: Partial<AnnotationData>): Promise<AnnotationData> {
  return apiPut(`/api/annotations/${encodeURIComponent(imageFilename)}`, data);
}

export async function deleteAnnotation(imageFilename: string): Promise<void> {
  await apiDelete(`/api/annotations/${encodeURIComponent(imageFilename)}`);
}

export function exportAnnotation(format: "yolo" | "coco" = "yolo"): void {
  apiDownload(`/api/annotations/export?format=${format}`);
}

export async function uploadAnnotationImage(file: File): Promise<{ filename: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/annotations/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "上传失败" }));
    throw new Error(err.error || "上传失败");
  }
  const data = await res.json();
  return data.data;
}

// --- ONVIF 自动发现 ---

export async function discoverCameras(): Promise<DiscoveredCamera[]> {
  const result = await apiPost<unknown>("/api/discover", undefined);
  if (Array.isArray(result)) return result;
  if (isRecord(result)) {
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.items)) return result.items;
    if (Array.isArray(result.cameras)) return result.cameras;
  }
  return [];
}

export async function batchAddCameras(cameras: Partial<Camera>[]): Promise<{ added: number; errors: string[] }> {
  const result = await apiPost<{ added: number; errors: string[] } | null>("/api/camera_config/batch", cameras);
  return result ?? { added: 0, errors: [] };
}

export async function getStreamStatus(): Promise<{ running: boolean; apiAvailable: boolean }> {
  return apiGet("/api/streams/status");
}
