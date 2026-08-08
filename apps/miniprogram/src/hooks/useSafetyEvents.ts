import { useMemo, useState } from 'react'
import { initialEvents } from '@/data/safety'
import type { EventKind, EventStatus, ReportForm, SafetyEvent } from '@/types/events'
import { makeServiceId, nowLabel } from '@/utils/time'

export type ProgressFilter = 'all' | EventKind

export function useSafetyEvents() {
  const [events, setEvents] = useState<SafetyEvent[]>(initialEvents)
  const [lastHelpId, setLastHelpId] = useState('')
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all')

  const latestHelp = useMemo(
    () => events.find((event) => event.id === lastHelpId),
    [events, lastHelpId],
  )

  const createHelp = () => {
    const next: SafetyEvent = {
      id: makeServiceId(),
      kind: 'help',
      title: '游客紧急求助',
      bay: '摩天湾',
      level: '高风险',
      source: '一键求助',
      status: '已派单',
      owner: '最近巡防员',
      distance: '360m',
      time: nowLabel(),
      updatedAt: nowLabel(),
      description: '游客已发送当前位置，请工作人员尽快联系并前往核实。',
    }

    setEvents((current) => [next].concat(current))
    setLastHelpId(next.id)
    return next
  }

  const createReport = (form: ReportForm, photoCount: number) => {
    const next: SafetyEvent = {
      id: makeServiceId(),
      kind: 'report',
      title: form.category,
      bay: form.bay,
      level: form.category === '儿童走失' || form.category === '亲水提醒' ? '高风险' : '中风险',
      source: form.anonymous ? '匿名反馈' : '游客反馈',
      status: '已提交',
      owner: '待分配',
      distance: form.bay === '摩天湾' ? '当前位置' : '约 800m',
      time: nowLabel(),
      updatedAt: nowLabel(),
      description: form.description || `游客提交了现场问题，随附 ${photoCount} 张照片，请工作人员核实。`,
      anonymous: form.anonymous,
    }

    setEvents((current) => [next].concat(current))
    setProgressFilter('report')
    return next
  }

  const createLostClaim = (itemName = '儿童蓝色水杯') => {
    const next: SafetyEvent = {
      id: makeServiceId(),
      kind: 'lost',
      title: `${itemName}认领`,
      bay: '凤凰湾',
      level: '低风险',
      source: '失物招领',
      status: '已提交',
      owner: '服务台',
      distance: '岗亭',
      time: nowLabel(),
      updatedAt: nowLabel(),
      description: '游客提交失物认领登记，等待服务台核验。',
    }

    setEvents((current) => [next].concat(current))
    setProgressFilter('lost')
    return next
  }

  const updateEventStatus = (id: string, status: EventStatus, owner?: string, result?: string) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === id
          ? { ...event, status, owner: owner || event.owner, updatedAt: nowLabel(), result: result || event.result }
          : event,
      ),
    )
  }

  const cancelLatestHelp = () => {
    const target = events.find((event) => event.id === lastHelpId)
    if (!target) return false

    updateEventStatus(target.id, '已完成', target.owner, '游客确认误触，服务已关闭。')
    setLastHelpId('')
    setProgressFilter('help')
    return true
  }

  const supplementEvent = (id: string, text: string) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === id ? { ...event, description: `${event.description} 补充：${text}`, updatedAt: nowLabel() } : event,
      ),
    )
  }

  return {
    events,
    latestHelp,
    progressFilter,
    setProgressFilter,
    createHelp,
    createReport,
    createLostClaim,
    updateEventStatus,
    cancelLatestHelp,
    supplementEvent,
  }
}
