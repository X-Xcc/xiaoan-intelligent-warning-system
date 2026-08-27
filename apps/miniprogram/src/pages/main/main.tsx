import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Map, Text, Textarea, View } from '@tarojs/components'
import type { MapProps } from '@tarojs/components/types/Map'
import Taro, { useRouter } from '@tarojs/taro'
import { CardTitle, MetricCard, PageHeader } from '@/components/common'
import { LanguagePicker } from '@/components/LanguagePicker'
import { Tabbar } from '@/components/Tabbar'
import { bayOptions, reportCategories, statusFlow, statusRank } from '@/data/safety'
import { useSafetyEvents, type ProgressFilter } from '@/hooks/useSafetyEvents'
import type { AppMode, EventKind, EventStatus, ReportForm, SafetyEvent, TabKey } from '@/types/events'
import { openDetail } from '@/utils/navigation'
import { fetchStaffTasks, refreshEventRoute, updateStaffLocation } from '@/utils/api'
import { useLocale } from '@/i18n'
import markerDanger from '@/assets/map-marker-danger.png'
import markerSafe from '@/assets/map-marker-safe.png'
import markerService from '@/assets/map-marker-service.png'
import markerWarn from '@/assets/map-marker-warn.png'
import './main.scss'

type MainMode = Exclude<AppMode, 'login'>

const visitorTitleKeys: Record<TabKey, 'nav.home' | 'nav.report' | 'nav.help' | 'nav.progress' | 'nav.mine'> = {
  home: 'nav.home',
  report: 'nav.report',
  help: 'nav.help',
  progress: 'nav.progress',
  mine: 'nav.mine',
}

const tabKeys: TabKey[] = ['home', 'report', 'help', 'progress', 'mine']

function normalizeTab(tab?: string): TabKey {
  return tabKeys.includes(tab as TabKey) ? (tab as TabKey) : 'home'
}

type MarkerTone = 'safe' | 'warn' | 'danger' | 'service'

type JiangtanMapPoint = {
  id: number
  bay: string
  name: string
  address: string
  latitude: number
  longitude: number
  tone: MarkerTone
  summary: string
}

const jiangtanCenter: MapProps.point = { latitude: 28.682, longitude: 115.8585 }

const mapMarkerIcons: Record<MarkerTone, string> = {
  safe: markerSafe,
  warn: markerWarn,
  danger: markerDanger,
  service: markerService,
}

const jiangtanMapPoints: JiangtanMapPoint[] = [
  {
    id: 1,
    bay: '网格A',
    name: '主街烧烤区',
    address: '夜市主街中段烧烤摊集中区',
    latitude: 28.682,
    longitude: 115.8585,
    tone: 'danger',
    summary: '酒后纠纷和桌边围观高发点',
  },
  {
    id: 2,
    bay: '网格B',
    name: '三号门夜食街',
    address: '夜市三号门入口及摊位通道',
    latitude: 28.6842,
    longitude: 115.8604,
    tone: 'warn',
    summary: '扒窃、拥堵和人流交汇点',
  },
  {
    id: 3,
    bay: '网格C',
    name: '后巷摊位区',
    address: '主街背侧小巷与临时摊点',
    latitude: 28.6808,
    longitude: 115.862,
    tone: 'safe',
    summary: '机器狗巡逻补齐监控盲区',
  },
  {
    id: 4,
    bay: '网格D',
    name: '停车场入口',
    address: '夜市西侧临时停车场',
    latitude: 28.6794,
    longitude: 115.8569,
    tone: 'safe',
    summary: '车辆冲突和散场拥堵关注区',
  },
  {
    id: 5,
    bay: '网格E',
    name: '啤酒广场',
    address: '夜市中心啤酒广场',
    latitude: 28.6832,
    longitude: 115.8562,
    tone: 'warn',
    summary: '醉酒滋事和群体聚集高发点',
  },
  {
    id: 6,
    bay: '网格F',
    name: '亲子餐饮区',
    address: '夜市东侧家庭餐饮片区',
    latitude: 28.6853,
    longitude: 115.8581,
    tone: 'safe',
    summary: '客流平稳，义警巡查在线',
  },
  {
    id: 7,
    bay: '网格G',
    name: '商户服务站',
    address: '夜市综合服务与平安码咨询点',
    latitude: 28.6815,
    longitude: 115.8551,
    tone: 'service',
    summary: '商户义警、急救物资和便民服务点',
  },
]

const staffPatrolPoints: JiangtanMapPoint[] = [
  { id: 31, bay: '巡防点', name: 'PTU快反点', address: '主街烧烤区东侧巡防岗', latitude: 28.6827, longitude: 115.8593, tone: 'service', summary: '王队在线，距主街烧烤区 90m' },
  { id: 32, bay: '巡防点', name: '无人机机巢', address: '三号门夜食街楼顶机巢', latitude: 28.6847, longitude: 115.861, tone: 'service', summary: '李敏在线，空中巡查待命' },
  { id: 33, bay: '巡防点', name: '机器狗巡逻点', address: '后巷摊位区入口', latitude: 28.6804, longitude: 115.8614, tone: 'service', summary: '陈安在线，补盲巡逻中' },
]

const jiangtanIncludePoints: MapProps.point[] = jiangtanMapPoints.map(({ latitude, longitude }) => ({ latitude, longitude }))

