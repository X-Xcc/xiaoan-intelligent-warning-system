import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { initialEvents } from '@/data/safety'
import type { EventKind, EventStatus, ReportForm, SafetyEvent } from '@/types/events'
import {
  createHelpEvent,
  createLostClaimEvent,
  createReportEvent,
  fetchEvents,
  supplementSafetyEvent,
  updateSafetyEventStatus,
} from '@/utils/api'

export type ProgressFilter = 'all' | EventKind

export function useSafetyEvents() {
  const [events, setEvents] = useState<SafetyEvent[]>(initialEvents)
  const [lastHelpId, setLastHelpId] = useState('')
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const replaceEvent = (next: SafetyEvent) => {
    setEvents((current) => {
      const exists = current.some((event) => event.id === next.id)
      return exists ? current.map((event) => event.id === next.id ? next : event) : [next].concat(current)
    })
  }

  const loadEvents = async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      setEvents(await fetchEvents())
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : '后端服务未连接')
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadEvents()
    const timer = setInterval(() => loadEvents(true), 20000)
    return () => clearInterval(timer)
  }, [])

  const latestHelp = useMemo(
    () => events.find((event) => event.id === lastHelpId),
    [events, lastHelpId],
  )

  const createHelp = async () => {
    let location: { latitude: number; longitude: number } | null = null
    try {
      const result = await Taro.getLocation({ type: 'gcj02' })
      location = { latitude: result.latitude, longitude: result.longitude }
    } catch {
      Taro.showToast({ title: '未获取定位，已按默认夜市点位报警', icon: 'none' })
    }
    const next = await createHelpEvent({ bay: '主街烧烤区', ...location })
    replaceEvent(next)
    setLastHelpId(next.id)
    return next
  }

  const createReport = async (form: ReportForm, photoCount: number) => {
    const next = await createReportEvent(form, photoCount)
    replaceEvent(next)
    setProgressFilter('report')
    return next
  }

  const createLostClaim = async (itemName = '粉色手机') => {
    const next = await createLostClaimEvent(itemName)
    replaceEvent(next)
    setProgressFilter('lost')
    return next
  }

  const updateEventStatus = async (id: string, status: EventStatus, owner?: string, result?: string) => {
    const next = await updateSafetyEventStatus(id, status, owner, result)
    replaceEvent(next)
    return next
  }

  const cancelLatestHelp = async () => {
    const target = events.find((event) => event.id === lastHelpId)
    if (!target) return false

    await updateEventStatus(target.id, '已完成', target.owner, '群众确认误触，事件已关闭。')
    setLastHelpId('')
    setProgressFilter('help')
    return true
  }

  const supplementEvent = async (id: string, text: string) => {
    const next = await supplementSafetyEvent(id, text)
    replaceEvent(next)
    return next
  }

  return {
    events,
    latestHelp,
    progressFilter,
    loading,
    error,
    reloadEvents: loadEvents,
    setProgressFilter,
    createHelp,
    createReport,
    createLostClaim,
    updateEventStatus,
    cancelLatestHelp,
    supplementEvent,
  }
}
