import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDidHide, useDidShow } from '@tarojs/taro'
import type { CreateHelpInput, EventKind, EventStatus, EvidenceItem, LocalEvidence, ReportForm, SafetyEvent } from '@/types/events'
import {
  createHelpEvent,
  createLostClaimEvent,
  createReportEvent,
  fetchSafetyEvent,
  getAuthToken,
  supplementSafetyEvent,
  uploadEventEvidence,
  updateSafetyEventStatus,
} from '@/utils/api'
import {
  getErrorMessage,
  getReceiptSessionKey,
  readReceiptState,
  writeReceiptState,
} from '@/utils/event-state'
import type { PendingEvidence, ReceiptState } from '@/utils/event-state'

export type ProgressFilter = 'all' | EventKind

type ReceiptSession = { key: string; receipts: ReceiptState; revisions: Map<string, number> }

function uniqueFiles(files: LocalEvidence[]): LocalEvidence[] {
  const seen = new Set<string>()
  return files.filter((file) => {
    if (!file.filePath?.trim() || !['image', 'video'].includes(file.kind)) throw new Error('请选择真实的证据文件')
    const key = `${file.kind}:${file.filePath}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map((file) => ({ kind: file.kind, filePath: file.filePath }))
}

export function useSafetyEvents() {
  const sessionKey = getReceiptSessionKey(getAuthToken())
  const sessionRef = useRef<ReceiptSession | null>(null)
  if (!sessionRef.current) {
    sessionRef.current = { key: sessionKey, receipts: readReceiptState(sessionKey), revisions: new Map() }
  }
  const [events, setEvents] = useState<SafetyEvent[]>([])
  const [lastHelpId, setLastHelpId] = useState(sessionRef.current.receipts.lastHelpId)
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [pendingEvidenceCount, setPendingEvidenceCount] = useState(
    () => Object.values(sessionRef.current!.receipts.pendingEvidence).reduce((sum, items) => sum + items.length, 0),
  )
  const [submitting, setSubmitting] = useState(false)
  const [uploadingEvidence, setUploadingEvidence] = useState(false)
  const mounted = useRef(true)
  const visible = useRef(true)
  const mutationLock = useRef(false)
  const attachmentJob = useRef<{ key: string; promise: Promise<void> } | null>(null)
  const reloadJob = useRef<{ key: string; promise: Promise<void> } | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const isCurrent = useCallback((session: ReceiptSession) => mounted.current
    && sessionRef.current === session && getReceiptSessionKey(getAuthToken()) === session.key, [])

  const showReceipts = useCallback((session: ReceiptSession) => {
    if (!isCurrent(session)) return
    setLastHelpId(session.receipts.lastHelpId)
    setPendingEvidenceCount(Object.values(session.receipts.pendingEvidence).reduce((sum, items) => sum + items.length, 0))
  }, [isCurrent])

  const syncSession = useCallback((): ReceiptSession => {
    const key = getReceiptSessionKey(getAuthToken())
    if (sessionRef.current!.key !== key) {
      sessionRef.current = { key, receipts: readReceiptState(key), revisions: new Map() }
      if (mounted.current) {
        setEvents([])
        setError('')
        setAttachmentError('')
        setProgressFilter('all')
        setUploadingEvidence(false)
        showReceipts(sessionRef.current)
      }
    }
    return sessionRef.current!
  }, [showReceipts])

  const saveReceipts = useCallback((session: ReceiptSession) => {
    if (!writeReceiptState(session.key, session.receipts) && isCurrent(session)) {
      setError('事件已提交，但本机回执保存失败。请记下事件编号，暂勿清理应用。')
    }
    showReceipts(session)
  }, [isCurrent, showReceipts])

  const replaceEvent = useCallback((session: ReceiptSession, next: SafetyEvent) => {
    session.revisions.set(next.id, (session.revisions.get(next.id) || 0) + 1)
    if (!isCurrent(session)) return
    setEvents((current) => [next, ...current.filter((event) => event.id !== next.id)])
  }, [isCurrent])

  const registerReceipt = useCallback((session: ReceiptSession, next: SafetyEvent, files: LocalEvidence[] = []) => {
    session.receipts.ids = [...new Set([next.id, ...session.receipts.ids])]
    if (next.kind === 'help') session.receipts.lastHelpId = next.id
    if (files.length) session.receipts.pendingEvidence[next.id] = files
    saveReceipts(session)
    replaceEvent(session, next)
  }, [replaceEvent, saveReceipts])

  const loadEvents = useCallback((silent = false): Promise<void> => {
    const session = syncSession()
    if (reloadJob.current?.key === session.key) return reloadJob.current.promise
    if (!silent && isCurrent(session)) setLoading(true)
    const job = (async () => {
      const ids = [...session.receipts.ids]
      const revisions = new Map(session.revisions)
      let failure = ''
      let cursor = 0
      // Limit concurrent receipt requests without ever querying the collection.
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (cursor < ids.length && isCurrent(session)) {
          const id = ids[cursor++]
          try {
            const next = await fetchSafetyEvent(id)
            if (next.id !== id) throw new Error('回执编号与请求不一致')
            if (isCurrent(session) && session.revisions.get(id) === revisions.get(id)) {
              setEvents((current) => {
                const exists = current.some((item) => item.id === id)
                return exists ? current.map((item) => item.id === id ? next : item) : [...current, next]
              })
            }
          } catch (err) {
            failure = getErrorMessage(err)
          }
        }
      }))
      if (isCurrent(session)) {
        setError(failure)
        setLoading(false)
      }
    })()
    reloadJob.current = { key: session.key, promise: job }
    void job.finally(() => {
      if (reloadJob.current?.promise === job) reloadJob.current = null
    })
    return job
  }, [isCurrent, syncSession])

  const stopPolling = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current)
    timer.current = null
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    if (visible.current) timer.current = setInterval(() => { void loadEvents(true) }, 20000)
  }, [loadEvents, stopPolling])

  useEffect(() => {
    mounted.current = true
    syncSession()
    void loadEvents()
    startPolling()
    return () => { mounted.current = false; stopPolling() }
  }, [sessionKey, loadEvents, startPolling, stopPolling, syncSession])

  useDidHide(() => { visible.current = false; stopPolling() })
  useDidShow(() => {
    visible.current = true
    void loadEvents()
    startPolling()
  })

  const mutate = useCallback(async <T,>(operation: (session: ReceiptSession) => Promise<T>): Promise<T> => {
    if (mutationLock.current) throw new Error('已有操作正在提交，请稍候')
    mutationLock.current = true
    const session = syncSession()
    if (isCurrent(session)) { setSubmitting(true); setError('') }
    try {
      return await operation(session)
    } catch (err) {
      if (isCurrent(session)) setError(getErrorMessage(err))
      throw err
    } finally {
      mutationLock.current = false
      if (mounted.current) setSubmitting(false)
    }
  }, [isCurrent, syncSession])

  const retryHelpEvidence = useCallback((): Promise<void> => {
    const session = syncSession()
    if (attachmentJob.current?.key === session.key) return attachmentJob.current.promise
    const job = (async () => {
      if (isCurrent(session)) { setAttachmentError(''); setUploadingEvidence(true) }
      let failure = ''
      try {
        for (const id of Object.keys(session.receipts.pendingEvidence)) {
          const items = [...session.receipts.pendingEvidence[id]]
          for (const item of items) {
            if (!isCurrent(session)) return
            if (item.uploaded) continue
            try {
              item.uploaded = await uploadEventEvidence(item.filePath, item.kind)
              saveReceipts(session)
            } catch (err) {
              failure = getErrorMessage(err)
            }
          }
          if (!isCurrent(session)) return
          const ready = items.filter((item): item is PendingEvidence & { uploaded: EvidenceItem } => !!item.uploaded)
          if (!ready.length) continue
          try {
            const next = await supplementSafetyEvent(id, '', ready.map((item) => item.uploaded))
            session.receipts.pendingEvidence[id] = session.receipts.pendingEvidence[id].filter((item) => !ready.includes(item as typeof ready[number]))
            if (!session.receipts.pendingEvidence[id].length) delete session.receipts.pendingEvidence[id]
            saveReceipts(session)
            replaceEvent(session, next)
          } catch (err) {
            failure = getErrorMessage(err)
          }
        }
      } finally {
        if (isCurrent(session)) { setAttachmentError(failure); setUploadingEvidence(false) }
      }
    })()
    attachmentJob.current = { key: session.key, promise: job }
    void job.finally(() => {
      if (attachmentJob.current?.promise === job) attachmentJob.current = null
    })
    return job
  }, [isCurrent, replaceEvent, saveReceipts, syncSession])

  const createHelp = useCallback((form: CreateHelpInput = {}): Promise<SafetyEvent> => mutate(async (session) => {
    const bay = form.bay?.trim()
    if (!bay) throw new Error('请填写求助地点或地址')
    const { latitude, longitude } = form
    if ((latitude === undefined) !== (longitude === undefined)
      || (latitude !== undefined && (!Number.isFinite(latitude) || Math.abs(latitude) > 90))
      || (longitude !== undefined && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))) {
      throw new Error('请提供完整有效的经纬度坐标，或仅填写手动地址')
    }
    const next = await createHelpEvent({
      bay, description: form.description, contact: form.contact, latitude, longitude,
    })
    registerReceipt(session, next)
    try {
      const files = uniqueFiles(form.evidence || [])
      if (files.length) {
        session.receipts.pendingEvidence[next.id] = files
        saveReceipts(session)
        if (isCurrent(session)) void retryHelpEvidence()
      }
    } catch (err) {
      if (isCurrent(session)) setAttachmentError(getErrorMessage(err))
    }
    return next
  }), [isCurrent, mutate, registerReceipt, retryHelpEvidence, saveReceipts])

  const addHelpEvidence = useCallback(async (files: LocalEvidence[]): Promise<void> => {
    const session = syncSession()
    const id = session.receipts.lastHelpId
    if (!id) throw new Error('请先提交求助并取得回执')
    const existing = session.receipts.pendingEvidence[id] || []
    const additions = uniqueFiles(files).filter((file) => !existing.some((item) => item.kind === file.kind && item.filePath === file.filePath))
    session.receipts.pendingEvidence[id] = [...existing, ...additions]
    saveReceipts(session)
    // A second selection may arrive while the previous batch is uploading.
    if (attachmentJob.current?.key === session.key) await attachmentJob.current.promise
    if (isCurrent(session) && session.receipts.pendingEvidence[id]?.length) await retryHelpEvidence()
  }, [isCurrent, retryHelpEvidence, saveReceipts, syncSession])

  const createReport = useCallback((form: ReportForm, files: number | LocalEvidence[]): Promise<SafetyEvent> => mutate(async (session) => {
    const next = await createReportEvent(form, Array.isArray(files) ? uniqueFiles(files) : files)
    registerReceipt(session, next)
    if (isCurrent(session)) setProgressFilter('report')
    return next
  }), [isCurrent, mutate, registerReceipt])

  const createLostClaim = useCallback((itemName: string, bay: string): Promise<SafetyEvent> => mutate(async (session) => {
    const next = await createLostClaimEvent(itemName, bay)
    registerReceipt(session, next)
    if (isCurrent(session)) setProgressFilter('lost')
    return next
  }), [isCurrent, mutate, registerReceipt])

  const updateEventStatus = useCallback((id: string, status: EventStatus, owner?: string, result?: string): Promise<SafetyEvent> => mutate(async (session) => {
    const next = await updateSafetyEventStatus(id, status, owner, result)
    if (session.receipts.ids.includes(id)) replaceEvent(session, next)
    return next
  }), [mutate, replaceEvent])

  const supplementEvent = useCallback((id: string, text: string, evidence: EvidenceItem[] = []): Promise<SafetyEvent> => mutate(async (session) => {
    const next = await supplementSafetyEvent(id, text, evidence)
    if (session.receipts.ids.includes(id)) replaceEvent(session, next)
    return next
  }), [mutate, replaceEvent])

  const cancelLatestHelp = useCallback(async (): Promise<boolean> => {
    const session = syncSession()
    const id = session.receipts.lastHelpId
    if (!id) return false
    await supplementEvent(id, '群众申请撤回本次求助，请工作人员核实；此申请不代表事件已完成。')
    if (isCurrent(session)) setProgressFilter('help')
    return true
  }, [isCurrent, supplementEvent, syncSession])

  const currentSession = sessionRef.current.key === sessionKey
  const latestHelp = useMemo(() => currentSession ? events.find((event) => event.id === lastHelpId) : undefined,
    [currentSession, events, lastHelpId])

  return {
    events: currentSession ? events : [],
    latestHelp,
    savedHelpId: currentSession ? lastHelpId : '',
    progressFilter,
    loading,
    error,
    attachmentError,
    pendingEvidenceCount: currentSession ? pendingEvidenceCount : 0,
    submitting,
    uploadingEvidence,
    reloadEvents: loadEvents,
    setProgressFilter,
    createHelp,
    createReport,
    createLostClaim,
    updateEventStatus,
    cancelLatestHelp,
    supplementEvent,
    addHelpEvidence,
    retryHelpEvidence,
  }
}
