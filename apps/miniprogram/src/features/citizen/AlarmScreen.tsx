import { useEffect, useRef, useState } from 'react'
import { Button, Image, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { BottomSheet, EmptyState, Icon, PageHeader, eventStatusLabels } from '@/components/ui'
import { statusFlow, statusRank } from '@/data/safety'
import type { useSafetyEvents } from '@/hooks/useSafetyEvents'
import { openDetail } from '@/utils/navigation'
import { callTelephone, errorText, selectPhotos, type LocalMedia } from './media'
import './alarm.scss'

type Controller = ReturnType<typeof useSafetyEvents>
type Coordinates = { latitude: number; longitude: number }

export function AlarmScreen({ controller }: { controller: Controller }) {
  const [sheet, setSheet] = useState<'location' | 'confirm' | 'note' | null>(null)
  const [bay, setBay] = useState('')
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [description, setDescription] = useState('')
  const [contact, setContact] = useState('')
  const [files, setFiles] = useState<LocalMedia[]>([])
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [error, setError] = useState('')
  const [newRequest, setNewRequest] = useState(false)
  const lock = useRef(false)
  const locationVersion = useRef(0)
  const latest = !newRequest ? controller.latestHelp : undefined
  const unresolvedReceipt = !newRequest && !latest && Boolean(controller.savedHelpId)
  const locationLabel = bay || '尚未设置求助位置'
  useEffect(() => () => { locationVersion.current++ }, [])
  const cancelLocation = () => { locationVersion.current++; setLocating(false) }
  const closeSheet = () => {
    if (sheet === 'location') cancelLocation()
    setSheet(null)
  }
  const startNew = () => {
    cancelLocation()
    setNewRequest(true)
    setBay('')
    setCoordinates(null)
    setContact('')
    setDescription('')
    setFiles([])
    setError('')
  }

  const locate = async () => {
    if (locating) return
    setLocating(true)
    setLocationError('')
    const version = ++locationVersion.current
    try {
      const location = await Taro.getLocation({ type: 'gcj02' })
      if (version !== locationVersion.current) return
      if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) throw new Error('未返回有效坐标')
      setCoordinates({ latitude: location.latitude, longitude: location.longitude })
      setBay('当前位置')
    } catch {
      if (version === locationVersion.current) setLocationError('未能获取定位。你可以手动填写街道、摊位或附近地标。')
    } finally {
      if (version === locationVersion.current) setLocating(false)
    }
  }

  const send = async () => {
    if (lock.current) return
    if (!bay.trim()) { setSheet('location'); return }
    lock.current = true
    setBusy(true)
    setError('')
    setSheet(null)
    try {
      await controller.createHelp({ bay: bay.trim(), description: description.trim(), contact: contact.trim(), evidence: files, ...(coordinates || {}) })
      setNewRequest(false)
      setFiles([])
      setDescription('')
    } catch (err) {
      setError(errorText(err, '未收到平台提交回执，请检查网络后重试'))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const addPhotos = async () => {
    if (busy || picking || (!latest && files.length >= 3)) return
    setPicking(true)
    try {
      const selected = await selectPhotos(latest ? 3 : 3 - files.length)
      if (!selected.length) return
      if (latest) await controller.addHelpEvidence(selected)
      else setFiles((current) => current.concat(selected).slice(0, 3))
    } catch (err) { setError(errorText(err, '补充材料未上传，请重试')) }
    finally { setPicking(false) }
  }

  const saveNote = async () => {
    if (!latest) { setSheet(null); return }
    if (!description.trim() || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await controller.supplementEvent(latest.id, description.trim())
      setSheet(null)
      setDescription('')
      Taro.showToast({ title: '说明已补充', icon: 'success' })
    } catch (err) { setError(errorText(err, '说明未提交，请重试')) }
    finally { lock.current = false; setBusy(false) }
  }

  return <View>
    <PageHeader title='一键报警' subtitle='烟火哨兵 · 安全联动'><Text className='alarm-platform-label'>平台求助</Text></PageHeader>
    <View className='mini-surface alarm-surface'>
      {unresolvedReceipt ? <View>
        <EmptyState title={controller.loading ? '正在恢复求助回执' : '已有求助回执暂未读到'} description={`编号 ${controller.savedHelpId}${controller.error ? ` · ${controller.error}` : ''}`} onRetry={() => controller.reloadEvents()} />
        <Button className='mini-secondary mini-block' onClick={startNew}>发起新的求助</Button>
      </View> : latest ? <View>
        <View className='alarm-receipt-head'><View className='alarm-receipt-icon'><Icon name='shield' tone='blue' size={64} /></View>
          <Text className='alarm-receipt-title'>{latest.status === '已提交' ? '求助已提交' : eventStatusLabels[latest.status]}</Text>
          <Text className='mini-muted'>{latest.status === '已提交' ? '等待平台工作人员确认' : latest.owner}</Text>
        </View>
        <View className='alarm-receipt-number'><Text>求助编号</Text><Text selectable>{latest.id}</Text></View>
        <View className='alarm-timeline'>
          {statusFlow.map((status, index) => <View key={status} className={`alarm-step ${index < statusRank[latest.status] ? 'done' : ''} ${index === statusRank[latest.status] ? 'current' : ''}`}>
            <View className='alarm-step-dot' /><Text className='alarm-step-label'>{status === '已提交' ? '已提交到平台' : eventStatusLabels[status]}</Text>
            {index === statusRank[latest.status] && <Text className='mini-muted'>{status === '已提交' ? '尚未获得人工接单回执' : `更新于 ${latest.updatedAt}`}</Text>}
          </View>)}
        </View>
        <View className='mini-two-actions'><Button className='mini-secondary' onClick={() => setSheet('note')}><Icon name='report' size={30} /><Text>补充说明</Text></Button><Button className='mini-primary' onClick={() => openDetail('serviceOrder', { id: latest.id })}><Icon name='tasks' tone='white' size={30} /><Text>查看回执</Text></Button></View>
        <Button className='mini-text-action alarm-more-photos' onClick={addPhotos} disabled={picking || undefined}><Icon name='camera' size={32} /><Text>补充现场照片</Text></Button>
        <Button className='mini-secondary mini-block' disabled={busy || picking || undefined} onClick={startNew}>发起新的求助</Button>
      </View> : <View>
        <Button className='alarm-location-row' onClick={() => setSheet('location')}>
          <Icon name={bay ? 'mapPin' : 'location'} tone='blue' size={42} />
          <View className='alarm-location-copy'><Text>{locationLabel}</Text><Text>{coordinates ? `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)} · 定位坐标` : bay ? '手动填写的位置' : '定位或手动填写位置'}</Text></View>
          <Text className='alarm-location-edit'>修改</Text><Icon name='chevronRight' size={24} />
        </Button>
        <View className='alarm-button-stage'><View className={`alarm-button-ring ${busy ? 'sending' : ''}`}>
          <Button id='alarm-submit' className='alarm-main-button' disabled={busy || picking || undefined} onClick={() => setSheet(bay.trim() ? 'confirm' : 'location')} aria-label='一键报警'>
            <Icon name={busy ? 'send' : 'siren'} tone='white' size={90} /><Text className='alarm-main-title'>{busy ? '正在发送' : '一键报警'}</Text><Text className='alarm-main-subtitle'>{busy ? '等待平台回执' : 'SOS'}</Text>
          </Button>
        </View></View>
        <View className='alarm-ready-line'><Icon name='shield' tone='green' size={28} /><Text>紧急求助 · 平台联动</Text></View>
        <View className='alarm-secondary-actions'><Button onClick={() => setSheet('note')}><Icon name='report' size={36} /><Text>补充说明</Text></Button>
          <Button onClick={addPhotos} disabled={busy || picking || files.length >= 3 || undefined}><Icon name='camera' size={36} /><Text>{files.length ? `已选 ${files.length} 张照片` : '补充照片'}</Text></Button></View>
        {!!files.length && <View className='citizen-photos alarm-selected-photos'>{files.map((file, index) => <View className='citizen-photo' key={file.filePath}>
          <Image src={file.filePath} mode='aspectFill' /><Button aria-label='移除照片' disabled={busy || undefined} onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}><Icon name='close' tone='white' size={28} /></Button>
        </View>)}</View>}
      </View>}
      {!!error && <Text className='mini-error'>{error}</Text>}
      {(!!controller.attachmentError || controller.pendingEvidenceCount > 0) && <View>
        <Text className='mini-warning'>{controller.attachmentError || (controller.uploadingEvidence ? '求助回执已保存，正在上传补充材料。' : '求助回执已保存，还有补充材料待上传。')}</Text>
        {controller.pendingEvidenceCount > 0 && <Button className='mini-secondary mini-block' loading={controller.uploadingEvidence} disabled={controller.uploadingEvidence || undefined} onClick={() => controller.retryHelpEvidence().catch((err) => setError(errorText(err, '附件仍未上传')))}>重试上传附件（{controller.pendingEvidenceCount}）</Button>}
      </View>}
      <Button className='alarm-call' onClick={() => callTelephone()}><Icon name='phone' size={34} /><Text>电话报警</Text><Text className='alarm-call-number'>110</Text><Icon name='arrowUpRight' size={25} /></Button>
      <Text className='alarm-boundary'>平台求助不等同于 110 电话报警</Text>
    </View>

    {sheet === 'location' && <BottomSheet title='求助位置' onClose={closeSheet}>
      <Button className='mini-secondary mini-block' loading={locating} disabled={locating || undefined} onClick={locate}><Icon name='location' tone='blue' size={36} /><Text>获取当前位置</Text></Button>
      {!!locationError && <Text className='mini-warning'>{locationError}</Text>}
      <Text className='mini-label'>详细位置</Text><Input className='mini-input' value={bay} maxlength={120} placeholder='街道、摊位、门牌或附近地标' onInput={(event) => { cancelLocation(); setBay(event.detail.value); setCoordinates(null) }} />
      {coordinates && <Text className='mini-caption'>定位坐标：{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</Text>}
      <Button className='mini-primary mini-block' disabled={!bay.trim() || undefined} onClick={closeSheet}><Icon name='check' tone='white' size={34} /><Text>确认位置</Text></Button>
    </BottomSheet>}
    {sheet === 'confirm' && <BottomSheet title='确认发送平台求助' onClose={() => setSheet(null)}>
      <View className='alarm-confirm-row'><Icon name='mapPin' tone='blue' /><View><Text>{bay}</Text><Text>{coordinates ? '定位坐标将随求助提交' : '手动位置 · 待现场核实'}</Text></View></View>
      <View className='alarm-confirm-row'><Icon name='shield' tone='blue' /><View><Text>接收方：烟火哨兵平台</Text><Text>不等同于 110 电话报警</Text></View></View>
      <Text className='mini-label'>联系电话 <Text className='mini-muted'>（选填）</Text></Text><Input className='mini-input' type='number' value={contact} maxlength={20} placeholder='便于工作人员联系' onInput={(event) => setContact(event.detail.value)} />
      <View className='mini-two-actions'><Button className='mini-secondary' onClick={() => setSheet(null)}>暂不发送</Button><Button id='alarm-confirm-send' className='mini-danger' disabled={busy || undefined} onClick={send}><Icon name='send' tone='white' size={32} /><Text>发送求助</Text></Button></View>
    </BottomSheet>}
    {sheet === 'note' && <BottomSheet title='补充现场情况' onClose={() => setSheet(null)}>
      <Textarea className='mini-textarea' value={description} maxlength={1000} placeholder='填写现场情况（选填）' onInput={(event) => setDescription(event.detail.value)} />
      {!!error && <Text className='mini-error'>{error}</Text>}
      <Button className='mini-primary mini-block' disabled={busy || (!!latest && !description.trim()) || undefined} loading={busy} onClick={saveNote}>{latest ? '提交补充说明' : '保存说明'}</Button>
    </BottomSheet>}
  </View>
}
