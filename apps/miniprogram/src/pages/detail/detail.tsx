import { useEffect, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { detailMap, normalizeDetailType, type DetailType } from '@/data/detail'
import { bayOptions, statusFlow } from '@/data/safety'
import type { GeoPoint, SafetyEvent } from '@/types/events'
import { fetchSafetyEvent } from '@/utils/api'
import yanhuoShaobingMark from '@/assets/yanhuo-shaobing-mark.png'
import './detail.scss'

export default function DetailPage() {
  const router = useRouter()
  const type = normalizeDetailType(router.params.type)
  const meta = detailMap[type]

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: meta.title })
  }, [meta.title])

  return (
    <View className='detail-page'>
      <View className='detail-topbar'>
        <Button className='detail-back' onClick={() => Taro.navigateBack({ delta: 1 })}>‹ 返回</Button>
        <View className='detail-brand'>
          <Image className='detail-brand-logo' src={yanhuoShaobingMark} mode='aspectFit' />
          <Text>烟火哨兵</Text>
        </View>
      </View>
      <View className={`detail-hero ${type}`}>
        <Text className='detail-badge'>{meta.badge}</Text>
        <Text className='detail-title'>{meta.title}</Text>
        <Text className='detail-subtitle'>{meta.subtitle}</Text>
      </View>
      <DetailContent type={type} params={router.params} />
    </View>
  )
}

