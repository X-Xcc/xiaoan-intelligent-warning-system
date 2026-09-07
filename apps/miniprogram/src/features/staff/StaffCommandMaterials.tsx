import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import type { EvidenceItem, SafetyEvent } from '@/types/events'
import { submitCommandTaskAction, uploadEventEvidence } from '@/utils/api'
import { staffError } from './staff-model'

export function StaffCommandMaterials({ task, disabled, onUpdated, onBusy }: {
  task: SafetyEvent; disabled: boolean; onUpdated: (task: SafetyEvent) => void; onBusy: (value: boolean) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<{ path: string; kind: 'image' | 'video' } | null>(null)
  const [upload, setUpload] = useState<EvidenceItem | null>(null)
  const [error, setError] = useState('')
  const [discoveredAt, setDiscoveredAt] = useState(() => new Date().toISOString())
  const lock = useRef(false)
  const command = task.meta!.command!
  const frozen = ['submitted', 'accepted'].includes(command.handover?.status || '')
  const choose = async () => {
    if (disabled || lock.current || frozen) return
    try {
      const result = await Taro.chooseMedia({ count: 1, mediaType: ['image', 'video'], sourceType: ['album', 'camera'] })
      const item = result.tempFiles[0]
      if (item) { setFile({ path: item.tempFilePath, kind: result.type === 'video' ? 'video' : 'image' }); setUpload(null) }
    } catch (cause) { if (!staffError(cause).includes('cancel')) setError(staffError(cause)) }
  }
  const register = async () => {
    if (disabled || lock.current || frozen || (!file && !description.trim())) return
    lock.current = true; onBusy(true); setError('')
    try {
      const receipt = file ? upload || await uploadEventEvidence(file.path, file.kind, task.id) : null
      if (receipt) setUpload(receipt)
      const updated = await submitCommandTaskAction(task.id, command.version, 'evidence', {
        kind: file?.kind || 'note', name: name.trim() || '现场材料', description: description.trim(),
        discoveredAt, ...(receipt ? { uploadId: receipt.uploadId } : {}),
      })
      onUpdated(updated); setFile(null); setUpload(null); setDescription(''); setName(''); setDiscoveredAt(new Date().toISOString())
    } catch (cause) { setError(staffError(cause)) }
    finally { lock.current = false; onBusy(false) }
  }
  return <View className='staff-command-materials'>
    <Text className='staff-heading'>现场材料 · {task.id}</Text>
    <Input className='mini-input' value={name} maxlength={100} placeholder='材料名称'
      disabled={disabled || frozen || undefined} onInput={(e) => setName(e.detail.value)} />
    <Textarea className='mini-textarea' value={description} maxlength={2000} placeholder='现场发现、清点记录与补充说明'
      disabled={disabled || frozen || undefined} onInput={(e) => setDescription(e.detail.value)} />
    {file && <Text>{file.kind === 'image' ? '图片' : '视频'} · {upload ? '已上传待登记' : '待上传'}</Text>}
    <Button className='mini-secondary' disabled={disabled || frozen || undefined} onClick={() => void choose()}>选择现场照片或视频</Button>
    {file && <Button className='mini-secondary' disabled={disabled || undefined} onClick={() => { setFile(null); setUpload(null) }}>移除待登记文件</Button>}
    <Button className='mini-primary' disabled={disabled || frozen || (!file && !description.trim()) || undefined} onClick={() => void register()}>登记现场材料</Button>
    {error && <Text className='mini-error'>{error}</Text>}
    {command.evidenceIndex.map((item) => <Text key={item.evidenceId} className='mini-muted'>{item.name} · {item.evidenceId}</Text>)}
  </View>
}
