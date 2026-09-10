import { useRef, useState } from 'react'
import { Button, Checkbox, CheckboxGroup, Image, Input, Label, Picker, Text, Textarea, View } from '@tarojs/components'
import { EmptyState, Icon, PageHeader } from '@/components/ui'
import { reportCategories } from '@/data/safety'
import type { ReportForm, SafetyEvent } from '@/types/events'
import { errorText, selectPhotos, type LocalMedia } from './media'

export function ReportScreen({ createReport, onProgress }: {
  createReport: (form: ReportForm, files: LocalMedia[]) => Promise<SafetyEvent>
  onProgress: () => void
}) {
  const [form, setForm] = useState<ReportForm>({ category: reportCategories[0], bay: '', description: '', contact: '', anonymous: false })
  const [files, setFiles] = useState<LocalMedia[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<SafetyEvent | null>(null)
  const lock = useRef(false)
  const setField = (key: keyof ReportForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))
  const choose = async () => {
    if (lock.current) return
    const next = await selectPhotos(3 - files.length)
    if (next.length) setFiles((current) => current.concat(next).slice(0, 3))
  }
  const submit = async () => {
    if (lock.current) return
    if (!form.bay.trim() || !form.description.trim()) {
      setError('请填写发生位置和现场情况。')
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const next = await createReport({ ...form, bay: form.bay.trim(), description: form.description.trim(), contact: form.contact.trim() }, files)
      setReceipt(next)
      setFiles([])
    } catch (err) {
      setError(errorText(err, '上报未提交，请重试'))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return <View>
    <PageHeader title='隐患上报' subtitle='小安智能预警系统 · 现场记录' />
    <View className='mini-surface'>
      {receipt ? <View><EmptyState title='上报已提交' description={`编号 ${receipt.id} · 等待平台确认`} />
        <Button className='mini-primary mini-block' onClick={onProgress}>查看进度</Button>
        <Button className='mini-secondary mini-block' onClick={() => { setReceipt(null); setForm({ category: reportCategories[0], bay: '', description: '', contact: '', anonymous: false }) }}>继续上报</Button>
      </View> : <View>
        <View className='mini-field'><Text className='mini-label'>隐患类型</Text>
          <Picker disabled={busy || undefined} mode='selector' range={reportCategories} value={Math.max(0, reportCategories.indexOf(form.category))} onChange={(event) => setField('category', reportCategories[Number(event.detail.value)])}>
            <View className='mini-input citizen-picker'><Text>{form.category}</Text><Icon name='chevronDown' size={30} /></View>
          </Picker></View>
        <View className='mini-field'><Text className='mini-label'>发生位置</Text><Input disabled={busy || undefined} className='mini-input' value={form.bay} maxlength={120} placeholder='街道、摊位或附近地标' onInput={(event) => setField('bay', event.detail.value)} /></View>
        <View className='mini-field'><Text className='mini-label'>现场情况</Text><Textarea disabled={busy || undefined} className='mini-textarea' value={form.description} maxlength={1000} placeholder='填写现场情况' onInput={(event) => setField('description', event.detail.value)} /></View>
        <View className='mini-field'><Text className='mini-label'>现场照片 <Text className='mini-muted'>（选填，最多 3 张）</Text></Text>
          <View className='citizen-photos'>{files.map((file, index) => <View className='citizen-photo' key={file.filePath}><Image src={file.filePath} mode='aspectFill' /><Button disabled={busy || undefined} aria-label='移除照片' onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}><Icon name='close' tone='white' size={28} /></Button></View>)}
            {files.length < 3 && <Button disabled={busy || undefined} className='citizen-add-photo' onClick={choose}><Icon name='camera' size={44} /><Text>添加照片</Text></Button>}</View>
        </View>
        <CheckboxGroup onChange={(event) => setField('anonymous', event.detail.value.includes('anonymous'))}><Label className='mini-check-row'><Checkbox disabled={busy || undefined} value='anonymous' checked={form.anonymous} color='#0d7ff9' /><Text>匿名上报</Text></Label></CheckboxGroup>
        {!form.anonymous && <View className='mini-field'><Text className='mini-label'>联系电话 <Text className='mini-muted'>（选填）</Text></Text><Input disabled={busy || undefined} className='mini-input' type='number' value={form.contact} maxlength={20} placeholder='用于工作人员回访' onInput={(event) => setField('contact', event.detail.value)} /></View>}
        {!!error && <Text className='mini-error'>{error}</Text>}
        <Button className='mini-primary mini-block' loading={busy} disabled={busy || undefined} onClick={submit}><Icon name='send' tone='white' size={34} /><Text>{busy ? '正在提交' : '提交上报'}</Text></Button>
      </View>}
    </View>
  </View>
}
