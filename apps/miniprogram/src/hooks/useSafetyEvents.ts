import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import type { EventKind, EventStatus, ReportForm, SafetyEvent } from '@/types/events'
import {
  createHelpEvent,
  createLostClaimEvent,
  createReportEvent,
  fetchEvents,
  supplementSafetyEvent,
  uploadEventEvidence,
  updateSafetyEventStatus,
} from '@/utils/api'

export type ProgressFilter = 'all' | EventKind

export function useSafetyEvents() {
  const [events, setEvents] = useState<SafetyEvent[]>([])
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
        setError(err instanceof Error ? err.message : '暂时连不上事件服务')
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

  const createHelp = async (form?: { bay?: string; description?: string; contact?: string; evidence?: Array<{ kind: 'image' | 'video'; filePath: string }> }) => {
    let location: { latitude: number; longitude: number }
    try {
      const result = await Taro.getLocation({ type: 'gcj02' })
      location = { latitude: result.latitude, longitude: result.longitude }
    } catch {
      Taro.showToast({ title: '先打开定位，才能发出求助', icon: 'none' })
      throw new Error('location_required')
    }
    const evidence = await Promise.all((form?.evidence || []).slice(0, 3).map((item) => uploadEventEvidence(item.filePath, item.kind)))
    const next = await createHelpEvent({
      bay: form?.bay || '主街烧烤区',
      description: form?.description,
      contact: form?.contact,
      marketId: 'NC-NM-001',
      zoneId: 'NC-NM-001-Z1',
      riskType: form?.description && /打架|斗殴|纠纷|滋扰|冲突/.test(form.description) ? '打架' : '现场求助',
      evidence,
      ...location,
    })
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

  const createLostClaim = async (itemName: string, bay: string) => {
    const next = await createLostClaimEvent(itemName, bay)
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
