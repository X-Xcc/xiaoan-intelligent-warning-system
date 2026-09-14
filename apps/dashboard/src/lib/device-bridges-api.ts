import { useCallback, useEffect, useRef, useState } from 'react';

export type BridgeKind = 'go2' | 'hikvision' | 'dahua' | 'rtsp' | 'http_snapshot' | 'http_mjpeg';
export type BridgeStatus = 'stopped' | 'connecting' | 'online' | 'reconnecting' | 'error';
export type DeviceInput = {
  name: string;
  kind: BridgeKind;
  host: string;
  port: number;
  username?: string;
  password?: string;
  rtspPath?: string;
  channel: number;
  stream: 'main' | 'sub';
  go2Mode?: 'LocalSTA' | 'LocalAP';
  httpScheme?: 'http' | 'https';
  httpPath?: string;
  autoStart?: boolean;
};
export type BridgeDevice = Omit<DeviceInput, 'password'> & {
  id: string;
  hasPassword: boolean;
  status: BridgeStatus;
  online: boolean;
  fps: number | null;
  width: number | null;
  height: number | null;
  frameCount: number;
  lastFrameAt: string | number | null;
  lastError: string | null;
  stage: string | null;
  logs: Array<{ at: string; level: string; message: string }>;
  feedUrl?: string;
  snapshotUrl?: string;
  webrtc?: boolean;
  createdAt: string;
  updatedAt: string;
};
export type BridgeInventory = {
  items: BridgeDevice[];
  bindings: Array<string | null>;
  runtime: { av: boolean; opencv: boolean; go2: boolean; running: number; maxDevices: number };
};
export type BridgeAuth = { enabled: boolean; authorized: boolean; tokenConfigured: boolean };
export type BridgeTestResult = {
  ok: boolean;
  device: BridgeDevice;
  checks: Array<{ stage: string; ok: boolean; message: string }>;
};
export type BridgeReadiness = {
  ready: boolean;
  reasons: Array<{ code: string; message: string; slot?: number; deviceId?: string }>;
  requiredBindings: Array<{ slot: number; id: string }>;
  devices: Array<{ slot: number; id: string; name: string; kind: BridgeKind; online: boolean; status: BridgeStatus; frameCount: number; lastFrameAt: string | number | null; stale: boolean }>;
  runtime: BridgeInventory['runtime'];
  staleAfterSeconds: number;
};

export const bridgeKindLabels: Record<BridgeKind, string> = {
  go2: 'Go2 摄像头', hikvision: '海康威视', dahua: '大华', rtsp: '通用 RTSP',
  http_snapshot: 'HTTP 快照', http_mjpeg: 'HTTP MJPEG',
};
export function isHttpBridge(kind: BridgeKind): boolean {
  return kind === 'http_snapshot' || kind === 'http_mjpeg';
}
export function isRtspBridge(kind: BridgeKind): boolean {
  return kind === 'rtsp' || kind === 'hikvision' || kind === 'dahua';
}
export const bridgeStatusLabels: Record<BridgeStatus, string> = {
  stopped: '已停止', connecting: '连接中', online: '在线', reconnecting: '重连中', error: '异常',
};
export function bridgeStageLabel(stage: string | null | undefined): string {
  const labels: Record<string, string> = {
    network: '网络连接', auth: '设备认证', stream: '码流协商', decode: '视频解码',
    connecting: '连接设备', online: '画面接收', reconnecting: '重新连接', stopped: '已停止',
    config: '配置校验', runtime: '运行环境', timeout: '检测超时', idle: '等待连接',
    dns: '主机解析', tcp: '网络连接', first_frame: '等待首帧', firstFrame: '等待首帧',
  };
  return stage ? labels[stage] ?? stage : '未记录';
}
const API_BASE = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api').replace(/\/+$/, '');
const BRIDGE_BASE = `${API_BASE}/device-bridges`;
let adminToken = '';

export class BridgeApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'BridgeApiError';
    this.status = status;
  }
}

