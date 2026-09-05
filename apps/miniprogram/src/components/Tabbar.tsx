import { Text, View } from '@tarojs/components'
import { useLocale } from '@/i18n'
import type { TabKey } from '@/types/events'

const tabs: Array<{
  key: TabKey
  label: 'nav.home' | 'nav.report' | 'nav.help' | 'nav.progress' | 'nav.mine'
  icon: string
}> = [
  { key: 'home', label: 'nav.home', icon: '⌂' },
  { key: 'report', label: 'nav.report', icon: '▤' },
  { key: 'help', label: 'nav.help', icon: 'SOS' },
  { key: 'progress', label: 'nav.progress', icon: '◷' },
  { key: 'mine', label: 'nav.mine', icon: '●' },
]

export function Tabbar({ active, setTab }: { active: TabKey; setTab: (tab: TabKey) => void }) {
  const { t } = useLocale()

  return (
    <View className='tabbar'>
      {tabs.map(({ key, label, icon }) => (
        <View
          key={key}
          className={`tab-item ${active === key ? 'active' : ''} ${key === 'help' ? 'help-tab' : ''}`}
          onClick={() => setTab(key)}
          aria-label={t(label)}
          aria-current={active === key ? 'page' : undefined}
        >
          <Text className='tab-icon'>{icon}</Text>
          <Text className='tab-label'>{t(label)}</Text>
        </View>
      ))}
    </View>
  )
}
