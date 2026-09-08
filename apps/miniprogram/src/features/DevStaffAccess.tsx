import { useEffect, useRef, useState } from 'react'
import { Button, Input, Label, Text, View } from '@tarojs/components'
import { Icon, PageHeader } from '@/components/ui'
import { getAuthToken, requestApi } from '@/utils/api'
import { errorText } from './citizen/media'
import type { StaffAccessProps } from './StaffAccess'

const BOUND_STAFF_ID = 'wang'

export function DevStaffAccess({ onEnter, onBack }: StaffAccessProps) {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const entryLock = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; generation.current++ }
  }, [])
  const goBack = () => {
    mounted.current = false
    generation.current++
    onBack()
  }
  const enter = async () => {
    if (!mounted.current || entryLock.current) return
    if (!account.trim() || !password) {
      setError('请输入账号和密码')
      return
    }
    if (account.trim() !== 'xx' || password !== '123') {
      setError('账号或密码错误，请重新输入')
      return
    }
    entryLock.current = true
    const attempt = ++generation.current
    const token = getAuthToken()
    const isCurrent = () => mounted.current && generation.current === attempt
    let entered = false
    setBusy(true)
    setError('')
    try {
      const result = await requestApi<{ items: Array<{ id: string; name: string }> }>('/events/staff')
      if (!isCurrent()) return
      if (getAuthToken() !== token) throw new Error('登录会话已变更，请重新登录。')
      const staff = Array.isArray(result?.items) ? result.items.find((item) => item?.id === BOUND_STAFF_ID) : undefined
      if (typeof staff?.name !== 'string' || !staff.name.trim()) {
        throw new Error('未找到此账号绑定的工作人员，请联系管理员核对人员目录后重试。')
      }
      setPassword('')
      entered = true
      onEnter(staff.name)
    } catch (cause) {
      if (isCurrent()) setError(errorText(cause, '工作人员目录暂不可用，请重试。'))
    } finally {
      if (isCurrent()) {
        if (!entered) entryLock.current = false
        setBusy(false)
      }
    }
  }
  return <View className='mini-app'>
    <PageHeader title='工作人员登录' subtitle='小安智能预警系统 · 工作身份' brand onBack={goBack} />
    <View className='mini-surface'>
      <Text className='mini-tag'>开发测试账号</Text>
      <View className='mini-field'>
        <Label className='mini-label' for='staff-account'>账号</Label>
        <Input id='staff-account' className='mini-input' value={account} maxlength={64}
          placeholder='请输入工作人员账号' disabled={busy || undefined}
          onInput={(event) => { setAccount(event.detail.value); setError('') }} />
      </View>
      <View className='mini-field'>
        <Label className='mini-label' for='staff-password'>密码</Label>
        <Input id='staff-password' className='mini-input' value={password} password maxlength={128}
          placeholder='请输入密码' confirmType='go' onConfirm={enter} disabled={busy || undefined}
          onInput={(event) => { setPassword(event.detail.value); setError('') }} />
      </View>
      <Text className='mini-caption'>绑定平台工作人员的联调账号，仅开发环境有效。</Text>
      {!!error && <Text className='mini-error'>{error}</Text>}
      <Button className='mini-primary mini-block' loading={busy} disabled={busy || !account.trim() || !password || undefined} onClick={enter}>
        <Icon name='briefcase' tone='white' size={36} /><Text>登录工作人员端</Text>
      </Button>
      <Button className='mini-secondary mini-block' onClick={goBack}>返回群众端</Button>
    </View>
  </View>
}
