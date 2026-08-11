import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getLocaleOption, localeOptions, useLocale, type Locale } from '@/i18n'

export function LanguagePicker({ className = '', variant = 'default' }: { className?: string; variant?: 'default' | 'row' }) {
  const { locale, setLocale, t } = useLocale()
  const [open, setOpen] = useState(false)
  const current = getLocaleOption(locale)

  const choose = (next: Locale) => {
    setLocale(next)
    setOpen(false)
    Taro.showToast({ title: t('language.changed'), icon: 'none' })
  }

  return (
    <View className={`language-picker ${variant === 'row' ? 'row' : ''} ${open ? 'open' : 'collapsed'} ${className}`}>
      <View className='language-picker-head' onClick={() => setOpen(!open)}>
        <Text className='language-picker-label'>{t('language')}</Text>
        <View className='language-picker-summary'>
          <Text className='language-picker-current'>{current.nativeName}</Text>
          <Text className='language-picker-arrow'>{open ? '⌃' : '⌄'}</Text>
        </View>
      </View>
      {open && (
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
      )}
    </View>
  )
}
