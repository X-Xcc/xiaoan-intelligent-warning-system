import { useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import logoUrl from '@/assets/jiangtan-zhifang-logo.svg'
import { LanguagePicker } from '@/components/LanguagePicker'
import { useLocale } from '@/i18n'
import { loginWithWechat } from '@/utils/api'
import './index.scss'

export default function LoginEntry() {
  const { t } = useLocale()
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState('')

  const openVisitor = async () => {
    setLoginError('')
    setLoggingIn(true)
    try {
      await loginWithWechat()
      Taro.redirectTo({ url: '/pages/main/main?mode=visitor' })
    } catch (error) {
      setLoginError('暂时无法完成微信登录，请确认登录服务已启动后重试。')
      Taro.showToast({ title: '登录服务不可用', icon: 'none' })
    } finally {
      setLoggingIn(false)
    }
  }

  const openStaff = () => {
    Taro.redirectTo({ url: '/pages/main/main?mode=staffLogin' })
  }

  return (
    <View className='login-shell wechat-auth-shell'>
      <View className='login-content wechat-auth-content'>
        <View className='brand-header auth-brand'>
          <View className='brand-mark'>
            <Image className='brand-logo' src={logoUrl} mode='aspectFit' />
          </View>
          <Text className='login-title'>今日江滩</Text>
          <Text className='login-subtitle'>使用微信账号登录，查看服务记录和处置进度</Text>
        </View>

        <View className='login-panel auth-panel'>
          <View className='auth-account-card'>
            <View className='auth-wechat-avatar'>微</View>
            <View>
              <Text>微信账号快捷登录</Text>
              <Text>仅用于同步你的求助、反馈和服务进度。</Text>
            </View>
          </View>

          <View className='auth-scope-list'>
            <View>
              <Text>服务记录</Text>
              <Text>保存求助、反馈和失物登记进度</Text>
            </View>
            <View>
              <Text>身份识别</Text>
              <Text>通过微信 openid 识别同一位游客</Text>
            </View>
          </View>

          <View className='login-actions'>
            <Button className='wechat-login' loading={loggingIn} disabled={loggingIn} onClick={openVisitor}>
              {!loggingIn && <Text className='wechat-login-mark'>微</Text>}
              <Text>{loggingIn ? '正在登录' : '微信一键登录'}</Text>
            </Button>
            <Button className='staff-login-entry' onClick={openStaff}>{t('login.staff')}</Button>
          </View>
          {loginError && <Text className='login-error'>{loginError}</Text>}
        </View>

        <LanguagePicker className='login-language' />
        <Text className='login-support'>登录即表示同意《隐私说明》，江滩服务中心 7x24 巡防在线。</Text>
      </View>
    </View>
  )
}