export function redactBridgeMessage(value: string): string {
  return value
    .replace(/((?:rtsps?|https?):\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
    .replace(/((?:password|passwd|pwd|token|authorization)\s*[=:]\s*)[^\s&,;]+/gi, '$1[REDACTED]');
}

export async function bridgeRequest<T>(path: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  init.signal?.addEventListener('abort', cancel, { once: true });
  if (init.signal?.aborted) cancel();
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (adminToken && !headers.has('X-Admin-Token')) headers.set('X-Admin-Token', adminToken);
  try {
    const response = await fetch(`${BRIDGE_BASE}${path}`, {
      ...init, headers, credentials: 'include', cache: 'no-store', signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) adminToken = '';
      const detail = typeof payload?.detail === 'string' ? redactBridgeMessage(payload.detail) : `设备服务请求失败 (${response.status})`;
      throw new BridgeApiError(detail, response.status);
    }
    if (payload === null) throw new BridgeApiError('设备服务返回了无效数据', 502);
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new BridgeApiError('请求超时，操作结果尚未确认，请刷新设备状态', 408);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}

export async function createBridgeSession(token?: string, signal?: AbortSignal) {
  const headers = new Headers();
  if (token !== undefined) headers.set('X-Admin-Token', token.trim());
  const payload = await bridgeRequest<{ authorized: boolean; expiresIn: number }>('/session', { method: 'POST', headers, signal });
  if (payload.authorized !== true) throw new BridgeApiError('服务端未确认预览授权', 401);
  if (!Number.isFinite(payload.expiresIn) || payload.expiresIn <= 0) throw new BridgeApiError('预览会话有效期无效', 502);
  signal?.throwIfAborted();
  if (token !== undefined) adminToken = token.trim();
  return payload.expiresIn;
}

export function bridgeSessionRenewAt(expiresIn: number, now = Date.now()): number {
  return now + expiresIn * 500;
}

export async function closeBridgeSession(signal?: AbortSignal) {
  try { await bridgeRequest('/session', { method: 'DELETE', signal }); }
  finally { adminToken = ''; }
}

export function bridgeMediaUrl(id: string, type: 'feed' | 'snapshot'): string {
  return `${BRIDGE_BASE}/${encodeURIComponent(id)}/${type}`;
}

let activeSnapshots = 0;
const snapshotQueue: Array<() => void> = [];

function drainSnapshots() {
  while (activeSnapshots < 3 && snapshotQueue.length) snapshotQueue.shift()?.();
}

export function requestBridgeSnapshot(id: string, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let started = false;
    const cancel = () => {
      controller.abort();
      if (!started) {
        const index = snapshotQueue.indexOf(start);
        if (index >= 0) snapshotQueue.splice(index, 1);
        signal?.removeEventListener('abort', cancel);
        reject(new DOMException('Snapshot cancelled', 'AbortError'));
      }
    };
    const start = () => {
      started = true;
      activeSnapshots += 1;
      // Short-lived snapshots reserve HTTP/1 connections for inventory and MJPEG focus.
      const timer = setTimeout(() => controller.abort(), 3000);
      void (async () => {
        try {
          const headers = new Headers();
          if (adminToken) headers.set('X-Admin-Token', adminToken);
          const response = await fetch(bridgeMediaUrl(id, 'snapshot'), {
            headers, credentials: 'include', cache: 'no-store', signal: controller.signal,
          });
          if (!response.ok) throw new BridgeApiError(`画面读取失败 (${response.status})`, response.status);
          if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('image/jpeg')) {
            throw new BridgeApiError('视频服务未返回 JPEG 画面', 502);
          }
          const image = await response.blob();
          controller.signal.throwIfAborted();
          if (!image.size) throw new BridgeApiError('视频服务返回了空画面', 502);
          resolve(image);
        } catch (failure) {
          reject(controller.signal.aborted && !signal?.aborted
            ? new BridgeApiError('画面读取超时', 408) : failure);
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
          activeSnapshots -= 1;
          drainSnapshots();
        }
      })();
    };
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    snapshotQueue.push(start);
    drainSnapshots();
  });
}

