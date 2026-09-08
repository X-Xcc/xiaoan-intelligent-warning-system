import { useEffect, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { EmptyState, Icon, PageHeader } from '@/components/ui'
import { getAuthToken, requestApi, type WechatLoginSession } from '@/utils/api'
import { errorText } from './citizen/media'

type StaffIdentity = { id: string; name: string; role?: string }
type AuthUser = { openid: string; displayName?: string; role?: string; permissions?: string[] }
const AUTH_TOKEN_KEY = 'yanhuo-shaobing-auth-token'
export type StaffAccessProps = { onEnter: (name: string) => void; onBack: () => void }

// Conditional require keeps development credentials out of native release bundles.
export const StaffAccess: typeof VerifiedStaffAccess = process.env.NODE_ENV === 'development'
  && process.env.TARO_APP_ENABLE_DEV_LOGIN === 'true'
  ? require('./DevStaffAccess').DevStaffAccess : VerifiedStaffAccess

function VerifiedStaffAccess({ onEnter, onBack }: StaffAccessProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    return () => {
      mounted.current = false
      generation.current += 1
    }
  }, [])
  const enter = async () => {
    if (!mounted.current || entryLock.current) return
    entryLock.current = true
    const attempt = ++generation.current
    let expectedToken = getAuthToken()
    const canContinue = () => {
      if (!isCurrent(attempt)) return false
      if (getAuthToken() !== expectedToken) throw new Error('登录会话已变更，请重新验证工作身份。')
      return true
    }
    setBusy(true)
    setError('')
    try {
      const login = await Taro.login({ timeout: 8000 })
      if (!canContinue()) return
      if (!login.code) throw new Error('微信登录没有返回 code，请重试。')
      const session = await requestApi<WechatLoginSession>('/auth/wechat-login', {
        method: 'POST',
        data: { code: login.code },
      })
      if (!canContinue()) return
      if (typeof session?.token !== 'string' || !session.token.trim()) throw new Error('微信登录未返回有效会话，请重试。')
      // Unlike the shared login helper, defer credential storage until cancellation and token checks pass.
      Taro.setStorageSync(AUTH_TOKEN_KEY, session.token)
      expectedToken = session.token
      const { user } = await requestApi<{ user: AuthUser }>('/auth/me')
      if (!canContinue()) return
      if (!user.permissions?.includes('dispatch') || !['巡防', '指挥员', '管理员'].includes(user.role || '')) throw new Error('当前微信身份未开通工作人员权限，请联系平台管理员。')
      const result = await requestApi<{ items: StaffIdentity[] }>('/events/staff')
      if (!canContinue()) return
      const identity = result.items.find((item) => item.name === user.displayName)
      if (!identity) throw new Error('当前微信身份尚未绑定巡防人员，请联系平台管理员完成绑定。')
      onEnter(identity.name)
    } catch (err) {
      if (isCurrent(attempt)) setError(errorText(err, '身份验证未完成，请重试'))
    } finally {
      if (isCurrent(attempt)) {
        entryLock.current = false
        setBusy(false)
      }
    }
  }
  return <View className='mini-app'><PageHeader title='工作人员登录' subtitle='烟火哨兵 · 工作身份' brand onBack={goBack} />
    <View className='mini-surface'>
      <EmptyState title='验证工作身份' description='使用已获授权并绑定巡防人员的微信账号' />
      {!!error && <Text className='mini-error'>{error}</Text>}
      <Button className='mini-primary mini-block' loading={busy} disabled={busy || undefined} onClick={enter}><Icon name='briefcase' tone='white' size={36} /><Text>验证并进入工作台</Text></Button>
      <Button className='mini-secondary mini-block' onClick={goBack}>返回群众端</Button>
    </View></View>
}
