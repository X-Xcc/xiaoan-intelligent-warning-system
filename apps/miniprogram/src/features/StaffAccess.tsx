import { useEffect, useRef, useState } from 'react'
import { Button, Picker, Text, View } from '@tarojs/components'
import { Icon, PageHeader } from '@/components/ui'
import { requestApi } from '@/utils/api'
import { errorText } from './citizen/media'

type StaffIdentity = { id: string; name: string; role?: string }
export type StaffAccessProps = { onEnter: (name: string) => void; onBack: () => void }

export function StaffAccess({ onEnter, onBack }: StaffAccessProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [staff, setStaff] = useState<StaffIdentity[]>([])
  const [selected, setSelected] = useState(-1)
  const mounted = useRef(true)
  const generation = useRef(0)
  const entryLock = useRef(false)
  const isCurrent = (attempt: number) => mounted.current && generation.current === attempt
  const goBack = () => {
    mounted.current = false
    generation.current += 1
    onBack()
  }
  useEffect(() => {
    mounted.current = true
    void loadStaff()
    return () => {
      mounted.current = false
      generation.current += 1
    }
  }, [])
  const loadStaff = async () => {
    if (!mounted.current) return
    const attempt = ++generation.current
    setBusy(true)
    setError('')
    setStaff([])
    setSelected(-1)
    try {
      const result = await requestApi<{ items: StaffIdentity[] }>('/events/staff')
      if (!isCurrent(attempt)) return
      if (!Array.isArray(result?.items) || !result.items.length) throw new Error('工作人员目录为空，请核对人员目录后重试。')
      const ids = new Set<string>()
      const names = new Set<string>()
      // Task endpoints identify workers by name, so ambiguous names cannot be selected safely.
      for (const item of result.items) {
        if (typeof item?.id !== 'string' || !item.id.trim() || typeof item.name !== 'string' || !item.name.trim()
          || ids.has(item.id) || names.has(item.name.trim())) {
          throw new Error('工作人员目录存在缺失或重复身份，请核对后重试。')
        }
        ids.add(item.id)
        names.add(item.name.trim())
      }
      setStaff(result.items)
    } catch (err) {
      if (isCurrent(attempt)) setError(errorText(err, '工作人员目录暂不可用，请重试。'))
    } finally {
      if (isCurrent(attempt)) setBusy(false)
    }
  }
  const enter = () => {
    if (!mounted.current || entryLock.current || busy || !staff[selected]) return
    entryLock.current = true
    onEnter(staff[selected].name)
  }
  return <View className='mini-app'><PageHeader title='工作人员入口' subtitle='小安智能预警系统 · 工作身份' brand onBack={goBack} />
    <View className='mini-surface'>
      <Text className='mini-label'>工作人员</Text>
      <Picker mode='selector' range={staff} rangeKey='name' value={selected < 0 ? 0 : selected}
        disabled={busy || !staff.length} onChange={(event) => {
          const index = Number(event.detail.value)
          setSelected(Number.isInteger(index) && staff[index] ? index : -1)
        }}>
        <View className='mini-input'><Text>{busy ? '正在加载人员目录' : staff[selected]?.name || '请选择工作人员'}</Text></View>
      </Picker>
      {!!error && <Text className='mini-error'>{error}</Text>}
      {!!error && <Button className='mini-secondary' onClick={loadStaff}>重试</Button>}
      <Button className='mini-primary mini-block' loading={busy} disabled={busy || !staff[selected] || undefined} onClick={enter}><Icon name='briefcase' tone='white' size={36} /><Text>进入工作台</Text></Button>
      <Button className='mini-secondary mini-block' onClick={goBack}>返回群众端</Button>
    </View></View>
}
