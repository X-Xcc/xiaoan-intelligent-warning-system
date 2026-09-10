import type { CommandResponse, CommandRoute, RequestLedger } from './command-workflow';

export const commandApiBase = (import.meta.env.VITE_API_BASE_URL
  ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');
export class CommandApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function commandRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${commandApiBase}${path}`, {
    ...options, signal: options.signal ?? AbortSignal.timeout(15000),
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new CommandApiError(
    typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail)
      ? body.detail.map((item: { msg?: string }) => item.msg || '字段不合法').join('；')
      : body.detail?.message ?? `请求失败 (${response.status})`, response.status);
  return body as T;
}
export const commandContext = (id: string, token: string, signal?: AbortSignal) =>
  commandRequest<CommandResponse>(`/command/events/${encodeURIComponent(id)}/context`, token, { signal });
export async function reconcileCommandRequests(id: string, token: string, ledger: RequestLedger) {
  let snapshot = await commandContext(id, token);
  for (const pending of ledger.pending(id)) {
    try {
      const receipt = await commandRequest<CommandResponse>(
        `/command/events/${encodeURIComponent(id)}/receipts/${encodeURIComponent(pending.payload.requestId)}`, token);
      if (receipt.event.id !== id) throw new CommandApiError('回执与当前事件不一致', 502);
      if (receipt.command.version >= snapshot.command.version) snapshot = receipt;
      ledger.resolve(id, pending.action);
    } catch (cause) {
      if (!(cause instanceof CommandApiError) || cause.status !== 404) throw cause;
      // A 404 can race an in-flight commit. Only a newer version rules out that old write.
      const expectedVersion = pending.payload.expectedVersion;
      if (typeof expectedVersion === 'number' && snapshot.command.version > expectedVersion) {
        ledger.resolve(id, pending.action);
      }
    }
  }
  return { snapshot, pendingCount: ledger.pending(id).length };
}
export const commandRoute = (id: string, staffId: string, token: string) =>
  commandRequest<{ route: CommandRoute }>(`/command/events/${encodeURIComponent(id)}/route-preview?staffId=${encodeURIComponent(staffId)}`, token);
export const commandAction = (id: string, action: string, payload: Record<string, unknown>, token: string) =>
  commandRequest<CommandResponse>(`/command/events/${encodeURIComponent(id)}/${action}`, token,
    { method: action === 'intake' ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
export async function commandUpload(id: string, file: File, token: string) {
  const form = new FormData();
  form.append('eventId', id);
  form.append('file', file);
  return commandRequest<{ evidence: { uploadId: string; name: string; url: string; kind: string } }>(
    '/events/evidence', token, { method: 'POST', body: form });
}
export async function protectedMaterial(url: string, token: string) {
  if (!/^\/api\/events\/evidence\/cmd-[a-f0-9]+\.(png|jpg|webp|mp4|webm)$/.test(url)) {
    throw new Error('材料地址不属于受控上传目录');
  }
  const response = await fetch(`${commandApiBase}${url.slice(4)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('材料不可访问，请重新核对账号和文件');
  return URL.createObjectURL(await response.blob());
}
