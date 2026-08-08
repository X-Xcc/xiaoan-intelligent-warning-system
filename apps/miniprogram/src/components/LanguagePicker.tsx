import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getLocaleOption, localeOptions, useLocale, type Locale } from '@/i18n'

export function LanguagePicker({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale()
  const current = getLocaleOption(locale)

  const choose = (next: Locale) => {
    setLocale(next)
    Taro.showToast({ title: t('language.changed'), icon: 'none' })
  }

  return (
    <View className={`language-picker ${className}`}>
      <View className='language-picker-head'>
        <Text className='language-picker-label'>{t('language')}</Text>
        <Text className='language-picker-current'>{current.nativeName}</Text>
      </View>
      <View className='language-options'>
        {localeOptions.map((item) => (
          <View
            key={item.code}
            className={`language-option ${item.code === locale ? 'selected' : ''}`}
            onClick={() => choose(item.code)}
          >
            <Text>{item.nativeName}</Text>
            <Text>{item.englishName}</Text>
            {item.code === locale && <Text className='language-check'>✓</Text>}
          </View>
        ))}
      </View>
    </View>
  )
}
