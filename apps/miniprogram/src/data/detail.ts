import type { EventStatus, EvidenceItem, GeoPoint, SafetyEvent } from '@/types/events'

export type DetailType =
  | 'help'
  | 'report'
  | 'lost'
  | 'guide'
  | 'rescue'
  | 'privacy'
  | 'about'
  | 'bay'
  | 'processing'
  | 'serviceOrder'
  | 'staffOrder'

type DetailMeta = {
  title: string
  subtitle: string
  badge: string
}

const detailFallback: DetailType = 'guide'

export const detailMap: Record<DetailType, DetailMeta> = {
  help: { title: '我的求助', subtitle: '求助回执与处理记录', badge: '个人记录' },
  report: { title: '我的上报', subtitle: '现场问题与后续反馈', badge: '个人记录' },
  lost: { title: '失物线索', subtitle: '记录物品特征，留下寻找线索', badge: '夜市服务' },
  guide: { title: '安全锦囊', subtitle: '安心逛夜市，从身边的小事开始', badge: '夜市服务' },
  rescue: { title: '附近点位', subtitle: '夜市位置与现场服务信息', badge: '夜市服务' },
  privacy: { title: '隐私说明', subtitle: '提交前，了解信息与权限', badge: '信息说明' },
  about: { title: '烟火哨兵', subtitle: '夜市有烟火，身边有守护', badge: '关于我们' },
  bay: { title: '夜市区域', subtitle: '夜市名称、地址与已配置点位', badge: '区域目录' },
  processing: { title: '我的进度', subtitle: '求助、上报与线索回执', badge: '个人记录' },
  serviceOrder: { title: '事件详情', subtitle: '回执、现场材料与处理进度', badge: '事件回执' },
  staffOrder: { title: '工单详情', subtitle: '现场信息与处置记录', badge: '移动勤务' },
}

export const normalizeDetailType = (value?: string): DetailType => {
  return value && Object.prototype.hasOwnProperty.call(detailMap, value) ? (value as DetailType) : detailFallback
}

export type ReceiptStep = {
  status: EventStatus
  title: string
  description: string
  state: 'recorded' | 'current' | 'pending' | 'unrecorded'
  time: string
}

const receiptStages: Array<{ status: EventStatus; title: string; description: string }> = [
  { status: '已提交', title: '已提交到平台', description: '已有事件回执，不代表工作人员已接单。' },
  { status: '已派单', title: '已派单', description: '已分配处理任务，接单情况以回执为准。' },
  { status: '已接收', title: '工作人员已接单', description: '已确认接收任务，尚不代表到达现场。' },
  { status: '已到达', title: '已到达现场', description: '工作人员已回填到达状态。' },
  { status: '处理中', title: '现场处理中', description: '后续情况以处理记录为准。' },
  { status: '已完成', title: '已完成', description: '处理状态已更新，可查看处理结果。' },
]

const receiptActions = new Set(['创建事件', '创建求助', '派发工单', '更新状态', '完成事件'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export function getReceiptSteps(event: SafetyEvent): ReceiptStep[] {
  const record = event as SafetyEvent & { timeline?: unknown; createdAt?: unknown }
  const logs = Array.isArray(record.timeline) ? record.timeline.filter(isRecord) : []
  const currentIndex = receiptStages.findIndex((step) => step.status === event.status)
  return receiptStages.map((step, index) => {
    const log = logs.find((item) => item.status === step.status && (!text(item.action) || receiptActions.has(text(item.action))))
    const current = step.status === event.status
    const recorded = Boolean(log) || index === 0
    const state = current ? 'current' : recorded ? 'recorded' : index < currentIndex ? 'unrecorded' : 'pending'
    return {
      ...step,
      state,
      description: state === 'pending'
        ? '等待处理状态更新'
        : state === 'unrecorded'
          ? '未提供该环节的单独记录'
          : step.description,
      // updatedAt can change for a supplement; it is not a milestone timestamp.
      time: text(log?.createdAt) || text(log?.time) || (index === 0 ? text(record.createdAt) : ''),
    }
  })
}

export function getNavigablePoint(point?: Partial<GeoPoint> | null): GeoPoint | undefined {
  if (!point) return undefined
  const source = text(point.source).toLowerCase()
  if (source === 'bay_fallback' || source === 'manual_address' || source === 'manual') return undefined
  if (typeof point.latitude !== 'number' || typeof point.longitude !== 'number') return undefined
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return undefined
  if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return undefined
  return { ...point, latitude: point.latitude, longitude: point.longitude }
}

export function getEventLocation(event: SafetyEvent): Partial<GeoPoint> | undefined {
  const meta = event.meta
  if (meta?.locationSource === 'manual') {
    return { name: text(meta.manualLocation) || event.bay, source: 'manual_address' }
  }
  // Keep an explicit manual location ahead of any generated route destination.
  return meta?.alarmLocation ?? meta?.reporterLocation ?? meta?.context?.location ?? meta?.route?.destination
}

export function getEventEvidence(event: SafetyEvent): EvidenceItem[] {
  const attachments = [event.meta?.evidence, event.meta?.context?.evidence]
  const seen = new Set<string>()
  const items: EvidenceItem[] = []
  for (const group of attachments) {
    if (!Array.isArray(group)) continue
    for (const item of group) {
      if (!isRecord(item) || !text(item.kind) || !text(item.url)) continue
      const kind = text(item.kind)
      const url = text(item.url)
      const key = `${kind}:${url}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        kind,
        url,
        ...(text(item.name) ? { name: text(item.name) } : {}),
        ...(text(item.mimeType) ? { mimeType: text(item.mimeType) } : {}),
        ...(typeof item.size === 'number' ? { size: item.size } : {}),
      })
    }
  }
  return items
}

export function getContactNumber(event: SafetyEvent): string {
  const contact = text(event.meta?.contact).replace(/[\s()-]/g, '')
  return /^\+?\d{3,15}$/.test(contact) ? contact : ''
}

export type NightMarketSite = {
  id: string
  name: string
  district: string
  address: string
  source: string
  point?: GeoPoint
}

export function parseNightMarketSites(payload: unknown): NightMarketSite[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error('点位列表格式异常')
  }
  const sites: NightMarketSite[] = []
  const seen = new Set<string>()
  for (const item of payload.items) {
    if (!isRecord(item) || !text(item.id) || !text(item.name) || seen.has(text(item.id))) continue
    seen.add(text(item.id))
    const point = typeof item.latitude === 'number' && typeof item.longitude === 'number'
      ? getNavigablePoint({
          latitude: item.latitude,
          longitude: item.longitude,
          name: text(item.name),
          source: text(item.source),
        })
      : undefined
    sites.push({
      id: text(item.id),
      name: text(item.name),
      district: text(item.district),
      address: text(item.address),
      source: text(item.source),
      point,
    })
  }
  return sites
}
