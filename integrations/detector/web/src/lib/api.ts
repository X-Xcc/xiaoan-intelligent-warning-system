export { API_BASE, getWorkspaceApiUrl, isZeroPort } from './api-config';
export { apiDownload } from './api-download';
export { apiDelete, apiFetch, apiGet, apiPatch, apiPost, apiPut, apiUpload } from './api-http';
export { subscribeSse } from './api-sse';

import { apiFetch } from './api-http';

export async function startDetection(): Promise<{ status: string; pid?: number; message?: string }> {
  const response = await apiFetch('/api/detection/start', { method: 'POST' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || body.message || '请求失败');
  return body.data;
}

export async function stopDetection(): Promise<{ status: string; pid?: number }> {
  const response = await apiFetch('/api/detection/stop', { method: 'POST' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || body.message || '请求失败');
  return body.data;
}

export async function getDetectionStatus(): Promise<{ running: boolean }> {
  const response = await apiFetch('/api/detection/status');
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || body.message || '请求失败');
  return body.data;
}
