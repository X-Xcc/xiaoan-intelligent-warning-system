import Taro from '@tarojs/taro'
import type {
  EventStatus,
  EvidenceItem,
  HelpForm,
  ReportForm,
  SafetyEvent,
  SecurityAnalysisReport,
  SecurityDutyPlan,
  SecurityFeed,
  SecurityIdentityProfile,
  SecurityNotification,
  SecurityOpsOverview,
} from '@/types/events'

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL || 'http://120.26.137.173/api'
const REALTIME_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/api/events/realtime')
const AUTH_TOKEN_KEY = 'yanhuo-shaobing-auth-token'

type ApiEnvelope<T> = T & {
  message?: string
}

type RequestOptions = Omit<Taro.request.Option, 'url'>

type WechatAuthUser = {
  openid: string
  unionid?: string | null
  lastLoginAt: string
}

export type WechatLoginSession = {
  token: string
  user: WechatAuthUser
  provider: 'wechat'
  dev?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await Taro.request<ApiEnvelope<T>>({
    url: `${API_BASE_URL}${path}`,
    method: options.method || 'GET',
    data: options.data,
    header: {
      'content-type': 'application/json',
      ...(getAuthToken() ? { authorization: `Bearer ${getAuthToken()}` } : {}),
      ...options.header,
    },
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(typeof response.data === 'string' ? response.data : `接口请求失败：${response.statusCode}`)
  }

  return response.data as T
}

export async function fetchEvents(): Promise<SafetyEvent[]> {
  const data = await request<{ items: SafetyEvent[] }>('/events')
  return data.items
}

export async function fetchSafetyEvent(id: string): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>(`/events/${encodeURIComponent(id)}`)
  return data.event
}

function getAuthToken(): string {
  return Taro.getStorageSync(AUTH_TOKEN_KEY) || ''
}

export async function loginWithWechat(): Promise<WechatLoginSession> {
  const loginResult = await Taro.login({ timeout: 8000 })
  if (!loginResult.code) {
    throw new Error('微信登录没有返回 code')
  }

  const session = await request<WechatLoginSession>('/auth/wechat-login', {
    method: 'POST',
    data: { code: loginResult.code },
  })
  Taro.setStorageSync(AUTH_TOKEN_KEY, session.token)
  return session
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
  return data.event
}

export async function uploadEventEvidence(filePath: string, fileType: 'image' | 'video'): Promise<EvidenceItem> {
  const uploadOptions: Parameters<typeof Taro.uploadFile>[0] = {
    url: `${API_BASE_URL}/events/evidence`,
    filePath,
    name: 'file',
  }
  const token = getAuthToken()
  if (token) {
    uploadOptions.header = { authorization: `Bearer ${token}` }
  }
  const response = await Taro.uploadFile(uploadOptions)
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error('证据上传失败')
  }
  const payload = JSON.parse(response.data as string) as { evidence?: EvidenceItem }
  return payload.evidence ?? { kind: fileType, url: '' }
}

export async function fetchStaffTasks(staff: string): Promise<SafetyEvent[]> {
  const data = await request<{ items: SafetyEvent[] }>(`/events/staff-tasks?staff=${encodeURIComponent(staff)}`)
  return data.items
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
  const data = await request<{ event: SafetyEvent }>(`/events/${id}/route?${params}`)
  return data.event
}

export async function createReportEvent(form: ReportForm, photoCount: number): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>('/events/reports', {
    method: 'POST',
    data: {
      category: form.category,
      bay: form.bay,
      description: form.description,
      contact: form.contact,
      anonymous: form.anonymous,
      photoCount,
      evidence: [],
    },
  })
  return data.event
}

export async function createLostClaimEvent(itemName: string, bay: string): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>('/events/lost-claims', {
    method: 'POST',
    data: { itemName, bay },
  })
  return data.event
}

export async function updateSafetyEventStatus(id: string, status: EventStatus, owner?: string, result?: string): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>(`/events/${id}/status`, {
    method: 'PATCH',
    data: { status, owner, result },
  })
  return data.event
}

export async function supplementSafetyEvent(id: string, text: string): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>(`/events/${id}/supplement`, {
    method: 'PATCH',
    data: { text },
  })
  return data.event
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
