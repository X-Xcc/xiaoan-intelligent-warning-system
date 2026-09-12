import { useEffect } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import yanhuoShaobingLogo from '@/assets/yanhuo-shaobing-logo.png'
import './index.scss'

export default function ServiceEntry() {
  useEffect(() => {
    if (typeof Taro.setNavigationBarTitle === 'function') {
      Taro.setNavigationBarTitle({ title: '服务入口' })
    }
  }, [])

  const openVisitor = () => {
    Taro.redirectTo({ url: '/pages/main/main?mode=visitor' })
  }

  const openStaff = () => {
    Taro.redirectTo({ url: '/pages/main/main?mode=staff' })
  }

  return (
    <View className='auth-page'>
      <View className='auth-hero'>
        <View className='auth-hero-copy auth-brand'>
          <View className='brand-header'>
            <View className='brand-mark'>
              <Image className='brand-logo-image' src={yanhuoShaobingLogo} mode='aspectFit' />
            </View>
            <Text className='login-title'>小安智能预警系统</Text>
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
            <Text className='auth-tab-title'>群众服务</Text>
            <View className='auth-tab-indicator' />
          </View>
          <View className='auth-tab' onClick={openStaff}>
            <Text className='auth-tab-title'>工作人员入口</Text>
            <View className='auth-tab-indicator' />
          </View>
        </View>

        <View className='auth-card'>
          <Button className='auth-primary-btn' onClick={openVisitor}>
            进入群众端
          </Button>
        </View>
      </View>
    </View>
  )
}
