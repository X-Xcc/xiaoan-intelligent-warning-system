import Taro from '@tarojs/taro'
import type { EventStatus, ReportForm, SafetyEvent } from '@/types/events'

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL || 'http://127.0.0.1:8010/api'
const AUTH_TOKEN_KEY = 'jiangtan-auth-token'
const AUTH_USER_KEY = 'jiangtan-auth-user'

type ApiEnvelope<T> = T & {
  message?: string
}

export type WechatAuthUser = {
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

async function request<T>(path: string, options: Taro.request.Option = {}): Promise<T> {
  const response = await Taro.request<ApiEnvelope<T>>({
    url: `${API_BASE_URL}${path}`,
    method: options.method || 'GET',
    data: options.data,
    header: {
      'content-type': 'application/json',
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

export function getAuthToken(): string {
  return Taro.getStorageSync(AUTH_TOKEN_KEY) || ''
}

export function getAuthUser(): WechatAuthUser | null {
  return Taro.getStorageSync(AUTH_USER_KEY) || null
}

export function clearAuthSession() {
  Taro.removeStorageSync(AUTH_TOKEN_KEY)
  Taro.removeStorageSync(AUTH_USER_KEY)
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
  Taro.setStorageSync(AUTH_USER_KEY, session.user)
  return session
}

export async function createHelpEvent(payload: {
  bay: string
  description?: string
  latitude?: number
  longitude?: number
  contact?: string
}): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>('/events/help', {
    method: 'POST',
    data: payload,
  })
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
    },
  })
  return data.event
}

export async function createLostClaimEvent(itemName = '儿童蓝色水杯'): Promise<SafetyEvent> {
  const data = await request<{ event: SafetyEvent }>('/events/lost-claims', {
    method: 'POST',
    data: { itemName, bay: '凤凰湾' },
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
