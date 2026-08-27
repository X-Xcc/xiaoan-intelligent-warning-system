export type TabKey = 'home' | 'report' | 'help' | 'progress' | 'mine'

export type AppMode = 'login' | 'visitor' | 'staffLogin' | 'staff'

export type EventKind = 'help' | 'report' | 'lost'

export type EventStatus = '已提交' | '已派单' | '已接收' | '已到达' | '处理中' | '已完成'

export type RiskLevel = '高风险' | '中风险' | '低风险'

export type GeoPoint = {
  latitude: number
  longitude: number
  name?: string
  source?: string
}

export type SafetyRoute = {
  mode: 'walk' | 'bike' | 'drive' | string
  modeLabel: string
  etaMinutes: number
  etaLabel: string
  distanceMeters: number
  distanceLabel: string
  origin: GeoPoint
  destination: GeoPoint
  points: GeoPoint[]
  provider?: string
}

export type EventAssignment = {
  staffId: string
  staffName: string
  role: string
  assignedAt?: string
  reason?: string
  candidates?: Array<{
    staffId: string
    staffName: string
    role: string
    score: number
    route: SafetyRoute
  }>
}

export type EventMeta = {
  latitude?: number
  longitude?: number
  contact?: string | null
  reporterLocation?: GeoPoint
  alarmLocation?: GeoPoint
  assignment?: EventAssignment
  route?: SafetyRoute
  [key: string]: unknown
}

export type SafetyEvent = {
  id: string
  kind: EventKind
  title: string
  bay: string
  level: RiskLevel
  source: string
  status: EventStatus
  owner: string
  distance: string
  time: string
  description: string
  updatedAt: string
  result?: string
  anonymous?: boolean
  meta?: EventMeta
}

export type ReportForm = {
  category: string
  bay: string
  description: string
  contact: string
  anonymous: boolean
}