export function validateBindings(bindings: unknown): Array<string | null> {
  if (!Array.isArray(bindings) || bindings.length !== 16 || bindings.some((id) => id !== null && (typeof id !== 'string' || !id.trim()))) {
    throw new BridgeApiError('视频槽位数据不完整，需要 16 个设备 ID 或空值', 502);
  }
  return [...bindings];
}

export async function getBridgeInventory(signal?: AbortSignal): Promise<BridgeInventory> {
  const payload = await bridgeRequest<BridgeInventory>('/', { signal });
  if (!Array.isArray(payload.items) || !payload.runtime || payload.items.some((device) => !device.id || !device.name || !(device.kind in bridgeKindLabels) || !(device.status in bridgeStatusLabels))) {
    throw new BridgeApiError('设备清单格式不完整，请检查服务版本', 502);
  }
  return { ...payload, bindings: validateBindings(payload.bindings) };
}

export async function getBridgeReadiness(signal?: AbortSignal): Promise<BridgeReadiness> {
  const payload = await bridgeRequest<BridgeReadiness>('/readiness', { signal });
  if (typeof payload.ready !== 'boolean' || !Array.isArray(payload.reasons)
      || !Array.isArray(payload.requiredBindings) || !Array.isArray(payload.devices)) {
    throw new BridgeApiError('实时摄像头就绪状态格式不完整，请检查服务版本', 502);
  }
  return payload;
}

export function rtspTemplate(kind: BridgeKind, channel: number, stream: 'main' | 'sub'): string {
  if (kind === 'hikvision') return `/Streaming/Channels/${channel}${stream === 'sub' ? '02' : '01'}`;
  if (kind === 'dahua') return `/cam/realmonitor?channel=${channel}&subtype=${stream === 'sub' ? 1 : 0}`;
  return '';
}

export function bridgeEditorPath(device?: Pick<DeviceInput, 'kind' | 'channel' | 'stream' | 'rtspPath'>) {
  const kind = device?.kind ?? 'rtsp';
  const template = device ? rtspTemplate(kind, device.channel, device.stream) : '';
  const path = device?.rtspPath ?? '';
  return {
    rtspPath: path || template,
    customPath: kind === 'rtsp' || Boolean(path && path !== template),
  };
}

export function bridgeModeFields(input: DeviceInput, changed: Partial<DeviceInput>): Partial<DeviceInput> {
  if (changed.kind) {
    const http = isHttpBridge(changed.kind);
    const scheme = input.httpScheme ?? 'http';
    return {
      username: '', password: '',
      port: http ? scheme === 'https' ? 443 : 80 : 554,
      channel: 1, stream: 'main',
      rtspPath: rtspTemplate(changed.kind, 1, 'main'),
      httpScheme: http ? scheme : 'http',
      httpPath: http ? input.httpPath ?? '' : '',
      ...(changed.kind === 'go2' && input.go2Mode === 'LocalAP' ? { host: '192.168.12.1' } : {}),
    };
  }
  if (changed.httpScheme && isHttpBridge(input.kind)) return { port: changed.httpScheme === 'https' ? 443 : 80 };
  if (changed.go2Mode === 'LocalAP' && input.kind === 'go2') return { host: '192.168.12.1' };
  return {};
}

function validBridgePath(path: string): boolean {
  let decoded = path;
  for (let index = 0; index < 5; index += 1) {
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\s@#\\:\u0000-\u001f\u007f]/.test(decoded)) return false;
    const url = new URL(decoded, 'http://bridge.invalid');
    for (const key of url.searchParams.keys()) {
      if (/^(user|username|password|passwd|pwd|pass|token|accesstoken|refreshtoken|auth|authorization|credential|credentials|secret|key|apikey|signature)$/.test(key.toLowerCase().replace(/[^a-z]/g, ''))) return false;
    }
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return true;
      decoded = next;
    } catch { return false; }
  }
  return false;
}

export function bridgeDeviceAddress(device: Pick<DeviceInput, 'kind' | 'host' | 'port' | 'httpScheme'>): string {
  const host = device.host.includes(':') && !device.host.startsWith('[') ? `[${device.host}]` : device.host;
  if (device.kind === 'go2') return host;
  return `${isHttpBridge(device.kind) ? `${device.httpScheme ?? 'http'}://` : ''}${host}:${device.port}`;
}