function createMapMarkers(points: JiangtanMapPoint[]): MapProps.marker[] {
  return points.map((point) => ({
    id: point.id,
    latitude: point.latitude,
    longitude: point.longitude,
    title: point.name,
    iconPath: mapMarkerIcons[point.tone],
    width: 32,
    height: 32,
    anchor: { x: 0.5, y: 1 },
    callout: {
      content: `${point.name}\n${point.summary}`,
      color: '#123c39',
      fontSize: 12,
      anchorX: 0,
      anchorY: -36,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#DDEBE6',
      bgColor: '#FFFFFF',
      padding: 8,
      display: point.tone === 'danger' ? 'ALWAYS' : 'BYCLICK',
      textAlign: 'center',
    },
  }))
}

function showMapPoint(point: JiangtanMapPoint) {
  Taro.showModal({
    title: point.name,
    content: `${point.address}\n${point.summary}`,
    confirmText: '导航',
    cancelText: '关闭',
    success(res) {
      if (res.confirm) {
        Taro.openLocation({
          latitude: point.latitude,
          longitude: point.longitude,
          name: point.name,
          address: point.address,
          scale: 16,
        })
      }
    },
  })
}

function mapLoadFailed() {
  Taro.showToast({ title: '地图加载异常，请检查定位权限或网络', icon: 'none' })
}

function callEmergency(phoneNumber = '110') {
  Taro.makePhoneCall({ phoneNumber })
}

function findJiangtanPointByBay(bay: string) {
  return jiangtanMapPoints.find((point) => point.name === bay || point.bay === bay) ?? jiangtanMapPoints[1]
}

function getEventAlarmPoint(event: SafetyEvent): MapProps.point {
  const metaPoint = event.meta?.alarmLocation || event.meta?.reporterLocation
  if (metaPoint?.latitude && metaPoint?.longitude) {
    return { latitude: metaPoint.latitude, longitude: metaPoint.longitude }
  }
  if (event.meta?.latitude && event.meta?.longitude) {
    return { latitude: event.meta.latitude, longitude: event.meta.longitude }
  }
  const bayPoint = findJiangtanPointByBay(event.bay)
  return { latitude: bayPoint.latitude, longitude: bayPoint.longitude }
}

function routeLinePoints(event: SafetyEvent): MapProps.point[] {
  return (event.meta?.route?.points || [])
    .filter((point) => point.latitude && point.longitude)
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
}

function routeLabel(event: SafetyEvent) {
  const route = event.meta?.route
  if (!route) return '等待路线推荐'
  return `${route.modeLabel} · ${route.distanceLabel} · ${route.etaLabel}`
}

function eventMarkerTone(event: SafetyEvent): MarkerTone {
  if (event.level === '高风险') return 'danger'
  if (event.level === '中风险') return 'warn'
  return 'safe'
}

export default function MainPage() {
  const router = useRouter()
  const { t } = useLocale()
  const routeMode: MainMode = router.params.mode === 'staffLogin' ? 'staffLogin' : 'visitor'
  const [mode, setMode] = useState<MainMode>(routeMode)
  const [tab, setTab] = useState<TabKey>(normalizeTab(router.params.tab))
  const {
    events,
    latestHelp,
    progressFilter,
    loading,
    error: serviceError,
    reloadEvents,
    setProgressFilter,
    createHelp,
    createReport,
    createLostClaim,
    updateEventStatus,
  } = useSafetyEvents()

  useEffect(() => {
    setTab(normalizeTab(router.params.tab))
  }, [router.params.tab])

  useEffect(() => {
    const title = mode === 'staff' ? '巡防工作台' : mode === 'staffLogin' ? t('login.staff') : t(visitorTitleKeys[tab])
    Taro.setNavigationBarTitle({ title })
  }, [mode, tab])

  const sendHelp = async () => {
    try {
      await createHelp()
      setTab('help')
    } catch (error) {
      Taro.showToast({ title: '求助同步失败，请检查后端服务', icon: 'none' })
    }
  }

  const openProgress = (filter: ProgressFilter) => {
    setProgressFilter(filter)
    setTab('progress')
  }

  if (mode === 'staffLogin') {
    return <StaffLoginView back={() => Taro.reLaunch({ url: '/pages/index/index' })} login={() => setMode('staff')} />
  }

  if (mode === 'staff') {
    return <StaffWorkView events={events} updateEventStatus={updateEventStatus} logout={() => Taro.reLaunch({ url: '/pages/index/index' })} />
  }

  return (
    <View className='app-shell'>
      <View className='phone-page'>
        {tab === 'home' && (
          <HomeView
            events={events}
            loading={loading}
            serviceError={serviceError}
            reloadEvents={reloadEvents}
            setTab={setTab}
            createLostClaim={async (itemName?: string) => {
              await createLostClaim(itemName)
              openProgress('lost')
            }}
          />
        )}
        {tab === 'report' && <ReportView createReport={createReport} openProgress={() => openProgress('report')} />}
        {tab === 'help' && (
          <HelpView
            latestHelp={latestHelp}
            createHelp={sendHelp}
            openProgress={() => openProgress('help')}
          />
        )}
        {tab === 'progress' && (
          <ProgressView
            events={events}
            filter={progressFilter}
            setFilter={setProgressFilter}
            goReport={() => setTab('report')}
            goHelp={() => setTab('help')}
          />
        )}
        {tab === 'mine' && <MineView events={events} logout={() => Taro.reLaunch({ url: '/pages/index/index' })} />}
      </View>
      <Tabbar active={tab} setTab={setTab} />
    </View>
  )
}

