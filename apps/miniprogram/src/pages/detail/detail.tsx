import { useEffect } from 'react'
import { View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { PageHeader } from '@/components/ui'
import { detailMap, normalizeDetailType } from '@/data/detail'
import { EventDetail } from './event-detail'
import { ServicePages } from './service-pages'
import { goToMain } from './native-actions'
import './detail.scss'

export default function DetailPage() {
  const { params } = useRouter()
  const type = normalizeDetailType(params.type)
  const meta = detailMap[type]
  const eventPage = type === 'serviceOrder' || type === 'staffOrder'

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: meta.title }).catch(() => undefined)
  }, [meta.title])

  const goBack = () => {
    Taro.navigateBack({ delta: 1 }).catch(() => goToMain('tab=home'))
  }

  return (
    <View className='mini-app detail-page'>
      <PageHeader title={meta.title} subtitle={meta.subtitle} eyebrow={meta.badge} onBack={goBack} />
      <View className='mini-surface detail-surface'>
        <View className='mini-page-content detail-content'>
          {eventPage
            ? <EventDetail key={`${type}:${params.id || ''}`} eventId={params.id || ''} staff={type === 'staffOrder'} />
            : <ServicePages key={type} type={type} />}
        </View>
      </View>
    </View>
  )
}
