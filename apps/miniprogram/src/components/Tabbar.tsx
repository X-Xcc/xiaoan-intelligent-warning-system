import { Text, View } from '@tarojs/components'
import { useLocale } from '@/i18n'
import type { TabKey } from '@/types/events'

const tabs: Array<[TabKey, 'nav.home' | 'nav.report' | 'nav.help' | 'nav.progress' | 'nav.mine']> = [
  ['home', 'nav.home'],
  ['report', 'nav.report'],
  ['help', 'nav.help'],
  ['progress', 'nav.progress'],
  ['mine', 'nav.mine'],
]

export function Tabbar({ active, setTab }: { active: TabKey; setTab: (tab: TabKey) => void }) {
  const { t } = useLocale()

  return (
    <View className='tabbar'>
      {tabs.map(([key, label]) => (
        <View
          key={key}
          className={`tab-item ${active === key ? 'active' : ''} ${key === 'help' ? 'help-tab' : ''}`}
          onClick={() => setTab(key)}
        >
            <Text>{t(label)}</Text>
        </View>
      ))}
    </View>
  )
}