function HomeView({
  events,
  loading,
  serviceError,
  reloadEvents,
  setTab,
  createLostClaim,
}: {
  events: SafetyEvent[]
  loading: boolean
  serviceError: string
  reloadEvents: () => Promise<void>
  setTab: (tab: TabKey) => void
  createLostClaim: (itemName?: string) => Promise<void>
}) {
  const activeEvents = events.filter((event) => event.status !== '已完成')
  const latest = activeEvents[0]
  const homeMapMarkers = useMemo(() => createMapMarkers(jiangtanMapPoints), [])
  const serviceItems = [
    { key: 'rescue', title: '联动点位', desc: 'PTU AED 卫生间', icon: '点' },
    { key: 'guide', title: '夜市提醒', desc: '客流 风险 巡防建议', icon: '智' },
    { key: 'parking', title: '停车疏导', desc: '停车场与出口导航', icon: '停' },
    { key: 'station', title: '商户服务站', desc: '平安码 义警联络', icon: '站' },
    { key: 'lost', title: '失物线索', desc: '遗失 扒窃 轨迹', icon: '线' },
    { key: 'report', title: '隐患上报', desc: '街霸 斗殴 噪音', icon: '报' },
  ]

  return (
    <View className='page home-page figma-home'>
      <View className='home-hero-card'>
        <View>
          <Text>夜市智防</Text>
          <Text>主街烧烤区关注中，三号门客流稍多</Text>
        </View>
        <View className='home-hero-weather'>
          <Text>29°C</Text>
          <Text>多云</Text>
        </View>
      </View>

      {serviceError && (
        <View className='error-card service-error-card' onClick={reloadEvents}>
          <Text>服务同步失败</Text>
          <Text>当前显示本地初始数据，点击重试。</Text>
        </View>
      )}
      {loading && <View className='home-activity-banner sync-banner'><Text>!</Text><Text>正在同步后端事件数据</Text></View>}

      <View className='home-status-grid'>
        <View className='home-status-card weather'>
          <Text>今日态势</Text>
          <Text>重点巡防</Text>
        </View>
        <View className='home-status-card people' onClick={() => openDetail('bay')}>
          <Text>客流</Text>
          <Text>稍多</Text>
        </View>
        <View className='home-status-card water' onClick={() => openDetail('guide')}>
          <Text>AI预警</Text>
          <Text>在线</Text>
        </View>
      </View>

      <View className='home-map-card'>
        <Map
          className='native-map'
          longitude={jiangtanCenter.longitude}
          latitude={jiangtanCenter.latitude}
          scale={16}
          minScale={14}
          maxScale={18}
          markers={homeMapMarkers}
          includePoints={jiangtanIncludePoints}
          showLocation
          showScale
          enablePoi
          enableBuilding
          onTap={() => openDetail('bay')}
          onMarkerTap={(event) => {
            const point = jiangtanMapPoints.find((item) => item.id === Number(event.detail.markerId))
            if (point) showMapPoint(point)
          }}
          onError={mapLoadFailed}
        />
        <View className='home-map-tools'>
          <Text>⌖</Text>
          <Text>↗</Text>
        </View>
      </View>

      <View className='home-key-tiles'>
        <View onClick={() => openDetail('bay')}>
          <Text>智防网格</Text>
          <Text>7处</Text>
        </View>
        <View onClick={() => openDetail('guide')}>
          <Text>巡防状态</Text>
          <Text>在线</Text>
        </View>
        <View onClick={() => openDetail('rescue')}>
          <Text>最近联动</Text>
          <Text>90m</Text>
        </View>
      </View>

      <View className='home-section-title'>
        <Text>夜市服务</Text>
        <Text onClick={() => openDetail('rescue')}>联动点位</Text>
      </View>

      <View className='figma-service-grid'>
        {serviceItems.map((item) => (
          <View
            key={item.key}
            className='figma-service-item'
            onClick={() => {
              if (item.key === 'report') {
                setTab('report')
                return
              }
              if (item.key === 'lost') {
                createLostClaim().catch(() => Taro.showToast({ title: '线索登记提交失败', icon: 'none' }))
                return
              }
              openDetail(item.key === 'parking' || item.key === 'station' ? 'rescue' : item.key)
            }}
          >
            <View className={`figma-service-icon ${item.key}`}><Text>{item.icon}</Text></View>
            <Text>{item.title}</Text>
          </View>
        ))}
      </View>

      <View className='home-report-entry' onClick={() => setTab('report')}>
        <View>
          <Text>群众随手拍 · 夜市隐患上报</Text>
          <Text>发现街霸滋扰、打架苗头、扒窃线索、噪音扰民等问题，可提交点位和照片，后续在进度页查看处置结果。</Text>
        </View>
        <Text>去上报</Text>
      </View>

      <View className='home-activity-banner' onClick={() => latest ? openDetail('serviceOrder', { id: latest.id, title: latest.title, status: latest.status, bay: latest.bay, level: latest.level }) : openDetail('guide')}>
        <Text>!</Text>
        <Text>{latest ? `${latest.title} · ${latest.status}` : '今晚运行平稳，巡防组、商户义警和智能装备在线'}</Text>
      </View>
    </View>
  )
}

