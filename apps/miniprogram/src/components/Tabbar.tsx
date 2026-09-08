import { Button, Text, View } from '@tarojs/components'
import { Icon } from '@/components/ui'
import type { TabKey } from '@/types/events'

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'home', label: '首页', icon: 'home' },
  { key: 'report', label: '上报', icon: 'report' },
  { key: 'help', label: '报警', icon: 'siren' },
  { key: 'progress', label: '进度', icon: 'clock' },
  { key: 'mine', label: '我的', icon: 'user' },
]

export function Tabbar({ active, setTab }: { active: TabKey; setTab: (tab: TabKey) => void }) {
  return <View className='mini-bottom-nav'>
    {tabs.map((item) => <Button key={item.key} className={`mini-nav-item ${active === item.key ? 'active' : ''} ${item.key === 'help' ? 'alarm' : ''}`} onClick={() => setTab(item.key)} aria-label={item.label}>
      {item.key === 'help' ? <View className='mini-nav-sos'><Icon name='siren' tone='white' size={44} /></View> : <Icon name={item.icon} tone={active === item.key ? 'blue' : 'muted'} size={42} />}
      <Text>{item.label}</Text>
    </Button>)}
  </View>
}
