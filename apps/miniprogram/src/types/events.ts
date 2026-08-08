export type TabKey = 'home' | 'report' | 'help' | 'progress' | 'mine'

export type AppMode = 'login' | 'visitor' | 'staffLogin' | 'staff'

export type EventKind = 'help' | 'report' | 'lost'

export type EventStatus = '已提交' | '已派单' | '已接收' | '已到达' | '处理中' | '已完成'

export type RiskLevel = '高风险' | '中风险' | '低风险'

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
}

export type ReportForm = {
  category: string
  bay: string
  description: string
  contact: string
  anonymous: boolean
}
