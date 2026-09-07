import Taro from '@tarojs/taro'
import type { EventStatus, EvidenceItem, LocalEvidence, SafetyEvent } from '@/types/events'

const RECEIPT_PREFIX = 'yanhuo-event-receipts-v1:'
const GUEST_SESSION_KEY = 'yanhuo-event-guest-session'
const memoryReceipts = new Map<string, ReceiptState>()
let guestSession = ''

export type PendingEvidence = LocalEvidence & { uploaded?: EvidenceItem }

export type ReceiptState = {
  ids: string[]
  lastHelpId: string
  pendingEvidence: Record<string, PendingEvidence[]>
}

export function getReceiptSessionKey(token: string): string {
  if (token) return `${RECEIPT_PREFIX}auth:${encodeURIComponent(token)}`
  try {
    guestSession = Taro.getStorageSync(GUEST_SESSION_KEY) || guestSession
  } catch {
    // Keep the same guest partition if device storage is temporarily unavailable.
  }
  if (!guestSession) {
    guestSession = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    try { Taro.setStorageSync(GUEST_SESSION_KEY, guestSession) } catch { /* Memory fallback. */ }
  }
  return `${RECEIPT_PREFIX}guest:${guestSession}`
}

export function resetGuestReceiptSession(): void {
  guestSession = ''
  Taro.removeStorageSync(GUEST_SESSION_KEY)
}

export function readReceiptState(key: string): ReceiptState {
  let raw: Partial<ReceiptState> | undefined
  try { raw = Taro.getStorageSync(key) } catch { /* Memory fallback. */ }
  raw = memoryReceipts.get(key) || raw
  const ids = Array.isArray(raw?.ids)
    ? [...new Set(raw.ids.filter((id): id is string => typeof id === 'string' && !!id.trim()))]
    : []
  const pendingEvidence: ReceiptState['pendingEvidence'] = {}
  for (const id of ids) {
    const items = raw?.pendingEvidence?.[id]
    if (!Array.isArray(items)) continue
    pendingEvidence[id] = items.filter((item) => item && (item.kind === 'image' || item.kind === 'video')
      && typeof item.filePath === 'string' && !!item.filePath.trim())
  }
  return { ids, lastHelpId: ids.includes(raw?.lastHelpId || '') ? raw!.lastHelpId! : '', pendingEvidence }
}

export function writeReceiptState(key: string, state: ReceiptState): boolean {
  memoryReceipts.set(key, state)
  try {
    Taro.setStorageSync(key, state)
    return true
  } catch {
    return false
  }
}

export function getErrorMessage(error: unknown, fallback = '\u6682\u65f6\u8fde\u4e0d\u4e0a\u4e8b\u4ef6\u670d\u52a1'): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string') return error || fallback
  if (error && typeof error === 'object') {
    const value = error as { detail?: unknown; message?: unknown; errMsg?: unknown; msg?: unknown; loc?: unknown[] }
    if (Array.isArray(value.detail)) return value.detail.map((item) => getErrorMessage(item, fallback)).join('; ')
    if (value.detail) return getErrorMessage(value.detail, fallback)
    const message = value.message || value.errMsg || value.msg
    if (typeof message === 'string') return `${value.loc?.join('.') ? `${value.loc.join('.')}: ` : ''}${message}`
  }
  return fallback
}

const STATUS_ORDER: EventStatus[] = ['已提交', '已派单', '已接收', '已到达', '处理中', '已完成']
const HEADLINES: Record<EventStatus, string> = {
  已提交: '已提交，等待平台派单',
  已派单: '已派单，等待工作人员接收',
  已接收: '工作人员已接收',
  已到达: '工作人员已到达',
  处理中: '工作人员正在处理',
  已完成: '平台已完成处理',
}

export function getEventHeadline(event: SafetyEvent): string {
  return HEADLINES[event.status] || '状态待确认'
}

export function getEventProgress(event: SafetyEvent): number {
  const index = STATUS_ORDER.indexOf(event.status)
  return index < 0 ? 0 : Math.round((index + 1) / STATUS_ORDER.length * 100)
}