function DetailContent({ type, params }: { type: DetailType; params: Record<string, string | undefined> }) {
  const eventId = params.id || ''
  const [event, setEvent] = useState<SafetyEvent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (type !== 'serviceOrder' && type !== 'staffOrder') return undefined
    if (!eventId) {
      setEvent(null)
      setError('先选择一条事件记录。')
      return undefined
    }

    let mounted = true
    setLoading(true)
    setError('')
    fetchSafetyEvent(eventId)
      .then((next) => {
        if (mounted) setEvent(next)
      })
      .catch(() => {
        if (mounted) {
          setEvent(null)
          setError('事件详情没打开，请返回列表再试。')
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [eventId, type])

  if (type === 'serviceOrder' || type === 'staffOrder') {
    if (loading) {
      return <StatusCard label='事件详情' value='读取中' desc='正在打开这条记录' tone='blue' />
    }
    if (!event) {
      return <StatusCard label='事件详情' value='暂时看不了' desc={error || '还没有选事件'} tone='warn' />
    }
    return type === 'staffOrder' ? <StaffOrderDetail event={event} /> : <ServiceOrderDetail event={event} />
  }

  if (type === 'lost') {
    return (
      <View>
        <StatusCard label='线索登记' value='提交后可查' desc='线索会进入待核验记录' tone='blue' />
        <InfoSection title='怎么登记' body='在首页选择失物线索，写清物品或线索名称；提交后到我的进度里看。' />
      </View>
    )
  }

  if (type === 'rescue') {
    return (
      <View>
        <StatusCard label='附近点位' value='按地图查看' desc='点位以小程序地图和后台配置为准' tone='safe' />
        <InfoSection title='怎么用' body='要去某个点位时，在地图上点一下，再打开导航。' />
      </View>
    )
  }

  if (type === 'bay') {
    return (
      <View>
        <StatusCard label='夜市网格' value={`${bayOptions.length} 个网格`} desc='网格名称来自后台配置，事件状态来自事件库' tone='blue' />
        {bayOptions.map((item) => <View className='simple-row' key={item}><Text>{item}</Text><Text>已配置</Text></View>)}
      </View>
    )
  }

  if (type === 'processing' || type === 'help' || type === 'report') {
    return (
      <View>
        <StatusCard label='事件记录' value='进度页查看' desc='求助、上报和线索都会在这里更新' tone='blue' />
        <Button className='primary-action' onClick={() => Taro.navigateTo({ url: '/pages/main/main?tab=progress' })}>查看我的进度</Button>
      </View>
    )
  }

  if (type === 'privacy') {
    return (
      <View>
        <StatusCard label='数据使用' value='只用于现场处理' desc='定位和联系方式用于求助、上报、派单和回访' tone='safe' />
        {[
          '定位只用于求助、上报和附近联动点匹配。',
          '联系方式可以不填，只在回访时使用。',
          '可通过管理流程申请查询、更正或删除相关记录。',
        ].map((item) => <View className='policy-row' key={item}><Text>{item}</Text></View>)}
      </View>
    )
  }

  if (type === 'about') {
    return (
      <View>
        <StatusCard label='关于烟火哨兵' value='夜市现场服务' desc='商户、游客、指挥中心和巡防人员一起用' tone='blue' />
        <InfoSection title='能做什么' body='可提交求助、上报现场问题、登记线索，也能查看派单和处理结果。' />
      </View>
    )
  }

  return (
    <View>
      <StatusCard label='安全提醒' value='按现场情况判断' desc='遇到紧急危险请优先拨打 110 或 120' tone='warn' />
      {[
        '儿童请全程陪同，不要在高峰通道长时间停留。',
        '发现人员围观、推搡或酒后滋事，请先保持安全距离。',
        '发现摊位纠纷、扒窃线索或人员异常，可以上报位置。',
        '紧急情况请先拨打 110 或 120，再发送现场位置。',
      ].map((item) => <View className='policy-row' key={item}><Text>{item}</Text></View>)}
    </View>
  )
}

function ServiceOrderDetail({ event }: { event: SafetyEvent }) {
  return (
    <View>
      <StatusCard label='当前状态' value={event.status} desc={`${event.bay} · 编号 ${event.id} · ${event.owner}`} tone={event.level === '高风险' ? 'danger' : 'blue'} />
      <View className='order-summary'>
        <Text>{event.title}</Text>
        <Text>{event.description}</Text>
        <Text>来源：{event.source}</Text>
        <Text>更新时间：{event.updatedAt}</Text>
      </View>
      <LocationCard point={event.meta?.alarmLocation ?? event.meta?.reporterLocation} bay={event.bay} />
      <FlowCard active={event.status} />
    </View>
  )
}

function StaffOrderDetail({ event }: { event: SafetyEvent }) {
  const route = event.meta?.route
  return (
    <View>
      <StatusCard label='工单风险' value={event.level} desc={`${event.bay} · ${event.id} · 当前${event.status}`} tone={event.level === '高风险' ? 'danger' : 'warn'} />
      <View className='staff-note'>
        <Text>现场处置提示</Text>
        <Text>先确认人员安全，再补现场照片和处理结果；高风险工单要及时请求支援。</Text>
      </View>
      {route && (
        <View className='soft-map'>
          <Text>推荐交通：{route.modeLabel}</Text>
          <Text>距离 {route.distanceLabel} · 预计 {route.etaLabel}</Text>
        </View>
      )}
      <LocationCard point={event.meta?.alarmLocation ?? route?.destination} bay={event.bay} />
      <View className='action-grid'>
        <Button onClick={() => Taro.showToast({ title: '已联系报警人', icon: 'none' })}>联系报警人</Button>
        <Button onClick={() => Taro.showToast({ title: '已请求支援', icon: 'none' })}>请求支援</Button>
        <Button onClick={() => openLocation(event.meta?.alarmLocation ?? route?.destination, event.bay)}>查看路线</Button>
        <Button onClick={() => Taro.showToast({ title: '已发给指挥端', icon: 'none' })}>发给指挥</Button>
      </View>
      <FlowCard active={event.status} />
    </View>
  )
}

function LocationCard({ point, bay }: { point?: GeoPoint; bay: string }) {
  return (
    <View className='soft-map' onClick={() => openLocation(point, bay)}>
      <Text>{point ? '报警点已定位' : '报警点待定位'}</Text>
      <Text>{point ? `${point.name ?? bay} · ${point.latitude}, ${point.longitude}` : bay}</Text>
    </View>
  )
}

function openLocation(point: GeoPoint | undefined, bay: string) {
  if (!point) {
    Taro.showToast({ title: '还没有可导航坐标', icon: 'none' })
    return
  }
  Taro.openLocation({
    latitude: point.latitude,
    longitude: point.longitude,
    name: point.name ?? bay,
    address: bay,
    scale: 16,
  })
}

function InfoSection({ title, body }: { title: string; body: string }) {
  return (
    <View className='info-section'>
      <Text>{title}</Text>
      <Text>{body}</Text>
    </View>
  )
}

function StatusCard({ label, value, desc, tone }: { label: string; value: string; desc: string; tone: 'safe' | 'blue' | 'warn' | 'danger' }) {
  return (
    <View className={`status-card ${tone}`}>
      <Text>{label}</Text>
      <Text>{value}</Text>
      <Text>{desc}</Text>
    </View>
  )
}

function FlowCard({ active }: { active: string }) {
  const index = Math.max(0, statusFlow.indexOf(active as typeof statusFlow[number]))
  return (
    <View className='flow-card'>
      <Text>事件进度</Text>
      {statusFlow.map((step, stepIndex) => (
        <View className='flow-row' key={step}>
          <Text className={stepIndex <= index ? 'flow-dot active' : 'flow-dot'} />
          <View>
            <Text>{step}</Text>
            <Text>{stepIndex <= index ? '已有记录' : '等巡防组更新'}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
