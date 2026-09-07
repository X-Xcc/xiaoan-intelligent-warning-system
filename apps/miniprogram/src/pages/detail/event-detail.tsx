import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { BottomSheet, EmptyState, Icon, Section } from '@/components/ui'
import { getContactNumber, getEventEvidence, getEventLocation, getNavigablePoint, getReceiptSteps } from '@/data/detail'
import type { SafetyEvent } from '@/types/events'
import { fetchSafetyEvent, supplementSafetyEvent } from '@/utils/api'
import { EventEvidence } from './event-evidence'
import { confirmPhoneCall, goToMain, openPoint } from './native-actions'

export function EventDetail({ eventId, staff }: { eventId: string; staff: boolean }) {
  const [event, setEvent] = useState<SafetyEvent | null>(null)
  const [loading, setLoading] = useState(Boolean(eventId))
  const [loadError, setLoadError] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [saved, setSaved] = useState(false)
  const requestVersion = useRef(0)
  const mutationBusy = useRef(false)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    if (!eventId || mutationBusy.current) return
    const version = ++requestVersion.current
    setLoading(true)
    setLoadError('')
    try {
      const next = await fetchSafetyEvent(eventId)
      if (!next || next.id !== eventId || typeof next.status !== 'string') throw new Error('事件回执格式异常')
      if (mounted.current && version === requestVersion.current) setEvent(next)
    } catch {
      if (mounted.current && version === requestVersion.current) {
        setLoadError('记录未能读取，可能是网络异常、记录不存在或暂无访问权限。')
      }
    } finally {
      if (mounted.current && version === requestVersion.current) setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
      requestVersion.current += 1
    }
  }, [load])

  const submitSupplement = async () => {
    if (!event || mutationBusy.current) return
    const value = draft.trim()
    if (!value || value.length > 1000) {
      setSubmitError('请填写 1 至 1000 字的补充说明。')
      return
    }
    mutationBusy.current = true
    setSending(true)
    setSubmitError('')
    setSaved(false)
    let requested = false
    try {
      const confirmation = await Taro.showModal({
        title: '提交补充说明',
        content: `将文字保存到事件 ${event.id} 的记录中，不会发起电话、支援调度或指挥通知。`,
        confirmText: '确认提交',
        cancelText: '再检查',
        confirmColor: '#0d7ff9',
      })
      if (!confirmation.confirm || !mounted.current) return
      requestVersion.current += 1
      setLoading(false)
      requested = true
      const next = await supplementSafetyEvent(event.id, value)
      if (!next || next.id !== event.id || typeof next.status !== 'string') throw new Error('补充回执格式异常')
      if (!mounted.current) return
      setEvent(next)
      setLoadError('')
      setDraft('')
      setSheetOpen(false)
      setSaved(true)
    } catch {
      if (mounted.current) {
        setSubmitError(requested
          ? '提交结果尚未确认，文字已保留。请先刷新记录核对，避免重复提交。'
          : '确认窗口未打开，文字已保留，请重试。')
      }
    } finally {
      mutationBusy.current = false
      if (mounted.current) setSending(false)
    }
  }

  if (!eventId) {
    return (
      <View>
        <EmptyState title='尚未选择事件' description='请从已有回执或任务列表打开详情。' />
        <Button className='mini-primary detail-button' onClick={() => goToMain('tab=progress')}>
          <Icon name='clock' tone='white' size={32} /><Text>查看我的进度</Text>
        </Button>
      </View>
    )
  }

  if (!event) {
    return loading
      ? <View className='detail-loading'><Icon name='refresh' tone='blue' size={44} /><Text>正在读取事件记录</Text></View>
      : <EmptyState title='事件详情未能打开' description={loadError} onRetry={() => void load()} />
  }

  const point = getEventLocation(event)
  const navigable = getNavigablePoint(point)
  const steps = getReceiptSteps(event)
  const currentStep = steps.find((step) => step.state === 'current')
  const phoneNumber = getContactNumber(event)
  const evidence = getEventEvidence(event)
  const openSupplement = () => {
    setSubmitError('')
    setSaved(false)
    setSheetOpen(true)
  }

  return (
    <View className='detail-event'>
      <View className='detail-receipt'>
        <View className={`detail-receipt-symbol${event.status === '已完成' ? ' complete' : ''}`}>
          <Icon name={event.status === '已完成' ? 'check' : 'report'} tone={event.status === '已完成' ? 'green' : 'blue'} size={48} />
        </View>
        <Text className='detail-receipt-title'>{currentStep?.title || event.status}</Text>
        <Text className='detail-caption'>{currentStep?.description || '以事件记录返回的状态为准。'}</Text>
        <View className='detail-receipt-id'>
          <Text>事件编号</Text><Text selectable>{event.id}</Text>
        </View>
      </View>

      {saved && <View className='detail-notice detail-notice-success'><Icon name='check' tone='green' size={32} /><Text>补充说明已保存到事件记录。</Text></View>}
      {loadError && <View className='mini-error detail-inline-error'><Text>{loadError} 下方为上次读取的记录。</Text></View>}
      <View className='detail-refresh-row'>
        <Text className='detail-caption'>记录更新：{event.updatedAt || '未提供'}</Text>
        <Button className='detail-inline-button' disabled={loading || sending || undefined} onClick={() => void load()}>
          <Icon name='refresh' tone='blue' size={28} /><Text>{loading ? '读取中' : '刷新'}</Text>
        </Button>
      </View>

      <Section title='现场信息'>
        <Text className='detail-event-title'>{event.title}</Text>
        <Text className='detail-body'>{event.description || '暂无文字说明'}</Text>
        <View className='detail-facts'>
          <View><Text className='detail-caption'>来源</Text><Text>{event.source || '未提供'}</Text></View>
          <View><Text className='detail-caption'>处理人员</Text><Text>{event.owner || '尚未分配'}</Text></View>
          {staff && <View><Text className='detail-caption'>风险等级</Text><Text className={event.level === '高风险' ? 'detail-danger-text' : ''}>{event.level || '未提供'}</Text></View>}
        </View>
      </Section>

      <Section title='现场位置'>
        <View className='detail-location'>
          <Icon name='mapPin' tone='blue' size={40} />
          <View className='detail-location-copy'>
            <Text className='detail-row-title'>{point?.name || event.bay || '尚未提供位置'}</Text>
            {point?.name && event.bay && point.name !== event.bay && <Text className='detail-caption'>{event.bay}</Text>}
            <Text className='detail-caption'>
              {navigable
                ? `${navigable.latitude.toFixed(6)}, ${navigable.longitude.toFixed(6)}`
                : '仅有地址或区域信息，尚无可导航的准确坐标'}
            </Text>
          </View>
        </View>
        <Button className='mini-secondary detail-button' disabled={!navigable || undefined} onClick={() => openPoint(point, event.bay)}>
          <Icon name='navigation' tone={navigable ? 'blue' : 'muted'} size={32} /><Text>打开位置</Text>
        </Button>
      </Section>

      <Section title={`现场材料${evidence.length ? ` · ${evidence.length}` : ''}`}>
        <EventEvidence items={evidence} />
      </Section>

      <Section title='处理进度'>
        <View className='detail-timeline'>
          {steps.map((step) => (
            <View className={`detail-timeline-row ${step.state}`} key={step.status}>
              <View className='detail-timeline-marker'>
                <View className='detail-timeline-dot' />
              </View>
              <View className='detail-timeline-copy'>
                <Text className='detail-row-title'>{step.title}</Text>
                <Text className='detail-caption'>{step.description}</Text>
                {step.time && <Text className='detail-timeline-time'>{step.time}</Text>}
              </View>
            </View>
          ))}
        </View>
      </Section>

      {(event.result || event.status === '已完成') && (
        <Section title='处理结果'>
          <Text className='detail-body'>{event.result || '处理状态已完成，尚未提供文字结果。'}</Text>
        </Section>
      )}

      {staff && (
        <Section title='现场联系'>
          <Text className='detail-caption'>{phoneNumber ? `事件预留电话：${phoneNumber}` : '该事件未提供可拨打的联系电话。'}</Text>
          <Button className='mini-secondary detail-button' disabled={!phoneNumber || undefined} onClick={() => confirmPhoneCall(phoneNumber, '联系事件提交人')}>
            <Icon name='phone' tone={phoneNumber ? 'blue' : 'muted'} size={32} /><Text>联系提交人</Text>
          </Button>
        </Section>
      )}

      <View className='detail-footer-actions'>
        <Button className='mini-primary detail-button' disabled={sending || undefined} onClick={openSupplement}>
          <Icon name='plus' tone='white' size={34} /><Text>补充说明</Text>
        </Button>
        {!staff && <Button className='mini-secondary detail-button' onClick={() => goToMain('tab=progress')}>
          <Icon name='clock' tone='blue' size={32} /><Text>我的进度</Text>
        </Button>}
      </View>

      {sheetOpen && (
        <BottomSheet title='补充说明' onClose={() => { if (!mutationBusy.current) setSheetOpen(false) }}>
          <View className='detail-supplement'>
            <Text className='mini-label'>现场补充信息</Text>
            <Textarea
              className='mini-textarea detail-textarea'
              value={draft}
              maxlength={1000}
              disabled={sending || undefined}
              placeholder='补充具体位置、现场变化或需要说明的情况'
              onInput={(input) => setDraft(input.detail.value)}
              adjustPosition
            />
            <Text className='detail-character-count'>{draft.length}/1000</Text>
            <Text className='detail-caption'>补充内容将加入当前事件记录，不会代为拨号或调度支援。</Text>
            {submitError && <Text className='mini-error detail-inline-error'>{submitError}</Text>}
            {submitError && <Button className='mini-secondary detail-button' disabled={sending || undefined} onClick={() => { setSheetOpen(false); void load() }}>
              <Icon name='refresh' tone='blue' size={32} /><Text>刷新记录核对</Text>
            </Button>}
            <Button className='mini-primary detail-button' loading={sending} disabled={sending || !draft.trim() || undefined} onClick={() => void submitSupplement()}>
              {!sending && <Icon name='send' tone='white' size={32} />}<Text>{sending ? '正在提交' : '提交补充'}</Text>
            </Button>
          </View>
        </BottomSheet>
      )}
    </View>
  )
}
