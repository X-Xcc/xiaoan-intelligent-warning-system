import { Camera, Settings, CameraStatus } from '../types';
import type { DiscoveredCamera } from '../types';

export const DEFAULT_DEVICE_FORM = {
  name: '',
  type: 'rtsp' as 'usb' | 'rtsp' | 'http_snapshot',
  address: '',
  user: '',
  password: '',
};

export const DEFAULT_DEVICE_SETTINGS: Settings = {
  confidence: 0.5,
  iou: 0.45,
  interval: 2,
  maxPeople: 50,
  cooldown: 30,
  fatigueThreshold: 15,
  aiSensitivity: {
    fightDetection: 80,
    fallDetection: 75,
    climbingDetection: 70,
    crowdGathering: 65,
  },
  notifications: {
    email: true,
    sms: false,
    centralAlarm: true,
  },
  storage: {
    autoOverwrite: true,
  },
};

export const TYPE_LABELS: Record<string, string> = {
  usb: 'USB 摄像头',
  rtsp: 'RTSP 网络摄像机',
  http_snapshot: 'HTTP 快照',
};

export function toDevicePayload(form: typeof DEFAULT_DEVICE_FORM) {
  return {
    name: form.name,
    type: form.type,
    address: form.type === 'usb' ? Number(form.address) : form.address,
    user: form.user || undefined,
    password: form.password || undefined,
  };
}

export function toDeviceForm(camera: Camera) {
  return {
    name: camera.name,
    type: camera.type,
    address: String(camera.address),
    user: camera.user || '',
    password: camera.password || '',
  };
}

export function createSelectedDiscoverySet(devices: DiscoveredCamera[]): Set<string> {
  return new Set(devices.map(device => device.ip));
}

export function toggleSelectedDiscovery(selected: Set<string>, ip: string, checked: boolean): Set<string> {
  const next = new Set(selected);
  if (checked) next.add(ip);
  else next.delete(ip);
  return next;
}

export function buildBatchCameraPayload(discovered: DiscoveredCamera[], selected: Set<string>): Partial<Camera>[] {
  return discovered
    .filter(device => selected.has(device.ip))
    .map(device => ({
      name: device.name,
      type: 'rtsp' as const,
      address: device.rtspUrl,
      ip: device.ip,
      brand: device.brand || undefined,
      model: device.model || undefined,
      port: 554,
    }));
}

export function getOnlineCameraCount(cameras: Camera[]): number {
  return cameras.filter(camera => camera.status === CameraStatus.ONLINE).length;
}

export function getDeviceStorageBarWidth(storageUsage: number) {
  return `${Math.min(storageUsage, 100)}%`;
}
