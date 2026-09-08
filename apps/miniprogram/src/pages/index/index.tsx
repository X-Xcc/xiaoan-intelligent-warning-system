import { useEffect, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { loginWithWechat } from '@/utils/api'
import yanhuoShaobingLogo from '@/assets/yanhuo-shaobing-logo.png'
import './index.scss'

const ENABLE_DEV_LOGIN = process.env.TARO_APP_ENABLE_DEV_LOGIN === 'true'

export default function LoginEntry() {
  const [accepted, setAccepted] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    if (typeof Taro.setNavigationBarTitle === 'function') {
      Taro.setNavigationBarTitle({ title: '用户登录' })
    }
  }, [])

  const openVisitor = async () => {
    if (!accepted) {
      Taro.showToast({ title: '请先勾选协议', icon: 'none' })
      return
    }
    if (ENABLE_DEV_LOGIN) {
      Taro.reLaunch({ url: '/pages/main/main?mode=visitor' })
      return
    }
    setLoginError('')
    setLoggingIn(true)
    try {
      await loginWithWechat()
      Taro.redirectTo({ url: '/pages/main/main?mode=visitor' })
    } catch (error) {
      if (ENABLE_DEV_LOGIN) {
        Taro.redirectTo({ url: '/pages/main/main?mode=visitor' })
        return
      }
      setLoginError('微信登录没完成，请稍后再试。')
      Taro.showToast({ title: '微信登录没完成', icon: 'none' })
    } finally {
      setLoggingIn(false)
    }
  }

  const openStaff = () => {
    Taro.redirectTo({ url: '/pages/main/main?mode=staffLogin' })
  }

  const skipLogin = () => {
    Taro.reLaunch({ url: '/pages/main/main?mode=visitor' })
  }

  return (
    <View className='auth-page'>
      <View className='auth-hero'>
        <View className='auth-hero-copy auth-brand'>
          <View className='brand-header'>
            <View className='brand-mark'>
              <Image className='brand-logo-image' src={yanhuoShaobingLogo} mode='aspectFit' />
            </View>
            <Text className='login-title'>烟火哨兵</Text>
            <Text className='login-subtitle'>面向夜间商圈的安全治理与联动处置平台</Text>
          </View>
        </View>
        <View className='auth-hero-pill'>
          <Text className='auth-hero-pill-left'>···</Text>
          <Text className='auth-hero-pill-right' />
        </View>
        <View className='auth-hero-art'>
          <View className='auth-art-orbit' />
          <View className='auth-art-device'>
            <View className='auth-art-screen' />
            <View className='auth-art-base' />
          </View>
        </View>
      </View>

      <View className='auth-surface'>
        <View className='auth-tabs'>
          <View className='auth-tab active'>
            <Text className='auth-tab-title'>用户登录</Text>
            <View className='auth-tab-indicator' />
          </View>
          <View className='auth-tab' onClick={openStaff}>
            <Text className='auth-tab-title'>工作人员登录</Text>
            <View className='auth-tab-indicator' />
          </View>
        </View>

        <View className='auth-card'>
          <View className='auth-check-row' onClick={() => setAccepted(!accepted)}>
            <View className={`auth-checkbox ${accepted ? 'checked' : ''}`}>
              {accepted && <Text>✓</Text>}
            </View>
            <Text>《烟火哨兵用户服务协议》及《隐私政策》</Text>
          </View>

          <Button className='auth-primary-btn' loading={loggingIn} disabled={loggingIn || undefined} onClick={openVisitor}>
            登录
          </Button>

          <Text className='auth-skip' onClick={skipLogin}>暂不登录</Text>

          {loginError && <Text className='auth-error'>{loginError}</Text>}
        </View>
      </View>
    </View>
  )
}
