import { apiPost } from '../lib/api';
import { fetchCameras, uploadScreenshot } from './dataService';
import { AlarmType, buildMonitorAlert, getPrimaryMonitorCamera } from './monitor-data';
import type { Camera } from '../types';

export async function loadMonitorCameras(signal?: AbortSignal) {
  return fetchCameras(signal);
}

export async function createMonitorAlert(type: AlarmType, cameras: Parameters<typeof buildMonitorAlert>[1], captured: string) {
  const alert = buildMonitorAlert(type, cameras, captured);
  await apiPost('/api/alerts', alert);
  return alert;
}

export async function uploadMonitorCapture(type: AlarmType, cameras: Camera[], captured: string) {
  if (!captured) return null;

  const camera = getPrimaryMonitorCamera(cameras);
  return uploadScreenshot({
    base64: captured,
    type,
    cameraId: camera?.id ?? 'cam-001',
    cameraName: camera?.name ?? '视频1',
  });
}