function ReportView({
  createReport,
  openProgress,
}: {
  createReport: (form: ReportForm, photoCount: number) => Promise<SafetyEvent>
  openProgress: () => void
}) {
  const [form, setForm] = useState<ReportForm>({ category: '街霸滋扰', bay: '主街烧烤区', description: '', contact: '', anonymous: false })
  const [photos, setPhotos] = useState<string[]>([])
  const [submitted, setSubmitted] = useState<SafetyEvent | null>(null)
  const [error, setError] = useState('')
  const [photoNotice, setPhotoNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const addPhoto = async () => {
    if (photos.length >= 3) {
      setPhotoNotice('最多添加 3 张照片。')
      return
    }
    try {
      const result = await Taro.chooseImage({
        count: 3 - photos.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const nextPhotos = photos.concat(result.tempFilePaths || []).slice(0, 3)
      setPhotos(nextPhotos)
      setPhotoNotice(`已添加 ${nextPhotos.length} / 3 张照片`)
    } catch (error) {
      setPhotoNotice('未选择照片。')
    }
  }

  const submit = async () => {
    if (!form.description.trim() && photos.length === 0) {
      setError('请写一句现场情况，或至少上传一张照片。')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      setSubmitted(await createReport(form, photos.length))
    } catch (error) {
      setError('提交失败，请确认后端服务已启动。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='page report-page'>
      <PageHeader title='隐患上报' subtitle='街霸滋扰、摊位纠纷、扒窃线索、噪音扰民等现场问题，都可以在这里告诉我们。' />
      {submitted ? (
        <View className='success-card'>
          <Text>已收到你的上报</Text>
          <Text>编号 {submitted.id}</Text>
          <Text>{submitted.bay} · {submitted.title} · 巡防组会尽快查看</Text>
          <Button className='primary block' onClick={openProgress}>查看进度</Button>
          <Button className='ghost block' onClick={() => setSubmitted(null)}>继续上报</Button>
        </View>
      ) : (
        <View>
          <View className='form-card'>
            <Text className='field-label'>想上报什么？</Text>
            <View className='choice-grid'>
              {reportCategories.map((category) => (
                <View key={category} className={`choice-chip ${form.category === category ? 'selected' : ''}`} onClick={() => setForm({ ...form, category })}>
                  <Text>{category}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className='form-card'>
            <Text className='field-label'>在哪个区域？</Text>
            <View className='choice-grid bay-choice'>
              {bayOptions.map((bay) => (
                <View key={bay} className={`choice-chip ${form.bay === bay ? 'selected' : ''}`} onClick={() => setForm({ ...form, bay })}>
                  <Text>{bay}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className='form-card'>
            <Text className='field-label'>补充说明</Text>
            <Textarea value={form.description} placeholder='例如：有人酒后拍桌威胁商户，或发现疑似扒窃人员在三号门徘徊。' onInput={(event) => setForm({ ...form, description: event.detail.value })} />
          </View>
          <Button className='secondary block compact-upload' onClick={addPhoto}>{photoNotice || `添加照片（${photos.length}/3）`}</Button>
          <View className='form-card'>
            <Text className='field-label'>联系方式</Text>
            <Input value={form.contact} placeholder='可选，方便巡防组回访' onInput={(event) => setForm({ ...form, contact: event.detail.value })} />
          </View>
          <View className='switch-row' onClick={() => setForm({ ...form, anonymous: !form.anonymous })}>
            <Text>{form.anonymous ? '已选择匿名上报' : '实名上报，点击切换匿名'}</Text>
            <Text className={`switch ${form.anonymous ? 'on' : ''}`}>{form.anonymous ? '开' : '关'}</Text>
          </View>
          {error && <View className='error-card'><Text>{error}</Text></View>}
          <Button className='primary block sticky-submit' loading={submitting} onClick={submit}>{submitting ? '提交中' : '提交上报'}</Button>
        </View>
      )}
    </View>
  )
}


function HelpView({
  latestHelp,
  createHelp,
  openProgress,
}: {
  latestHelp?: SafetyEvent
  createHelp: () => Promise<void>
  openProgress: () => void
}) {
  const [sending, setSending] = useState(false)

  const launchHelp = async () => {
    if (latestHelp) {
      openProgress()
      return
    }
    setSending(true)
    try {
      await createHelp()
      Taro.showToast({ title: '已发起一键报警', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: '报警失败，请重试', icon: 'none' })
    } finally {
      setSending(false)
    }
  }

  return (
    <View className='page help-page help-hero-page'>
      <View className='help-stage'>
        <View className='help-halo help-halo-one' />
        <View className='help-halo help-halo-two' />
        <Button className={`help-orb ${latestHelp ? 'active' : ''}`} loading={sending} disabled={sending} onClick={launchHelp}>
          <Text className='help-orb-kicker'>{latestHelp ? '求助处理中' : '一键报警'}</Text>
          <Text className='help-orb-title'>SOS</Text>
          <Text className='help-orb-sub'>{latestHelp ? '点击查看处置进度' : '同步定位给巡防组'}</Text>
        </Button>
      </View>
    </View>
  )
}
function ProgressView({
  events,
  filter,
  setFilter,
  goReport,
  goHelp,
}: {
  events: SafetyEvent[]
  filter: ProgressFilter
  setFilter: (filter: ProgressFilter) => void
  goReport: () => void
  goHelp: () => void
}) {
  const visibleEvents = filter === 'all' ? events : events.filter((event) => event.kind === filter)
  return (
    <View className='page progress-page'>
      <PageHeader title='我的进度' subtitle='求助、上报、线索登记都会在这里更新。' />
      <View className='segmented'>
        {[
          ['all', '全部'],
          ['help', '求助'],
          ['report', '上报'],
          ['lost', '线索'],
        ].map(([key, label]) => (
          <View key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key as 'all' | EventKind)}>
            <Text>{label}</Text>
          </View>
        ))}
      </View>
      {visibleEvents.length === 0 && (
        <View className='empty-state'>
          <Text>还没有记录</Text>
          <Text>可以先发起求助，或上报一个现场问题。</Text>
          <View>
            <Button className='primary compact' onClick={goHelp}>去求助</Button>
            <Button className='secondary compact' onClick={goReport}>去上报</Button>
          </View>
        </View>
      )}
      {visibleEvents.map((item) => (
        <View className='progress-card clickable-card' key={item.id} onClick={() => openDetail('serviceOrder', { id: item.id, title: item.title, status: item.status, bay: item.bay, level: item.level })}>
          <View className='progress-head'>
            <View>
              <Text>{item.title}</Text>
              <Text>{item.bay} · {item.source} · {item.owner}</Text>
            </View>
            <Text className={`row-chip ${item.status === '已完成' ? 'safe-chip' : item.level === '高风险' ? 'danger-chip' : 'warn-chip'}`}>{item.status}</Text>
          </View>
          <View className='progress-track'><View style={{ width: `${(statusRank[item.status] / 5) * 100}%` }} /></View>
          <View className='timeline'>
            {statusFlow.map((status) => <Text key={status} className={statusRank[item.status] >= statusRank[status] ? 'active-step' : ''}>{status}</Text>)}
          </View>
          <Button className='ghost detail-toggle' onClick={() => openDetail('serviceOrder', { id: item.id, title: item.title, status: item.status, bay: item.bay, level: item.level })}>查看详情</Button>
        </View>
      ))}
      <View className='progress-actions'>
        <Button className='secondary compact' onClick={goReport}>新增上报</Button>
        <Button className='primary compact' onClick={goHelp}>再次求助</Button>
      </View>
    </View>
  )
}

function StaffLoginView({ back, login }: { back: () => void; login: () => void }) {
  const [staffId, setStaffId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (!staffId.trim() || !password.trim()) {
      setError('请输入工号和密码。')
      return
    }
    setError('')
    login()
  }

  return (
    <View className='page with-top'>
      <PageHeader title='巡防人员登录' subtitle='登录后查看派发工单和处置任务。' />
      <View className='form-card elevated'>
        <View className='field'>
          <Text>工号</Text>
          <Input value={staffId} placeholder='请输入工号，如 YS001' onInput={(event) => setStaffId(event.detail.value)} />
        </View>
        <View className='field'>
          <Text>密码</Text>
          <Input password value={password} placeholder='请输入密码' onInput={(event) => setPassword(event.detail.value)} />
        </View>
        {error && <View className='error-card'><Text>{error}</Text></View>}
        <Button className='primary block' onClick={submit}>登录查看工单</Button>
        <Button className='ghost block' onClick={back}>返回群众端</Button>
      </View>
    </View>
  )
}

function StaffWorkView({
  events,
  updateEventStatus,
  logout,
}: {
  events: SafetyEvent[]
  updateEventStatus: (id: string, status: EventStatus, owner?: string, result?: string) => Promise<SafetyEvent>
  logout: () => void
}) {
  const [expandedId, setExpandedId] = useState(events[0]?.id || '')
  const [resultText, setResultText] = useState('')
  const [staffTab, setStaffTab] = useState<StaffTab>('tasks')
  const [staffLocation, setStaffLocation] = useState<MapProps.point | null>(null)
  const [staffEvents, setStaffEvents] = useState<SafetyEvent[]>([])
  const staffName = '王队'
  const ownedEvents = events.filter((event) => event.owner === staffName || event.meta?.assignment?.staffName === staffName)
  const visibleStaffEvents = staffEvents.length ? staffEvents : (ownedEvents.length ? ownedEvents : events)
  const activeOrders = visibleStaffEvents.filter((event) => event.status !== '已完成')
  const completedOrders = visibleStaffEvents.filter((event) => event.status === '已完成')
  const pendingCount = visibleStaffEvents.filter((event) => event.status === '已提交' || event.status === '已派单').length
  const processingCount = visibleStaffEvents.length - pendingCount - completedOrders.length
  const primaryOrderId = activeOrders[0]?.id || ''

  const replaceStaffEvent = (next: SafetyEvent) => {
    setStaffEvents((current) => {
      const exists = current.some((event) => event.id === next.id)
      return exists ? current.map((event) => event.id === next.id ? next : event) : [next].concat(current)
    })
  }

  useEffect(() => {
    let mounted = true
    const loadStaffTasks = async (silent = false) => {
      try {
        const tasks = await fetchStaffTasks(staffName)
        if (mounted) {
          setStaffEvents(tasks)
          if (!expandedId && tasks[0]) setExpandedId(tasks[0].id)
        }
      } catch {
        if (!silent && mounted) {
          Taro.showToast({ title: '我的任务同步失败，显示本地任务', icon: 'none' })
        }
      }
    }
    loadStaffTasks()
    const timer = setInterval(() => loadStaffTasks(true), 15000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const syncLocation = async () => {
      try {
        const location = await Taro.getLocation({ type: 'gcj02' })
        const point = { latitude: location.latitude, longitude: location.longitude }
        if (mounted) setStaffLocation(point)
        await updateStaffLocation({
          staff: staffName,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        })
        const target = visibleStaffEvents.find((event) => event.id === primaryOrderId)
        if (target) {
          const next = await refreshEventRoute(target.id, {
            staff: staffName,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
          })
          if (mounted) replaceStaffEvent(next)
        }
      } catch {
        if (mounted) {
          Taro.showToast({ title: '未获取实时定位，地图显示默认巡防点', icon: 'none' })
        }
      }
    }
    syncLocation()
    const timer = setInterval(syncLocation, 60000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [primaryOrderId])
  const taskCardTone = (item: SafetyEvent) => {
    if (item.level === '高风险') return 'high-risk'
    if (item.status === '处理中') return 'processing'
    return 'pending'
  }
  const taskTypeLabel = (item: SafetyEvent) => {
    if (item.level === '高风险') return '高风险'
    if (item.source.includes('AI')) return 'AI预警'
    if (item.kind === 'report') return '秩序处置'
    if (item.kind === 'lost') return '线索研判'
    return item.source
  }
  const taskPrimaryLabel = (item: SafetyEvent) => {
    if (item.level === '高风险' && (item.status === '已提交' || item.status === '已派单')) return '去处理'
    if (item.status === '处理中') return '完成处置'
    return nextAction(item).label
  }

  const nextAction = (item: SafetyEvent) => {
    if (item.status === '已提交' || item.status === '已派单') return { label: '接收任务', next: '已接收' as EventStatus }
    if (item.status === '已接收') return { label: '我已到达', next: '已到达' as EventStatus }
    if (item.status === '已到达') return { label: '开始处理', next: '处理中' as EventStatus }
    return { label: '完成处置', next: '已完成' as EventStatus }
  }

  const advanceOrder = async (item: SafetyEvent) => {
    const action = nextAction(item)
    const isComplete = action.next === '已完成'
    try {
      const next = await updateEventStatus(item.id, action.next, staffName, isComplete ? resultText || '现场风险已解除，已同步指挥端复盘。' : undefined)
      replaceStaffEvent(next)
      Taro.showToast({ title: isComplete ? '处置已闭环' : `已更新为${action.next}`, icon: 'none' })
      if (isComplete) {
        setResultText('')
        setExpandedId(activeOrders.find((order) => order.id !== item.id)?.id || '')
      } else {
        setExpandedId(item.id)
      }
    } catch (error) {
      Taro.showToast({ title: '状态更新失败，请检查后端服务', icon: 'none' })
    }
  }

  return (
    <View className='page staff-page'>
      <View className='staff-top'>
        <View>
          <Text>巡防工作台</Text>
          <Text>王队 · 在线 · 主街烧烤区优先响应</Text>
        </View>
        <Button className='ghost mini-btn' onClick={logout}>退出</Button>
      </View>
      <View className='staff-nav'>
        {([
          ['tasks', '任务'],
          ['map', '地图'],
          ['ledger', '台账'],
          ['mine', '我的'],
        ] as Array<[StaffTab, string]>).map(([key, label]) => (
          <View key={key} className={staffTab === key ? 'selected' : ''} onClick={() => setStaffTab(key)}>
            <Text>{label}</Text>
          </View>
        ))}
      </View>
      {staffTab === 'map' && <StaffMapView events={visibleStaffEvents} staffName={staffName} staffLocation={staffLocation} />}
      {staffTab === 'ledger' && <StaffLedgerView events={visibleStaffEvents} />}
      {staffTab === 'mine' && <StaffMineView events={visibleStaffEvents} logout={logout} />}
      {staffTab === 'tasks' && (
        <View className='staff-task-dashboard'>
          <View className='staff-task-metrics'>
            <View className='staff-task-metric pending'><Text>{pendingCount}</Text><Text>待接收</Text></View>
            <View className='staff-task-metric processing'><Text>{processingCount}</Text><Text>处理中</Text></View>
            <View className='staff-task-metric done'><Text>{completedOrders.length}</Text><Text>已完成</Text></View>
          </View>
          <View className='staff-task-section-head'>
            <Text>今日任务</Text>
            <Text onClick={() => Taro.showToast({ title: '已显示全部任务', icon: 'none' })}>全部 ›</Text>
          </View>
          {activeOrders.length === 0 && (
            <View className='empty-state'>
              <Text>暂无待处理工单</Text>
              <Text>当前夜市网格运行平稳，继续保持巡查节奏。</Text>
            </View>
          )}
          <View className='staff-task-list'>
            {activeOrders.map((item) => (
              <View className={`staff-task-card ${taskCardTone(item)}`} key={item.id} onClick={() => setExpandedId(expandedId === item.id ? '' : item.id)}>
                <View className='staff-task-status-bar' />
                <View className='staff-task-card-head'>
                  <View className='staff-task-tags'>
                    <Text className={`staff-task-tag ${item.level === '高风险' ? 'danger' : ''}`}>{taskTypeLabel(item)}</Text>
                    <Text className='staff-task-tag muted'>{item.status}</Text>
                  </View>
                  <Text>{item.updatedAt}</Text>
                </View>
                <Text className='staff-task-title'>{item.title}</Text>
                <View className='staff-task-location'>
                  <Text>⌖</Text>
                  <Text>{item.bay} ({item.distance})</Text>
                </View>
                <View className='staff-route-pill'>
                  <Text>路线</Text>
                  <Text>{routeLabel(item)}</Text>
                </View>
                {expandedId === item.id && (
                  <View className='staff-task-detail'>
                    <Text>{item.description}</Text>
                    <Text>负责人：{item.owner} · 来源：{item.source}</Text>
                    {item.meta?.route && (
                      <View className='staff-route-detail'>
                        <Text>推荐交通：{item.meta.route.modeLabel}</Text>
                        <Text>距离 {item.meta.route.distanceLabel} · 预计 {item.meta.route.etaLabel}</Text>
                      </View>
                    )}
                    <View className='timeline compact-line'>
                      {statusFlow.map((status) => <Text key={status} className={statusRank[item.status] >= statusRank[status] ? 'active-step' : ''}>{status}</Text>)}
                    </View>
                    {item.status === '处理中' && (
                      <Textarea value={resultText} placeholder='填写处置结果，如：已劝离滋事人员，商户恢复经营秩序。' onInput={(event) => setResultText(event.detail.value)} />
                    )}
                  </View>
                )}
                <View className='staff-task-actions'>
                  {item.status === '处理中' && (
                    <Button
                      className='staff-secondary-action'
                      onClick={(event) => {
                        event.stopPropagation()
                        setExpandedId(item.id)
                      }}
                    >
                      更新进度
                    </Button>
                  )}
                  <Button
                    className='staff-primary-action'
                    onClick={(event) => {
                      event.stopPropagation()
                      advanceOrder(item)
                    }}
                  >
                    {taskPrimaryLabel(item)}
                  </Button>
                  <Button
                    className='staff-link-action'
                    onClick={(event) => {
                      event.stopPropagation()
                      openDetail('staffOrder', { id: item.id, title: item.title, status: item.status, bay: item.bay, level: item.level })
                    }}
                  >
                    详情
                  </Button>
                </View>
              </View>
            ))}
          </View>
          <View className='content-card'>
            <CardTitle title='已完成记录' action={`${completedOrders.length}单`} />
            {completedOrders.map((item) => <View className='resource-row' key={item.id}><View><Text>{item.title}</Text><Text>{item.bay} · {item.owner}</Text></View><Text className='row-chip safe-chip'>闭环</Text></View>)}
          </View>
        </View>
      )}
    </View>
  )
}

type StaffTab = 'tasks' | 'map' | 'ledger' | 'mine'

function StaffMapView({
  events,
  staffName,
  staffLocation,
}: {
  events: SafetyEvent[]
  staffName: string
  staffLocation: MapProps.point | null
}) {
  const activeOrders = events.filter((event) => event.status !== '已完成')
  const activeCount = activeOrders.length
  const selfPoint = staffLocation || { latitude: 28.6827, longitude: 115.8593 }
  const staffMapPoints = useMemo(() => {
    const eventPoints: JiangtanMapPoint[] = activeOrders
      .filter((event) => event.status !== '已完成')
      .map((event, index) => {
        const bayPoint = findJiangtanPointByBay(event.bay)
        const alarmPoint = getEventAlarmPoint(event)
        return {
          id: 100 + index,
          bay: event.bay,
          name: event.title,
          address: bayPoint.address,
          latitude: alarmPoint.latitude,
          longitude: alarmPoint.longitude,
          tone: eventMarkerTone(event),
          summary: `${event.bay} · ${event.status} · ${event.owner} · ${routeLabel(event)}`,
        }
      })
    const selfMarker: JiangtanMapPoint = {
      id: 9001,
      bay: '我的位置',
      name: `${staffName}当前位置`,
      address: '工作人员端实时定位',
      latitude: selfPoint.latitude,
      longitude: selfPoint.longitude,
      tone: 'service',
      summary: staffLocation ? '已同步给指挥端' : '使用默认巡防点',
    }

    return [selfMarker, ...jiangtanMapPoints, ...staffPatrolPoints, ...eventPoints]
  }, [activeOrders, selfPoint.latitude, selfPoint.longitude, staffLocation, staffName])
  const staffMapMarkers = useMemo(() => createMapMarkers(staffMapPoints), [staffMapPoints])
  const routeLines = useMemo(() => activeOrders
    .map((event, index) => {
      const points = routeLinePoints(event)
      if (points.length < 2) return null
      return {
        points,
        color: index === 0 ? '#0084FF' : '#10B981',
        width: index === 0 ? 6 : 4,
        dottedLine: false,
        arrowLine: true,
      }
    })
    .filter(Boolean), [activeOrders])
  const staffIncludePoints = useMemo(
    () => staffMapPoints
      .map(({ latitude, longitude }) => ({ latitude, longitude }))
      .concat(activeOrders.flatMap(routeLinePoints)),
    [activeOrders, staffMapPoints],
  )

  return (
    <View className='staff-subpage'>
      <View className='staff-summary-card'>
        <Text>夜市商圈态势</Text>
        <Text>当前有 {activeCount} 个我的任务需要关注，蓝色线路为优先处置路线</Text>
      </View>
      <View className='staff-map'>
        <Map
          className='native-map'
          longitude={jiangtanCenter.longitude}
          latitude={jiangtanCenter.latitude}
          scale={16}
          minScale={14}
          maxScale={19}
          markers={staffMapMarkers}
          polyline={routeLines as MapProps.polyline[]}
          includePoints={staffIncludePoints}
          showLocation
          showCompass
          showScale
          enablePoi
          enableBuilding
          enableTraffic
          onMarkerTap={(event) => {
            const point = staffMapPoints.find((item) => item.id === Number(event.detail.markerId))
            if (point) showMapPoint(point)
          }}
          onError={mapLoadFailed}
        />
      </View>
      <View className='map-legend'>
        <View><View className='legend-dot safe' /><Text>正常</Text></View>
        <View><View className='legend-dot warn' /><Text>关注</Text></View>
        <View><View className='legend-dot danger' /><Text>重点</Text></View>
        <View><View className='legend-dot service' /><Text>巡防/装备</Text></View>
      </View>
      {activeOrders.slice(0, 2).map((event) => (
        <View className='staff-route-card' key={event.id}>
          <View>
            <Text>{event.title}</Text>
            <Text>{event.bay} · 报警点已同步</Text>
          </View>
          <Text>{routeLabel(event)}</Text>
        </View>
      ))}
      <View className='content-card'>
        <CardTitle title='附近巡防力量' action='3 组在线' />
        {['PTU快反点 · 王队 · 90m', '无人机机巢 · 李敏 · 待命', '机器狗巡逻点 · 陈安 · 后巷补盲'].map((item) => (
          <View className='resource-row' key={item}>
            <Text>{item}</Text>
            <Text className='row-chip safe-chip'>在线</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function StaffLedgerView({ events }: { events: SafetyEvent[] }) {
  return (
    <View className='staff-subpage'>
      <View className='staff-summary-card'>
        <Text>处置台账</Text>
        <Text>记录每一条事件的来源、负责人和闭环结果</Text>
      </View>
      <View className='ledger-card'>
        <View className='ledger-row ledger-head'>
          <Text>事件</Text>
          <Text>状态</Text>
          <Text>负责人</Text>
        </View>
        {events.map((item) => (
          <View className='ledger-row' key={item.id}>
            <View>
              <Text>{item.title}</Text>
              <Text>{item.bay} · {item.updatedAt}</Text>
            </View>
            <Text className={`row-chip ${item.status === '已完成' ? 'safe-chip' : item.level === '高风险' ? 'danger-chip' : 'warn-chip'}`}>{item.status}</Text>
            <Text>{item.owner}</Text>
          </View>
        ))}
      </View>
      <View className='content-card'>
        <CardTitle title='闭环提醒' action='今日' />
        <Text className='body-copy'>完成处置后请及时填写结果，系统会同步给群众端和 Web 指挥舱。</Text>
      </View>
    </View>
  )
}

function StaffMineView({ events, logout }: { events: SafetyEvent[]; logout: () => void }) {
  const completedCount = events.filter((event) => event.status === '已完成').length

  return (
    <View className='staff-subpage'>
      <View className='staff-profile'>
        <View className='staff-avatar'>王</View>
        <View>
          <Text>王队</Text>
          <Text>夜市巡防 · 主街烧烤区</Text>
        </View>
        <Text className='online-dot'>在线</Text>
      </View>
      <View className='home-metrics'>
        <MetricCard label='今日任务' value={`${events.length}`} tone='blue' />
        <MetricCard label='已闭环' value={`${completedCount}`} tone='safe' />
        <MetricCard label='响应等级' value='优先' tone='warn' />
      </View>
      <View className='mine-section'>
        <Text>工作设置</Text>
        {['消息提醒', '巡防范围', '隐私与权限'].map((item) => (
          <View className='mine-row' key={item} onClick={() => Taro.showToast({ title: `${item}已打开`, icon: 'none' })}>
            <Text>{item}</Text>
            <Text>›</Text>
          </View>
        ))}
      </View>
      <Button className='ghost block logout' onClick={logout}>退出巡防人员端</Button>
    </View>
  )
}

function MineView({ events, logout }: { events: SafetyEvent[]; logout: () => void }) {
  const myOpen = useMemo(() => events.filter((event) => event.status !== '已完成').length, [events])
  const serviceRows = [{ label: '我的求助', type: 'help' }, { label: '我的上报', type: 'report' }, { label: '线索登记记录', type: 'lost' }]
  const infoRows = [{ label: '隐私说明', type: 'privacy' }, { label: '关于夜市智防', type: 'about' }]

  return (
    <View className='page mine-page figma-mine'>
      <View className='mine-topbar'>
        <Text>我的</Text>
        <Text>夜市智防</Text>
      </View>
      <View className='profile-card figma-profile-card'>
        <View className='avatar'>夜</View>
        <View><Text>微信群众</Text><Text>今日记录 {events.length} 条 · 处理中 {myOpen} 条</Text></View>
      </View>
      <View className='mine-section figma-mine-section'>
        <Text>我的事件</Text>
        {serviceRows.map((item) => (
          <View className='mine-row' key={item.label} onClick={() => openDetail(item.type)}>
            <Text>{item.label}</Text><Text>›</Text>
          </View>
        ))}
      </View>
      <LanguagePicker className='mine-language-picker compact-language' variant='row' />
      <View className='mine-section figma-mine-section'>
        <Text>说明</Text>
        {infoRows.map((item) => (
          <View className='mine-row' key={item.label} onClick={() => openDetail(item.type)}>
            <Text>{item.label}</Text><Text>›</Text>
          </View>
        ))}
      </View>
      <Button className='ghost block logout' onClick={logout}>退出登录</Button>
    </View>
  )
}
