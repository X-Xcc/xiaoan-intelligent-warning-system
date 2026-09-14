import Taro from '@tarojs/taro'
import type {
  EventStatus,
  EvidenceItem,
  LocalEvidence,
  ReportForm,
  SafetyEvent,
  SecurityAnalysisReport,
  SecurityDutyPlan,
  SecurityFeed,
  SecurityIdentityProfile,
  SecurityNotification,
  SecurityOpsOverview,
} from '@/types/events'
import { getErrorMessage, getReceiptSessionKey, resetGuestReceiptSession } from '@/utils/event-state'

const CONFIGURED_API_BASE = (process.env.TARO_APP_API_BASE_URL || 'http://127.0.0.1:8010/api').replace(/\/+$/, '')
const H5_ORIGIN = process.env.TARO_ENV === 'h5' && typeof window !== 'undefined'
  ? window.location?.origin || ''
  : ''
const API_BASE_URL = CONFIGURED_API_BASE.startsWith('/') && H5_ORIGIN
  ? `${H5_ORIGIN}${CONFIGURED_API_BASE}`
  : CONFIGURED_API_BASE
const REALTIME_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/api/events/realtime')
const AUTH_TOKEN_KEY = 'yanhuo-shaobing-auth-token'

export type RequestOptions = Omit<Taro.request.Option, 'url'>

export type WechatAuthUser = {
  openid: string
  unionid?: string | null
  lastLoginAt: string
  role?: string
  displayName?: string
  permissions?: string[]
}

function withDeadline<T>(task: PromiseLike<T> & { abort?: () => void }, timeout: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('请求超时，请检查回执后再重试'))
      try { task.abort?.() } catch { /* The deadline still settles the request. */ }
    }, timeout)
    Promise.resolve(task).then(resolve, (error) => reject(new Error(getErrorMessage(error))))
      .finally(() => clearTimeout(timer))
  })
}

export async function requestApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const timeout = Math.min(15000, Math.max(1, Number(options.timeout) || 15000))
  const response = await withDeadline(Taro.request<T>({
    ...options,
    url: `${API_BASE_URL}${path}`,
    method: options.method || 'GET',
    timeout,
    header: {
      'content-type': 'application/json',
      ...options.header,
    },
  }), timeout)
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw Object.assign(new Error(getErrorMessage(response.data, `接口请求失败：${response.statusCode}`)), { statusCode: response.statusCode })
  }
  return response.data as T
}

const request = requestApi

export function resolveEvidenceUrl(url: string): string {
  const value = url.trim()
  if (!value || /[\s\\]/.test(value)) throw new Error('证据没有有效的 URL 地址')
  if (/^https?:\/\/(?:\[[a-f\d:.]+\]|[a-z\d](?:[a-z\d.-]*[a-z\d])?)(?::\d{1,5})?(?:[/?#]|$)/i.test(value)) return value
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//') || /^[?#]/.test(value)) {
    throw new Error('证据 URL 地址必须使用 HTTP 或 HTTPS')
  }
  const origin = API_BASE_URL.match(/^https?:\/\/[^/]+/i)?.[0]
  if (!origin) throw new Error('后端地址配置无效')
  return value.startsWith('/') ? `${origin}${value}` : `${API_BASE_URL}/${value.replace(/^\.\//, '')}`
}

function normalizeSafetyEvent(event: SafetyEvent): SafetyEvent {
  if (!event?.id) throw new Error('接口没有返回有效的事件回执')
  const normalize = (items: EvidenceItem[]) => items.map((item) => {
    if (!item.url) return item
    try { return { ...item, url: resolveEvidenceUrl(item.url) } } catch { return { ...item, url: undefined } }
  })
  if (!event.meta) return event
  return {
    ...event,
    meta: {
      ...event.meta,
      ...(event.meta.evidence ? { evidence: normalize(event.meta.evidence) } : {}),
      ...(event.meta.context ? { context: {
        ...event.meta.context,
        ...(event.meta.context.evidence ? { evidence: normalize(event.meta.context.evidence) } : {}),
      } } : {}),
    },
  }
}

export async function fetchEvents(): Promise<SafetyEvent[]> {
  const data = await request<{ items: SafetyEvent[] }>('/events')
  return data.items.map(normalizeSafetyEvent)
}

export async function fetchSafetyEvent(id: string): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>(`/events/${encodeURIComponent(id)}`)
  return normalizeSafetyEvent(data.event)
}

export function getAuthToken(): string {
  // Legacy values only partition existing local receipts; never send them as credentials.
  const token = Taro.getStorageSync(AUTH_TOKEN_KEY)
  return typeof token === 'string' ? token : ''
}

export function clearAuthSession(): void {
  Taro.removeStorageSync(`command-staff-drafts:${getAuthToken()}`)
  pendingCommandWrites.clear()
  Taro.removeStorageSync(AUTH_TOKEN_KEY)
  resetGuestReceiptSession()
}

export async function getCurrentUser(): Promise<WechatAuthUser> {
  const data = await request<{ user: WechatAuthUser }>('/auth/me')
  return data.user
}

export async function createHelpEvent(payload: {
  bay: string
  description?: string
  latitude?: number
  longitude?: number
  contact?: string
  marketId?: string
  zoneId?: string
  riskType?: string
  evidence?: EvidenceItem[]
}): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>('/events/help', {
    method: 'POST',
    data: payload,
  })
  return normalizeSafetyEvent(data.event)
}