export function validateDeviceInput(input: DeviceInput): Partial<Record<keyof DeviceInput, string>> {
  const errors: Partial<Record<keyof DeviceInput, string>> = {};
  if (!input.name?.trim() || input.name.trim().length > 80) errors.name = '请输入 1 至 80 字的设备名称';
  if (!(input.kind in bridgeKindLabels)) errors.kind = '请选择设备类型';
  if (!input.host?.trim() || /[\s/@?#\\]/.test(input.host) || input.host.includes('://')) errors.host = '仅填写 IP 或主机名，不含协议、端口或凭据';
  else if (input.host.includes(':') && !/^\[?[0-9a-f:]+\]?$/i.test(input.host)) errors.host = '端口请单独填写';
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) errors.port = '端口范围为 1 至 65535';
  if (isRtspBridge(input.kind)) {
    if (!Number.isInteger(input.channel) || input.channel < 1 || input.channel > 256) errors.channel = '通道范围为 1 至 256';
    if (!['main', 'sub'].includes(input.stream)) errors.stream = '请选择主码流或子码流';
    if (!validBridgePath(input.rtspPath?.trim() ?? '')) errors.rtspPath = '填写以 / 开头的路径，凭据请使用独立字段';
  }
  if (input.kind === 'go2' && !['LocalSTA', 'LocalAP'].includes(input.go2Mode ?? '')) errors.go2Mode = '请选择 Go2 连接模式';
  if (input.kind === 'go2' && input.go2Mode === 'LocalAP' && input.host !== '192.168.12.1') errors.host = 'LocalAP 主机必须为 192.168.12.1';
  if (isHttpBridge(input.kind)) {
    if (!['http', 'https'].includes(input.httpScheme ?? 'http')) errors.httpScheme = '请选择 HTTP 或 HTTPS';
    if (!validBridgePath(input.httpPath?.trim() ?? '')) errors.httpPath = '填写以 / 开头的 HTTP 路径，不含完整 URL 或凭据';
  }
  return errors;
}

export function deviceInput(input: DeviceInput, previousKind?: BridgeKind): DeviceInput {
  const network = isRtspBridge(input.kind) || isHttpBridge(input.kind);
  const clean: DeviceInput = {
    name: input.name.trim(), kind: input.kind, host: input.host.trim(), port: network ? input.port : 554,
    channel: isRtspBridge(input.kind) ? input.channel : 1, stream: isRtspBridge(input.kind) ? input.stream : 'main',
    go2Mode: input.kind === 'go2' ? input.go2Mode ?? 'LocalSTA' : 'LocalSTA',
    autoStart: input.autoStart ?? false,
  };
  if (network) {
    clean.username = input.username?.trim() ?? '';
    // Blank same-kind edits preserve credentials; a type change discards old secrets.
    if (input.password) clean.password = input.password;
    else if (previousKind && previousKind !== input.kind) clean.password = '';
  }
  if (isRtspBridge(input.kind)) clean.rtspPath = input.rtspPath?.trim() ?? '';
  if (isHttpBridge(input.kind)) {
    clean.httpScheme = input.httpScheme ?? 'http';
    clean.httpPath = input.httpPath?.trim() ?? '';
  }
  return clean;
}

export function saveBridge(input: DeviceInput, id?: string, signal?: AbortSignal, previousKind?: BridgeKind) {
  return bridgeRequest<{ device: BridgeDevice }>(id ? `/${encodeURIComponent(id)}` : '/', {
    method: id ? 'PUT' : 'POST', body: JSON.stringify(deviceInput(input, previousKind)), signal,
  });
}
export function controlBridge(id: string, action: 'start' | 'stop' | 'restart', signal?: AbortSignal) {
  return bridgeRequest<{ device: BridgeDevice }>(`/${encodeURIComponent(id)}/${action}`, { method: 'POST', signal });
}
export function testBridge(id: string, signal?: AbortSignal) {
  return bridgeRequest<BridgeTestResult>(`/${encodeURIComponent(id)}/test`, { method: 'POST', signal }, 20000);
}
export function deleteBridge(id: string, signal?: AbortSignal) {
  return bridgeRequest<{ deleted: boolean }>(`/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
}
export async function saveBridgeBindings(bindings: Array<string | null>, signal?: AbortSignal) {
  const payload = await bridgeRequest<{ bindings: Array<string | null> }>('/bindings', {
    method: 'PUT', body: JSON.stringify({ bindings: validateBindings(bindings) }), signal,
  });
  return { bindings: validateBindings(payload.bindings) };
}

export type BridgeConnectStage = 'validate' | 'start' | 'decode' | 'preview' | 'bind';

export async function connectBridgeToSlot(
  id: string, slot: number, signal?: AbortSignal, progress: (stage: BridgeConnectStage) => void = () => {},
): Promise<BridgeTestResult & { bindings: Array<string | null> }> {
  if (!Number.isInteger(slot) || slot < 1 || slot > 16) throw new BridgeApiError('请选择 1 至 16 的视频槽位', 400);
  signal?.throwIfAborted();
  progress('validate');
  const before = await getBridgeInventory(signal);
  const original = before.items.find((device) => device.id === id);
  if (!original) throw new BridgeApiError('设备不存在或已删除', 404);
  const index = slot - 1;
  if (before.bindings[index] && before.bindings[index] !== id) throw new BridgeApiError('该视频槽位已被其他设备占用', 409);
  const active = ['online', 'connecting', 'reconnecting'].includes(original.status);
  let started = false;
  let bindingAttempted = false;
  try {
    progress('start');
    if (!active) {
      const response = await controlBridge(id, 'start', signal);
      started = true;
      if (response.device?.id !== id) throw new BridgeApiError('服务端未确认设备启动结果', 502);
    }
    progress('decode');
    const result = await testBridge(id, signal);
    if (result.device?.id !== id || !Array.isArray(result.checks)) throw new BridgeApiError('连接检测返回格式不完整', 502);
    if (result.ok !== true || !hasFreshFrame(result.device) || !result.checks.some((check) => check.stage === 'decode' && check.ok === true)) {
      const failure = result.checks.find((check) => !check.ok);
      throw new BridgeApiError(failure ? `${bridgeStageLabel(failure.stage)}：${redactBridgeMessage(failure.message)}` : '未收到可用的实时视频帧', 503);
    }
    progress('preview');
    await requestBridgeSnapshot(id, signal);
    signal?.throwIfAborted();
    progress('bind');
    const latest = await getBridgeInventory(signal);
    const current = latest.items.find((device) => device.id === id);
    if (!current || bridgeSourceKey(current) !== bridgeSourceKey(original)) {
      throw new BridgeApiError('设备配置已被其他会话修改，请重新连接', 409);
    }
    if (JSON.stringify(latest.bindings) !== JSON.stringify(before.bindings)) {
      throw new BridgeApiError('槽位已被其他会话修改，请重新选择后接入', 409);
    }
    const bindings = latest.bindings.map((value, position) => position === index ? id : value);
    if (latest.bindings[index] !== id) {
      // Do not stop a decoder after an ambiguous binding write; it may now serve the wall.
      bindingAttempted = true;
      const saved = await saveBridgeBindings(bindings, signal);
      if (JSON.stringify(saved.bindings) !== JSON.stringify(bindings)) throw new BridgeApiError('服务端未确认槽位绑定，请刷新核对', 502);
    }
    const confirmed = await getBridgeInventory(signal);
    const device = confirmed.items.find((item) => item.id === id);
    if (confirmed.bindings[index] !== id) throw new BridgeApiError('槽位绑定已变化，请刷新核对', 409);
    if (!device || !hasFreshFrame(device)) throw new BridgeApiError('槽位已绑定，但实时画面已中断，请检查设备', 503);
    return { ...result, device, bindings: confirmed.bindings };
  } catch (failure) {
    if (started && !bindingAttempted) {
      try {
        // Cleanup must still run after the caller cancels the connection attempt.
        await controlBridge(id, 'stop');
      } catch {
        throw new BridgeApiError(`${bridgeErrorMessage(failure)}；停止连接的结果未确认，请刷新设备状态`, 503);
      }
    }
    throw failure;
  }
}

export function frameTime(value: BridgeDevice['lastFrameAt']): number {
  return typeof value === 'number' ? value < 1e12 ? value * 1000 : value : typeof value === 'string' ? Date.parse(value) : NaN;
}
export function hasFreshFrame(device: Pick<BridgeDevice, 'online' | 'status' | 'frameCount' | 'lastFrameAt'>, now = Date.now()): boolean {
  const age = now - frameTime(device.lastFrameAt);
  return device.online === true && device.status === 'online' && device.frameCount > 0 && Number.isFinite(age) && age >= -5000 && age <= 10000;
}
export function bridgeSourceKey(device: BridgeDevice): string {
  return JSON.stringify([device.id, device.kind, device.host, device.port, device.username, device.rtspPath, device.channel, device.stream, device.go2Mode, device.httpScheme ?? 'http', device.httpPath ?? '', device.hasPassword, device.updatedAt]);
}
export function bridgeErrorMessage(error: unknown): string {
  return error instanceof Error ? redactBridgeMessage(error.message) : '设备服务不可用，请重试';
}

export function useBridgeInventory() {
  const [inventory, setInventory] = useState<BridgeInventory | null>(null);
  const [readiness, setReadiness] = useState<BridgeReadiness | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [revision, setRevision] = useState(0);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const mounted = useRef(false);
  const mutating = useRef(false);
  const pollController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const sessionReady = useRef(false);
  const sessionRenewAt = useRef(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const onFailure = useCallback((failure: unknown) => {
    setError(bridgeErrorMessage(failure));
    setConnected(false);
    if (failure instanceof BridgeApiError && failure.status === 401) {
      sessionReady.current = false;
      setPreviewReady(false);
      setInventory(null);
      setReadiness(null);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      window.clearInterval(clock);
      mutationController.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (cancelled) return;
      if (mutating.current) { timer = setTimeout(poll, 1000); return; }
      const controller = new AbortController();
      pollController.current = controller;
      setRefreshing(true);
      try {
        if (!sessionReady.current || Date.now() >= sessionRenewAt.current) {
          const expiresIn = await createBridgeSession(undefined, controller.signal);
          if (cancelled || controller.signal.aborted) return;
          sessionRenewAt.current = bridgeSessionRenewAt(expiresIn);
          sessionReady.current = true;
          setPreviewReady(true);
          setPreviewEpoch((value) => value + 1);
        }
        const payload = await getBridgeInventory(controller.signal);
        const readinessPayload = await getBridgeReadiness(controller.signal);
        if (cancelled || controller.signal.aborted) return;
        setInventory(payload);
        setReadiness(readinessPayload);
        setUpdatedAt(Date.now());
        setConnected(true);
        setError('');
      } catch (failure) {
        if (!cancelled && !controller.signal.aborted) onFailure(failure);
      } finally {
        if (!cancelled) {
          setRefreshing(false);
          timer = setTimeout(poll, 3000);
        }
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); pollController.current?.abort(); };
  }, [revision, onFailure]);

  const mutate = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (mutating.current) throw new BridgeApiError('另一项设备操作尚未结束', 409);
    mutating.current = true;
    setBusy(true);
    setConnected(false);
    pollController.current?.abort();
    const controller = new AbortController();
    mutationController.current = controller;
    try {
      const result = await operation(controller.signal);
      if (mounted.current && !controller.signal.aborted) setPreviewEpoch((value) => value + 1);
      return result;
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) onFailure(failure);
      throw failure;
    } finally {
      mutating.current = false;
      if (mounted.current) { setBusy(false); refresh(); }
    }
  }, [onFailure, refresh]);

  return {
    inventory, readiness, previewReady, error, refreshing, busy, updatedAt, now, previewEpoch,
    available: connected && now - updatedAt <= 10000, refresh, mutate,
  };
}
