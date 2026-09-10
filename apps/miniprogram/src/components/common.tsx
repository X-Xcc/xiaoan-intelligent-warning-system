import { Text, View } from '@tarojs/components'

type MetricTone = 'safe' | 'blue' | 'warn'

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className='page-header'>
      <Text>{title}</Text>
      {subtitle && <Text>{subtitle}</Text>}
    </View>
  )
}

export function MetricCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: string
  tone: MetricTone
  onClick?: () => void
}) {
  return (
    <View className={`metric-card ${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <Text>{label}</Text>
      <Text>{value}</Text>
    </View>
  )
}

export function CardTitle({ title, action }: { title: string; action?: string }) {
  return (
    <View className='card-title'>
      <Text>{title}</Text>
      {action && <Text>{action}</Text>}
    </View>
  )
}
