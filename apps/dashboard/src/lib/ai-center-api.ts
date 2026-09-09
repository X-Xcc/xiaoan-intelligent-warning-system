export type AIResultContract = {
  result: string;
  confidence: number;
  evidence?: string[];
  evidenceTime?: string | null;
  explanation?: string;
  humanReviewRequired: boolean;
  reviewStatus: 'pending' | 'confirmed' | 'rejected' | 'not_required';
  fallbackAction?: string;
  auditId: string;
};

export type AiRuntimeSnapshot = {
  model: { name: string; status: string; providers: string[] };
  capabilities: Array<{ name: string; scope: string; status: string }>;
  agents: Array<{ name: string; status: string; currentTask: string; latency: string }>;
  skills: Array<{ name: string; status: string; trigger: string; confidence: number }>;
  mcpConnectors: Array<{ name: string; status: string; scope: string; lastSync: string; writeAllowed: boolean }>;
  sampleResult?: AIResultContract;
};

export type AiReviewUser = {
  openid: string;
  displayName?: string;
  role?: string;
  permissions: string[];
};

const base = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : '/api')).replace(/\/$/, '');

export class AiCenterApiError extends Error {
  status: number;

  constructor(status: number) {
    const messages: Record<number, string> = {
      401: '业务令牌无效或已过期，请重新登录。',
      403: '当前账号没有 AI 审核权限，请联系管理员。',
      404: '审核结果不存在，请刷新运行态后核对。',
      408: '请求超时，请重试。',
      422: '审核内容不符合要求，请核对后重试。',
      502: '服务返回内容不完整，请重试。',
    };
    super(messages[status] ?? 'AI 服务暂不可用，请重试。');
    this.name = 'AiCenterApiError';
    this.status = status;
  }
}

async function request(path: string, options: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    controller.signal.throwIfAborted();
    const response = await fetch(`${base}${path}`, {
      ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
    });
    controller.signal.throwIfAborted();
    if (!response.ok) throw new AiCenterApiError(response.status);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      controller.signal.throwIfAborted();
      throw new AiCenterApiError(502);
    }
    controller.signal.throwIfAborted();
    return payload;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timedOut) throw new AiCenterApiError(408);
    if (error instanceof AiCenterApiError) throw error;
    throw new AiCenterApiError(503);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function fields(value: unknown, names: string[]): value is Record<string, unknown> {
  return record(value) && names.every((name) => typeof value[name] === 'string');
}

function validResult(value: unknown): value is AIResultContract {
  return fields(value, ['result', 'auditId', 'reviewStatus'])
    && Boolean((value.auditId as string).trim())
    && typeof value.confidence === 'number' && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 100
    && typeof value.humanReviewRequired === 'boolean'
    && ['pending', 'confirmed', 'rejected', 'not_required'].includes(value.reviewStatus as string)
    && (value.evidence === undefined || strings(value.evidence))
    && (value.evidenceTime == null || typeof value.evidenceTime === 'string')
    && (value.explanation === undefined || typeof value.explanation === 'string')
    && (value.fallbackAction === undefined || typeof value.fallbackAction === 'string');
}

export async function getAiRuntime(signal?: AbortSignal): Promise<AiRuntimeSnapshot> {
  const payload = await request('/ai-center/runtime', { method: 'GET' }, signal);
  if (!record(payload) || !fields(payload.model, ['name', 'status']) || !strings(payload.model.providers)
    || !Array.isArray(payload.capabilities) || !payload.capabilities.every((item) => fields(item, ['name', 'scope', 'status']))
    || !Array.isArray(payload.agents) || !payload.agents.every((item) => fields(item, ['name', 'status', 'currentTask', 'latency']))
    || !Array.isArray(payload.skills) || !payload.skills.every((item) => fields(item, ['name', 'status', 'trigger']) && typeof item.confidence === 'number' && Number.isFinite(item.confidence))
    || !Array.isArray(payload.mcpConnectors) || !payload.mcpConnectors.every((item) => fields(item, ['name', 'status', 'scope', 'lastSync']) && typeof item.writeAllowed === 'boolean')
    || (payload.sampleResult !== undefined && !validResult(payload.sampleResult))) {
    throw new AiCenterApiError(502);
  }
  return payload as AiRuntimeSnapshot;
}

function authorization(token: string): { Authorization: string } {
  if (!token.trim()) throw new AiCenterApiError(401);
  return { Authorization: `Bearer ${token.trim()}` };
}

export async function authenticateAiReviewer(token: string, signal?: AbortSignal): Promise<AiReviewUser> {
  const payload = await request('/auth/me', { method: 'GET', headers: authorization(token) }, signal);
  const user = record(payload) ? payload.user : null;
  if (!fields(user, ['openid']) || !(user.openid as string).trim()
    || (user.permissions !== undefined && !strings(user.permissions))
    || (user.displayName !== undefined && typeof user.displayName !== 'string')
    || (user.role !== undefined && typeof user.role !== 'string')) throw new AiCenterApiError(502);
  return { ...user, permissions: user.permissions ?? [] } as AiReviewUser;
}

export async function submitAiReview(
  token: string, auditId: string, decision: 'confirmed' | 'rejected', reason: string, signal?: AbortSignal,
): Promise<AIResultContract> {
  const headers = { ...authorization(token), 'Content-Type': 'application/json' };
  if (!auditId.trim() || !reason.trim()) throw new AiCenterApiError(422);
  const payload = await request('/ai-center/review', {
    method: 'POST', headers, body: JSON.stringify({ auditId, decision, reason: reason.trim() }),
  }, signal);
  if (!validResult(payload) || payload.auditId !== auditId || payload.reviewStatus !== decision) throw new AiCenterApiError(502);
  return payload;
}