export async function uploadEventEvidence(filePath: string, fileType: 'image' | 'video', eventId?: string): Promise<EvidenceItem> {
  if (!filePath.trim()) throw new Error('请选择真实的证据文件')
  const uploadOptions: Parameters<typeof Taro.uploadFile>[0] = {
    url: `${API_BASE_URL}/events/evidence`,
    filePath,
    name: 'file',
    timeout: 30000,
    ...(eventId ? { formData: { eventId } } : {}),
  }
  const response = await withDeadline(Taro.uploadFile(uploadOptions), 30000)
  let payload: { evidence?: EvidenceItem }
  try {
    payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  } catch {
    throw new Error('证据上传返回了无效数据')
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(getErrorMessage(payload, `证据上传失败：${response.statusCode}`))
  }
  if (typeof payload?.evidence?.url !== 'string') throw new Error('证据上传没有返回有效的 URL 地址')
  return { ...payload.evidence, kind: payload.evidence.kind || fileType, url: resolveEvidenceUrl(payload.evidence.url) }
}

export async function fetchStaffTasks(staff: string): Promise<SafetyEvent[]> {
  const data = await request<{ items: SafetyEvent[] }>(`/events/staff-tasks?staff=${encodeURIComponent(staff)}`)
  return data.items.map(normalizeSafetyEvent)
}

export async function updateStaffLocation(payload: {
  staff: string
  latitude: number
  longitude: number
  accuracy?: number
}) {
  const data = await request<{ staff: unknown }>('/events/staff-location', {
    method: 'POST',
    data: payload,
  })
  return data.staff
}

export async function refreshEventRoute(id: string, payload: {
  staff: string
  latitude?: number
  longitude?: number
  accuracy?: number
}): Promise<SafetyEvent> {
  const params = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  const data = await request<{ event: SafetyEvent }>(`/events/${encodeURIComponent(id)}/route?${params}`)
  return normalizeSafetyEvent(data.event)
}

export async function createReportEvent(form: ReportForm, files: number | LocalEvidence[]): Promise<SafetyEvent> {
  const sessionKey = getReceiptSessionKey(getAuthToken())
  const assertSession = () => {
    if (getReceiptSessionKey(getAuthToken()) !== sessionKey) throw new Error('本机回执会话已变更，请重新确认上报')
  }
  const evidence: EvidenceItem[] = []
  if (Array.isArray(files)) {
    for (const item of files) {
      assertSession()
      evidence.push(await uploadEventEvidence(item.filePath, item.kind))
    }
  }
  assertSession()
  const data = await request<{ event: SafetyEvent }>('/events/reports', {
    method: 'POST',
    data: {
      category: form.category,
      bay: form.bay,
      description: form.description,
      contact: form.contact,
      anonymous: form.anonymous,
      photoCount: evidence.filter((item) => item.kind === 'image').length,
      evidence,
    },
  })
  return normalizeSafetyEvent(data.event)
}

export async function createLostClaimEvent(itemName: string, bay: string): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>('/events/lost-claims', {
    method: 'POST',
    data: { itemName, bay },
  })
  return normalizeSafetyEvent(data.event)
}

