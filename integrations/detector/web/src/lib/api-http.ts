import { clearToken } from './auth-token';
import { clearRequestState, cachedFetch, invalidateCache } from './api-cache';
import { getWorkspaceApiUrl } from './api-config';
import { getToken } from './auth-token';

function createJsonHeaders(headers?: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...(headers as Record<string, string> | undefined) };
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...createJsonHeaders(options.headers),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(getWorkspaceApiUrl(path), {
    ...options,
    headers,
  });
}

function unwrapResponse<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data;
  }

  return json as T;
}

function handleResponseError(response: Response, body: unknown): never {
  const err = (body ?? {}) as { error?: string; message?: string };
  if (response.status === 401) {
    clearToken();
    clearRequestState();
    window.dispatchEvent(new Event('rtk:token-invalid'));
  }

  throw new Error(err.error || err.message || '请求失败');
}

async function readJsonOrError(response: Response): Promise<unknown> {
  return response.json().catch(() => ({ error: response.statusText }));
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    handleResponseError(response, await readJsonOrError(response));
  }

  return unwrapResponse<T>(await response.json());
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return cachedFetch(path, () => requestJson<T>(path, { signal }));
}

export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  invalidateCache(path);
  return requestJson<T>(path, { method: 'POST', body: JSON.stringify(body), signal });
}

export async function apiPatch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  invalidateCache(path);
  return requestJson<T>(path, { method: 'PATCH', body: JSON.stringify(body), signal });
}

export async function apiPut<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  invalidateCache(path);
  return requestJson<T>(path, { method: 'PUT', body: JSON.stringify(body), signal });
}

export async function apiDelete<T>(path: string, signal?: AbortSignal): Promise<T> {
  invalidateCache(path);
  return requestJson<T>(path, { method: 'DELETE', signal });
}

export async function apiUpload<T>(path: string, file: File, onProgress?: (pct: number) => void): Promise<T> {
  const token = getToken();
  invalidateCache(path);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', getWorkspaceApiUrl(path));
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = event => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(unwrapResponse<T>(json));
        } else {
          reject(new Error(json.error || json.message || '上传失败'));
        }
      } catch {
        reject(new Error('上传失败'));
      }
    };

    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.onabort = () => reject(new Error('上传已取消'));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

export async function postDetectionAction<T>(path: string): Promise<T> {
  return requestJson<T>(path, { method: 'POST' });
}
