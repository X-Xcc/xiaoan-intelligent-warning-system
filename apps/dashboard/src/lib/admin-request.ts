export function createAdminRequest(apiBase: string) {
  const base = new URL(apiBase, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  const prefix = base.pathname.replace(/\/+$/, '');
  return async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const apiPath = path.startsWith(`${prefix}/`) ? path : `${prefix}/admin${path}`;
    const url = new URL(/^https?:\/\//.test(path) ? path : apiPath, base.origin);
    if (url.origin !== base.origin || !url.pathname.startsWith(`${prefix}/`)) {
      throw new Error('Request is outside the configured API');
    }
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('X-Operator', 'platform-governance');
    const response = await fetch(url.href, { ...init, headers, redirect: 'error', cache: 'no-store' });
    if (!response.ok) {
      const error = new Error(`管理请求失败 (${response.status})`);
      throw Object.assign(error, { status: response.status });
    }
    return await response.json() as T;
  };
}
