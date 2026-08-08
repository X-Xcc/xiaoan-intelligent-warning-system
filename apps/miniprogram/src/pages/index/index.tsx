import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import logoUrl from '@/assets/jiangtan-zhifang-logo.svg'
import { LanguagePicker } from '@/components/LanguagePicker'
import { useLocale } from '@/i18n'
import './index.scss'

export default function LoginEntry() {
  const { t } = useLocale()

  const openVisitor = () => {
    Taro.redirectTo({ url: '/pages/main/main?mode=visitor' })
  }

  const openStaff = () => {
    Taro.redirectTo({ url: '/pages/main/main?mode=staffLogin' })
  }

  return (
    <View className='login-shell'>
      <View className='login-card'>
        <LanguagePicker className='login-language' />
        <Text className='login-kicker'>{t('login.kicker')}</Text>
        <View className='brand-mark'>
          <Image className='brand-logo' src={logoUrl} mode='aspectFit' />
        </View>
        <Text className='login-title'>{t('login.title')}</Text>
        <Text className='login-subtitle'>{t('login.subtitle')}</Text>
        <View className='login-value'>
          <Text>{t('login.opening')}</Text>
          <Text>{t('login.services')}</Text>
          <Text>{t('login.help')}</Text>
        </View>
        <Button className='wechat-login' onClick={openVisitor}>{t('login.visitor')}</Button>
        <Button className='staff-login-entry' onClick={openStaff}>{t('login.staff')}</Button>
      </View>
    </View>
  )
}
