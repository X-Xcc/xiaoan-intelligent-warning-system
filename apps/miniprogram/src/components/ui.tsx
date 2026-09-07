import type { PropsWithChildren } from 'react'
import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { SafetyEvent } from '@/types/events'
import { iconAssets } from '@/assets/icons/icon-assets'
import brandMark from '@/assets/yanhuo-shaobing-mark.png'

export type IconTone = 'blue' | 'muted' | 'danger' | 'green' | 'amber' | 'white' | 'ink'

export function Icon({ name, tone = 'muted', size = 40 }: { name: string; tone?: IconTone; size?: number }) {
  const variants = iconAssets[name] || iconAssets.info
  return <Image className='mini-icon' src={variants[tone]} mode='aspectFit' style={{ width: Taro.pxTransform(size), height: Taro.pxTransform(size) }} />
}

export function PageHeader({ title, subtitle, eyebrow, brand, onBack, children }: PropsWithChildren<{
  title: string; subtitle?: string; eyebrow?: string; brand?: boolean; onBack?: () => void
}>) {
  return <View className='mini-page-header'>
    {onBack && <Button className='mini-header-back' onClick={onBack} aria-label='返回'><Icon name='arrowLeft' tone='ink' size={36} /><Text>返回</Text></Button>}
    {eyebrow && <Text className='mini-eyebrow'>{eyebrow}</Text>}
    <View className='mini-header-row'>
      <View className='mini-header-copy'><Text className='mini-page-title'>{title}</Text>{subtitle && <Text className='mini-header-subtitle'>{subtitle}</Text>}{children}</View>
      {brand && <Image className='mini-brand-mark' src={brandMark} mode='aspectFit' />}
    </View>
  </View>
}

export function Section({ title, action, onAction, children }: PropsWithChildren<{ title: string; action?: string; onAction?: () => void }>) {
  return <View className='mini-section'>
    <View className='mini-section-head'><Text className='mini-section-title'>{title}</Text>
      {action && <Button className='mini-text-action' onClick={onAction}><Text>{action}</Text><Icon name='chevronRight' size={26} /></Button>}
    </View>{children}
  </View>
}

export function EmptyState({ title, description, onRetry }: { title: string; description?: string; onRetry?: () => void }) {
  return <View className='mini-empty'>
    <View className='mini-empty-icon'><Icon name={onRetry ? 'refresh' : 'shield'} tone='blue' size={52} /></View>
    <Text className='mini-empty-title'>{title}</Text>
    {description && <Text className='mini-empty-description'>{description}</Text>}
    {onRetry && <Button className='mini-secondary mini-empty-retry' onClick={onRetry}><Icon name='refresh' size={30} /><Text>重新加载</Text></Button>}
  </View>
}

export function BottomSheet({ title, onClose, children }: PropsWithChildren<{ title: string; onClose: () => void }>) {
  return <View className='mini-sheet-overlay' onClick={onClose}>
    <View className='mini-sheet' onClick={(event) => event.stopPropagation()} aria-label={title}>
      <View className='mini-sheet-handle' />
      <View className='mini-sheet-head'><Text>{title}</Text><Button className='mini-icon-button' onClick={onClose} aria-label='关闭'><Icon name='close' /></Button></View>
      <ScrollView className='mini-sheet-scroll' scrollY enhanced>{children}</ScrollView>
    </View>
  </View>
}

export const eventStatusLabels: Record<string, string> = {
  '已提交': '待平台确认', '已派单': '已派单', '已接收': '已接单',
  '已到达': '已到场', '处理中': '处理中', '已完成': '已完成',
}

export function EventCard({ event, onClick }: { event: SafetyEvent; onClick?: () => void }) {
  const done = event.status === '已完成'
  return <Button className='mini-event-card' onClick={onClick}>
    <View className={`mini-event-symbol ${event.kind === 'help' ? 'danger' : ''}`}><Icon name={event.kind === 'help' ? 'siren' : event.kind === 'lost' ? 'search' : 'report'} tone={event.kind === 'help' ? 'danger' : 'blue'} size={38} /></View>
    <View className='mini-event-copy'><Text className='mini-event-title'>{event.title}</Text><Text className='mini-event-meta'>{event.bay} · {event.time}</Text></View>
    <View className='mini-event-state'><Text className={done ? 'mini-success' : 'mini-blue'}>{eventStatusLabels[event.status] || event.status}</Text><Icon name='chevronRight' size={25} /></View>
  </Button>
}