export async function updateSafetyEventStatus(id: string, status: EventStatus, owner?: string, result?: string, commandVersion?: number): Promise<SafetyEvent> {
  if (commandVersion !== undefined) return submitCommandTaskAction(id, commandVersion, 'status', { status, result }, owner)
  const data = await request<{ event: SafetyEvent }>(`/events/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    data: { status, owner, result },
  })
  return normalizeSafetyEvent(data.event)
}

const pendingCommandWrites = new Map<string, { payload: Record<string, unknown>; fingerprint: string }>()
export async function submitCommandTaskAction(id: string, version: number, action: string, fields: Record<string, unknown>, staff = ''): Promise<SafetyEvent> {
  const key = JSON.stringify([getReceiptSessionKey(getAuthToken()), staff, id, action])
  const fingerprint = JSON.stringify(fields)
  const previous = pendingCommandWrites.get(key)
  if (previous && previous.fingerprint !== fingerprint) {
    throw new Error('前一请求结果尚未核对，请先刷新并核对原回执')
  }
  const payload = previous?.payload ?? { ...fields, expectedVersion: version, requestId: `mini-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  pendingCommandWrites.set(key, { payload, fingerprint })
  try {
    const response = await request<{ event: SafetyEvent }>(`/command/events/${encodeURIComponent(id)}/${action}`, { method: 'POST', data: payload })
    pendingCommandWrites.delete(key)
    return normalizeSafetyEvent(response.event)
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'statusCode' in cause
      && typeof cause.statusCode === 'number' && cause.statusCode < 500) {
      pendingCommandWrites.delete(key)
      throw cause
    }
    try {
      const receipt = await request<{ event: SafetyEvent }>(`/command/events/${encodeURIComponent(id)}/receipts/${payload.requestId}`)
      pendingCommandWrites.delete(key)
      return normalizeSafetyEvent(receipt.event)
    } catch {
      // Keep the original id for an uncertain retry; never replay automatically.
      throw cause
    }
  }
}

export async function supplementSafetyEvent(id: string, text: string, evidence: EvidenceItem[] = []): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>(`/events/${encodeURIComponent(id)}/supplement`, {
    method: 'PATCH',
    data: { text, evidence },
  })
  return normalizeSafetyEvent(data.event)
}

export async function supplementEvidence(id: string, evidence: EvidenceItem[], text = ''): Promise<SafetyEvent> {
  return supplementSafetyEvent(id, text, evidence)
}

export async function fetchSecurityOpsOverview(): Promise<SecurityOpsOverview> {
  return request<SecurityOpsOverview>('/security-ops/overview')
}

export async function generateSecurityDutyPlans(planDate?: string): Promise<SecurityDutyPlan[]> {
  const data = await request<{ items: SecurityDutyPlan[] }>('/security-ops/duty-plans/generate', {
    method: 'POST',
    data: planDate ? { planDate } : {},
  })
  return data.items
}

export async function submitVoiceIntake(payload: {
  transcript: string
  bay: string
  contact?: string
  autoAssign?: boolean
}) {
  return request<{ intakeId: string; intent: string; confidence: number; label: string; event?: SafetyEvent }>('/security-ops/voice-intakes', {
    method: 'POST',
    data: payload,
  })
}

export async function compareIdentityArchive(query: string): Promise<SecurityIdentityProfile[]> {
  const data = await request<{ items: SecurityIdentityProfile[] }>('/security-ai/face-match', {
    method: 'POST',
    data: { query },
  })
  return data.items
}

export async function createContainmentPlan(eventId?: string, targetKey?: string) {
  return request<{ plan: { planId: string; title: string; status: string; assignments?: Array<{ team: string; task: string }> } }>('/security-ops/containment-plans', {
    method: 'POST',
    data: { eventId, targetKey },
  })
}

export async function createAnalysisReport(period = 'day'): Promise<SecurityAnalysisReport> {
  const data = await request<{ report: SecurityAnalysisReport }>('/security-ops/analysis/reports', {
    method: 'POST',
    data: { period },
  })
  return data.report
}

export async function fetchSecurityNotifications(): Promise<SecurityNotification[]> {
  const data = await request<{ items: SecurityNotification[] }>('/security-ops/notifications?limit=10')
  return data.items
}

export async function fetchSecurityFeeds(): Promise<SecurityFeed[]> {
  const data = await request<{ items: SecurityFeed[] }>('/security-ops/data-feeds?limit=10')
  return data.items
}

export function connectRealtimeEvents(onMessage: (message: { type?: string; eventId?: string; staff?: string }) => void) {
  let closed = false
  let socketTask: Taro.SocketTask | null = null
  Taro.connectSocket({ url: REALTIME_URL }).then((task) => {
    socketTask = task
    if (closed) {
      task.close({})
      return
    }
    task.onMessage((event) => {
      try {
        onMessage(JSON.parse(String(event.data)))
      } catch {
        onMessage({})
      }
    })
    task.onError(() => undefined)
  }).catch(() => undefined)
  return () => {
    closed = true
    socketTask?.close({})
  }
}
