import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Image, Input, Map, Text, Textarea, View } from '@tarojs/components'
import type { MapProps } from '@tarojs/components/types/Map'
import Taro, { useRouter } from '@tarojs/taro'
import { CardTitle, MetricCard, PageHeader } from '@/components/common'
import { LanguagePicker } from '@/components/LanguagePicker'
import { Tabbar } from '@/components/Tabbar'
import { bayOptions, reportCategories, statusFlow, statusRank } from '@/data/safety'
import { useSafetyEvents, type ProgressFilter } from '@/hooks/useSafetyEvents'
import type { AppMode, EventKind, EventStatus, HelpForm, ReportForm, SafetyEvent, SecurityOpsOverview, TabKey } from '@/types/events'
import { openDetail } from '@/utils/navigation'
import {
  compareIdentityArchive,
  connectRealtimeEvents,
  createAnalysisReport,
  createContainmentPlan,
  fetchSecurityFeeds,
  fetchSecurityNotifications,
  fetchSecurityOpsOverview,
  fetchStaffTasks,
  generateSecurityDutyPlans,
  refreshEventRoute,
  submitVoiceIntake,
  updateStaffLocation,
} from '@/utils/api'
import { useLocale } from '@/i18n'
import markerDanger from '@/assets/map-marker-danger.png'
import markerSafe from '@/assets/map-marker-safe.png'
import markerService from '@/assets/map-marker-service.png'
import markerWarn from '@/assets/map-marker-warn.png'
import yanhuoShaobingLogo from '@/assets/yanhuo-shaobing-logo.png'
import yanhuoShaobingMark from '@/assets/yanhuo-shaobing-mark.png'
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

type NightMarketMapPoint = {
  id: number
  bay: string
  name: string
  address: string
  latitude: number
  longitude: number
  tone: MarkerTone
  summary: string
}

const nightMarketCenter: MapProps.point = { latitude: 28.682, longitude: 115.8585 }

const mapMarkerIcons: Record<MarkerTone, string> = {
  safe: markerSafe,
  warn: markerWarn,
  danger: markerDanger,
  service: markerService,
}

const nightMarketMapPoints: NightMarketMapPoint[] = [
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
    summary: '后巷通道与临时摊点关注区',
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
    summary: '家庭餐饮和亲子休息片区',
  },
  {
    id: 7,
    bay: '网格G',
    name: '商户服务站',
    address: '夜市综合服务与平安码咨询点',
    latitude: 28.6815,
    longitude: 115.8551,
    tone: 'service',
    summary: '商户联络、急救物资和便民服务点',
  },
]

const nightMarketIncludePoints: MapProps.point[] = nightMarketMapPoints.map(({ latitude, longitude }) => ({ latitude, longitude }))

function createMapMarkers(points: NightMarketMapPoint[]): MapProps.marker[] {
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

function showMapPoint(point: NightMarketMapPoint) {
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
  Taro.showToast({ title: '地图没加载出来，请看定位权限或网络', icon: 'none' })
}

function findNightMarketPointByBay(bay: string) {
  return nightMarketMapPoints.find((point) => point.name === bay || point.bay === bay) ?? nightMarketMapPoints[1]
}

function getEventAlarmPoint(event: SafetyEvent): MapProps.point {
  const metaPoint = event.meta?.alarmLocation || event.meta?.reporterLocation
  if (metaPoint?.latitude && metaPoint?.longitude) {
    return { latitude: metaPoint.latitude, longitude: metaPoint.longitude }
  }
  if (event.meta?.latitude && event.meta?.longitude) {
    return { latitude: event.meta.latitude, longitude: event.meta.longitude }
  }
  const bayPoint = findNightMarketPointByBay(event.bay)
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
  const routerParams = router.params ?? {}
  const { t } = useLocale()
  const routeMode: MainMode = routerParams.mode === 'staffLogin' ? 'staffLogin' : routerParams.mode === 'staff' ? 'staff' : 'visitor'
  const [mode, setMode] = useState<MainMode>(routeMode)
  const [tab, setTab] = useState<TabKey>(normalizeTab(routerParams.tab))
  const [staffName, setStaffName] = useState('')
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
    setTab(normalizeTab(routerParams.tab))
  }, [routerParams.tab])

  useEffect(() => {
    const title = mode === 'staff' ? '巡防工作台' : mode === 'staffLogin' ? '管理员登录' : t(visitorTitleKeys[tab])
    if (typeof Taro.setNavigationBarTitle === 'function') {
      Taro.setNavigationBarTitle({ title })
    }
  }, [mode, tab])

  useEffect(() => {
    if (mode !== 'visitor') return undefined
    return connectRealtimeEvents((message) => {
      if (message.type?.startsWith('alarm.') || message.type?.startsWith('event.')) {
        reloadEvents(true)
      }
    })
  }, [mode])

  const sendHelp = async (form?: { bay?: string; description?: string; contact?: string; evidence?: Array<{ kind: 'image' | 'video'; filePath: string }> }) => {
    try {
      await createHelp(form)
      setTab('help')
    } catch (error) {
      Taro.showToast({ title: '求助没发出去，请稍后再试', icon: 'none' })
      throw error
    }
  }

  const openProgress = (filter: ProgressFilter) => {
    setProgressFilter(filter)
    setTab('progress')
  }

  if (mode === 'staffLogin') {
    return <StaffLoginView back={() => Taro.reLaunch({ url: '/pages/index/index' })} login={(name) => {
      setStaffName(name)
      setMode('staff')
    }} />
  }

  if (mode === 'staff' && !staffName) {
    return <StaffLoginView back={() => Taro.reLaunch({ url: '/pages/index/index' })} login={(name) => {
      setStaffName(name)
      setMode('staff')
    }} />
  }

  if (mode === 'staff') {
    return <StaffWorkView staffName={staffName} events={events} updateEventStatus={updateEventStatus} logout={() => Taro.reLaunch({ url: '/pages/index/index' })} />
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
            createLostClaim={async (itemName: string, bay: string) => {
              await createLostClaim(itemName, bay)
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
  createLostClaim: (itemName: string, bay: string) => Promise<void>
}) {
  const activeEvents = events.filter((event) => event.status !== '已完成')
  const latest = activeEvents[0]
  const urgentCount = activeEvents.filter((event) => event.level === '高风险').length
  const latestBay = latest?.bay ?? '今晚还没有待处置事件'
  const latestStatus = latest ? latest.status : '等待刷新'
  const homeMapMarkers = useMemo(() => createMapMarkers(nightMarketMapPoints), [])
  const serviceItems = [
    { key: 'rescue', title: '附近点位', desc: 'PTU、AED、卫生间', icon: '＋' },
    { key: 'guide', title: '夜市提醒', desc: '客流、重点、巡防', icon: '◇' },
    { key: 'parking', title: '停车疏导', desc: '停车场与出口导航', icon: 'P' },
    { key: 'station', title: '商户服务站', desc: '平安码 联系人', icon: 'i' },
    { key: 'lost', title: '失物线索', desc: '物品、人员、经过', icon: '⌁' },
    { key: 'report', title: '隐患上报', desc: '滋扰、斗殴、噪音', icon: '!' },
  ]

  return (
    <View className='page home-page figma-home'>
      <View className='home-hero-card'>
        <View>
          <View className='home-brand'>
            <Image className='home-brand-logo' src={yanhuoShaobingMark} mode='aspectFit' />
            <Text className='home-brand-name'>烟火哨兵</Text>
          </View>
          <Text className='home-hero-status'>{latest ? `${latest.bay} · ${latest.status}` : '今晚暂无待处置事件'}</Text>
          <View className='home-hero-actions'>
            <Text onClick={() => setTab('help')}>一键求助</Text>
            <Text onClick={() => setTab('report')}>隐患上报</Text>
          </View>
        </View>
        <View className='home-hero-weather'>
          <Text>{activeEvents.length}</Text>
          <Text>待处置</Text>
        </View>
      </View>

      {serviceError && (
        <View className='error-card service-error-card' onClick={reloadEvents}>
          <Text>事件没刷新出来</Text>
          <Text>点这里再试一次。</Text>
        </View>
      )}
      {loading && <View className='home-activity-banner sync-banner'><Text>!</Text><Text>正在刷新事件</Text></View>}

      <View className='home-status-grid'>
        <View className='home-status-card weather'>
          <Text>今日情况</Text>
          <Text>{urgentCount ? `${urgentCount}个高风险` : '未收到高风险'}</Text>
        </View>
        <View className='home-status-card people' onClick={() => openDetail('bay')}>
          <Text>最新点位</Text>
          <Text>{latestBay}</Text>
        </View>
        <View className='home-status-card water' onClick={() => openDetail('guide')}>
          <Text>最新状态</Text>
          <Text>{latestStatus}</Text>
        </View>
      </View>

      <View className='home-map-card'>
        <View className='home-map-header'>
          <Text>夜市地图</Text>
          <Text>点一下看位置</Text>
        </View>
        <View className='home-map-visual'>
          <View className='map-road main-road' />
          <View className='map-road side-road one' />
          <View className='map-road side-road two' />
          <View className='map-point danger'>主街</View>
          <View className='map-point warn'>三号门</View>
          <View className='map-point safe'>亲子区</View>
          <View className='map-point service'>服务站</View>
        </View>
        <Map
          className='native-map'
          longitude={nightMarketCenter.longitude}
          latitude={nightMarketCenter.latitude}
          scale={16}
          minScale={14}
          maxScale={18}
          markers={homeMapMarkers}
          includePoints={nightMarketIncludePoints}
          showLocation
          showScale
          enablePoi
          enableBuilding
          onTap={() => openDetail('bay')}
          onMarkerTap={(event) => {
            const point = nightMarketMapPoints.find((item) => item.id === Number(event.detail.markerId))
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
          <Text>夜市网格</Text>
          <Text>7处</Text>
        </View>
        <View onClick={() => openDetail('guide')}>
          <Text>事件记录</Text>
          <Text>{events.length}条</Text>
        </View>
        <View onClick={() => openDetail('rescue')}>
          <Text>报警推送</Text>
          <Text>{events.filter((event) => event.kind === 'help').length}条</Text>
        </View>
      </View>

      <View className='home-section-title'>
        <Text>夜市服务</Text>
        <Text onClick={() => openDetail('rescue')}>附近点位</Text>
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
                type LostModalResult = Taro.showModal.SuccessCallbackResult & { content?: string }
                const options = {
                  title: '登记线索',
                  editable: true,
                  placeholderText: '填物品名称或线索，比如黑色钱包',
                  success(result: LostModalResult) {
                    const itemName = result.content?.trim()
                    if (!result.confirm || !itemName) return
                    createLostClaim(itemName, latest?.bay ?? '主街烧烤区').catch(() => Taro.showToast({ title: '线索登记没提交成功', icon: 'none' }))
                  },
                } as Taro.showModal.Option
                Taro.showModal(options)
                return
              }
              openDetail(item.key === 'parking' || item.key === 'station' ? 'rescue' : item.key)
            }}
          >
            <View className={`figma-service-icon ${item.key}`}><Text>{item.icon}</Text></View>
            <Text>{item.title}</Text>
            <Text>{item.desc}</Text>
          </View>
        ))}
      </View>

      <View className='home-report-entry' onClick={() => setTab('report')}>
        <View>
          <Text>现场问题上报</Text>
          <Text>遇到滋扰、争执、扒窃线索、噪音扰民等情况，可以写清位置并附照片，后续在进度页看处理结果。</Text>
        </View>
        <Text>去上报</Text>
      </View>

      <View className='home-activity-banner' onClick={() => latest ? openDetail('serviceOrder', { id: latest.id, title: latest.title, status: latest.status, bay: latest.bay, level: latest.level }) : openDetail('guide')}>
        <Text>!</Text>
        <Text>{latest ? `${latest.title} · ${latest.status}` : '今晚暂无待处置记录'}</Text>
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
      setPhotoNotice('最多添加 3 张照片')
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
      setPhotoNotice('这次没有选照片')
    }
  }

  const submit = async () => {
    if (!form.description.trim() && photos.length === 0) {
      setError('请写一句现场情况，或传一张照片。')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      setSubmitted(await createReport(form, photos.length))
    } catch (error) {
      setError('上报没提交成功，请稍后再试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='page report-page'>
      <PageHeader title='隐患上报' subtitle='摊位纠纷、扒窃线索、噪音扰民，都可以在这里说清楚。' />
      {submitted ? (
        <View className='success-card'>
          <Text>我们收到了</Text>
          <Text>编号 {submitted.id}</Text>
          <Text>{submitted.bay} · {submitted.title} · 巡防组会查看</Text>
          <Button className='primary block' onClick={openProgress}>查看进度</Button>
          <Button className='ghost block' onClick={() => setSubmitted(null)}>继续上报</Button>
        </View>
      ) : (
        <View>
          <View className='form-card'>
            <Text className='field-label'>是什么情况？</Text>
            <View className='choice-grid'>
              {reportCategories.map((category) => (
                <View key={category} className={`choice-chip ${form.category === category ? 'selected' : ''}`} onClick={() => setForm({ ...form, category })}>
                  <Text>{category}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className='form-card'>
            <Text className='field-label'>在哪一片？</Text>
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
            <Textarea value={form.description} placeholder='比如：有人酒后拍桌吵闹，或有人在三号门附近反复贴身。' onInput={(event) => setForm({ ...form, description: event.detail.value })} />
          </View>
          <Button className='secondary block compact-upload' onClick={addPhoto}>{photoNotice || `添加照片（${photos.length}/3）`}</Button>
          <View className='form-card'>
            <Text className='field-label'>联系方式</Text>
            <Input value={form.contact} placeholder='可不填，方便回访时再留' onInput={(event) => setForm({ ...form, contact: event.detail.value })} />
          </View>
          <View className='switch-row' onClick={() => setForm({ ...form, anonymous: !form.anonymous })}>
            <Text>{form.anonymous ? '匿名上报' : '不匿名，点这里可切换'}</Text>
            <Text className={`switch ${form.anonymous ? 'on' : ''}`}>{form.anonymous ? '开' : '关'}</Text>
          </View>
          {error && <View className='error-card'><Text>{error}</Text></View>}
          <Button className='primary block sticky-submit' loading={submitting} onClick={submit}>{submitting ? '正在提交' : '提交上报'}</Button>
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
  createHelp: (form?: { bay?: string; description?: string; contact?: string; evidence?: Array<{ kind: 'image' | 'video'; filePath: string }> }) => Promise<void>
  openProgress: () => void
}) {
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState<HelpForm>({ bay: '主街烧烤区', description: '', contact: '', evidence: [] })
  const [mediaNotice, setMediaNotice] = useState('')

  const addImage = async () => {
    if (form.evidence.length >= 3) {
      setMediaNotice('最多 3 条证据')
      return
    }
    try {
      const result = await Taro.chooseImage({
        count: 3 - form.evidence.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const next = (result.tempFilePaths || []).map((filePath) => ({ kind: 'image' as const, filePath }))
      setForm({ ...form, evidence: form.evidence.concat(next).slice(0, 3) })
      setMediaNotice(`已添加 ${Math.min(3, form.evidence.length + next.length)} 条证据`)
    } catch {
      setMediaNotice('这次没有选到照片')
    }
  }

  const addVideo = async () => {
    if (form.evidence.length >= 3) {
      setMediaNotice('最多 3 条证据')
      return
    }
    try {
      const result = await Taro.chooseVideo({ compressed: true, sourceType: ['album', 'camera'] })
      if (result.tempFilePath) {
        setForm({ ...form, evidence: form.evidence.concat({ kind: 'video', filePath: result.tempFilePath }).slice(0, 3) })
        setMediaNotice('已添加 1 条视频证据')
      }
    } catch {
      setMediaNotice('这次没有选到视频')
    }
  }

  const launchHelp = async () => {
    if (latestHelp) {
      openProgress()
      return
    }
    setSending(true)
    try {
      await createHelp({
        bay: form.bay,
        description: form.description,
        contact: form.contact,
        evidence: form.evidence,
      })
      Taro.showToast({ title: '求助已发出', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: '求助没发出去，请重试', icon: 'none' })
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
          <Text className='help-orb-sub'>{latestHelp ? '查看编号和处理进度' : '把当前位置发给指挥中心'}</Text>
        </Button>
        <View className='help-status-card'>
          <Text>{latestHelp ? '指挥中心已收到求助' : '发出后会按位置派给附近巡防组'}</Text>
          {latestHelp && (
            <>
              <Text>{latestHelp.id} · {latestHelp.meta?.alarmLocation?.name ?? latestHelp.bay}</Text>
              <Text>{latestHelp.meta?.route?.modeLabel ?? '待生成'} · {latestHelp.meta?.route?.distanceLabel ?? '待生成'} · {latestHelp.meta?.route?.etaLabel ?? '待生成'}</Text>
            </>
          )}
        </View>
        {!latestHelp && (
          <View className='form-card'>
            <Text className='field-label'>夜市位置</Text>
            <View className='choice-grid bay-choice'>
              {bayOptions.map((bay) => (
                <View key={bay} className={`choice-chip ${form.bay === bay ? 'selected' : ''}`} onClick={() => setForm({ ...form, bay })}>
                  <Text>{bay}</Text>
                </View>
              ))}
            </View>
            <Text className='field-label'>现场说明</Text>
            <Textarea value={form.description} placeholder='简单写清楚发生了什么。' onInput={(event) => setForm({ ...form, description: event.detail.value })} />
            <Text className='field-label'>联系方式</Text>
            <Input value={form.contact} placeholder='方便回访时再留' onInput={(event) => setForm({ ...form, contact: event.detail.value })} />
            <View className='help-media-actions'>
              <Button className='secondary compact-upload' onClick={addImage}>{mediaNotice || `加照片（${form.evidence.length}/3）`}</Button>
              <Button className='secondary compact-upload' onClick={addVideo}>加视频</Button>
            </View>
            <View className='help-evidence-list'>
              {form.evidence.map((item, index) => (
                <View key={`${item.kind}-${index}`} className='help-evidence-item'>
                  <Text>{item.kind === 'video' ? '视频' : '照片'} {index + 1}</Text>
                  <Text>{item.filePath.split(/[\\/]/).pop()}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
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
      <PageHeader title='我的进度' subtitle='求助、上报和线索登记，处理到哪一步都在这里看。' />
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
          <Text>遇到现场问题，可以先求助或上报。</Text>
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

function StaffLoginView({ back, login }: { back: () => void; login: (staff: string) => void }) {
  const [staffId, setStaffId] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const submit = () => {
    if (!accepted) {
      setError('请先勾选协议。')
      return
    }
    if (!staffId.trim() || !password.trim()) {
      setError('请填写账号和密码。')
      return
    }
    setError('')
    login(staffId.trim())
  }

  return (
    <View className='auth-page'>
      <View className='auth-hero'>
        <View className='auth-hero-copy auth-brand'>
          <View className='brand-header'>
            <View className='brand-mark'>
              <Image className='brand-logo-image' src={yanhuoShaobingLogo} mode='aspectFit' />
            </View>
            <Text className='login-title'>烟火哨兵</Text>
            <Text className='login-subtitle'>面向夜间商圈的安全治理与联动处置平台</Text>
          </View>
        </View>
        <View className='auth-hero-pill'>
          <Text className='auth-hero-pill-left'>···</Text>
          <Text className='auth-hero-pill-right' />
        </View>
        <View className='auth-hero-art'>
          <View className='auth-art-orbit' />
          <View className='auth-art-device'>
            <View className='auth-art-screen' />
            <View className='auth-art-base' />
          </View>
        </View>
      </View>

      <View className='auth-surface'>
        <View className='auth-tabs'>
          <View className='auth-tab' onClick={back}>
            <Text className='auth-tab-title'>用户登录</Text>
            <View className='auth-tab-indicator' />
          </View>
          <View className='auth-tab active'>
            <Text className='auth-tab-title'>管理员登录</Text>
            <View className='auth-tab-indicator' />
          </View>
        </View>

        <View className='auth-card'>
          <View className='auth-input-list'>
            <View className='auth-input-shell'>
              <Text className='auth-input-icon'>◫</Text>
              <Input
                className='auth-input'
                value={staffId}
                placeholder='请输入账号'
                onInput={(event) => setStaffId(event.detail.value)}
              />
            </View>
            <View className='auth-input-shell'>
              <Text className='auth-input-icon'>◻</Text>
              <Input
                className='auth-input'
                password={!showPassword}
                value={password}
                placeholder='请输入密码'
                onInput={(event) => setPassword(event.detail.value)}
              />
              <Text className='auth-input-action' onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? '○' : '◉'}
              </Text>
            </View>
          </View>

          <View className='auth-links'>
            <Text onClick={() => Taro.showToast({ title: '注册功能待接入', icon: 'none' })}>没有账号？立即注册</Text>
            <Text onClick={() => Taro.showToast({ title: '找回密码待接入', icon: 'none' })}>忘记密码</Text>
          </View>

          <View className='auth-check-row' onClick={() => setAccepted(!accepted)}>
            <View className={`auth-checkbox ${accepted ? 'checked' : ''}`}>
              {accepted && <Text>✓</Text>}
            </View>
            <Text>《烟火哨兵用户服务协议》及《隐私政策》</Text>
          </View>

          <Button className='auth-primary-btn' onClick={submit}>登录</Button>

          {error && <Text className='auth-error'>{error}</Text>}
        </View>
      </View>
    </View>
  )
}

function StaffWorkView({
  staffName,
  events,
  updateEventStatus,
  logout,
}: {
  staffName: string
  events: SafetyEvent[]
  updateEventStatus: (id: string, status: EventStatus, owner?: string, result?: string) => Promise<SafetyEvent>
  logout: () => void
}) {
  const [expandedId, setExpandedId] = useState(events[0]?.id || '')
  const [resultText, setResultText] = useState('')
  const [staffTab, setStaffTab] = useState<StaffTab>('tasks')
  const [staffLocation, setStaffLocation] = useState<MapProps.point | null>(null)
  const [staffEvents, setStaffEvents] = useState<SafetyEvent[]>([])
  const ownedEvents = events.filter((event) => event.owner === staffName || (event.status !== '已提交' && event.meta?.assignment?.staffName === staffName))
  const visibleStaffEvents = staffEvents.length ? staffEvents : ownedEvents
  const activeOrders = visibleStaffEvents.filter((event) => event.status !== '已完成')
  const completedOrders = visibleStaffEvents.filter((event) => event.status === '已完成')
  const pendingCount = visibleStaffEvents.filter((event) => event.status === '已提交' || event.status === '已派单').length
  const processingCount = visibleStaffEvents.length - pendingCount - completedOrders.length
  const primaryOrderId = activeOrders[0]?.id || ''

  const replaceStaffEvent = useCallback((next: SafetyEvent) => {
    setStaffEvents((current) => {
      const exists = current.some((event) => event.id === next.id)
      return exists ? current.map((event) => event.id === next.id ? next : event) : [next].concat(current)
    })
  }, [])

  const loadStaffTasks = useCallback(async (silent = false) => {
    if (!staffName.trim()) {
      setStaffEvents([])
      return
    }
    try {
      const tasks = await fetchStaffTasks(staffName)
      setStaffEvents(tasks)
      if (tasks[0]) {
        setExpandedId((current) => current || tasks[0].id)
      }
    } catch {
      if (!silent) {
        Taro.showToast({ title: '任务没刷新出来，请重试', icon: 'none' })
      }
    }
  }, [staffName])

  useEffect(() => {
    loadStaffTasks()
    const timer = setInterval(() => loadStaffTasks(true), 15000)
    return () => clearInterval(timer)
  }, [loadStaffTasks])

  useEffect(() => connectRealtimeEvents((message) => {
    if (message.type === 'event.assigned' && (!message.staff || message.staff === staffName)) {
      loadStaffTasks(true)
    }
  }), [loadStaffTasks])

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
        if (mounted && staffTab === 'map') {
          Taro.showToast({ title: '没拿到定位，先显示默认巡防点', icon: 'none' })
        }
      }
    }
    syncLocation()
    const timer = setInterval(syncLocation, 60000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [primaryOrderId, staffTab])
  const taskCardTone = (item: SafetyEvent) => {
    if (item.level === '高风险') return 'high-risk'
    if (item.status === '处理中') return 'processing'
    return 'pending'
  }
  const taskTypeLabel = (item: SafetyEvent) => {
    if (item.level === '高风险') return '高风险'
    if (item.source.endsWith('视频提示')) return '视频提示'
    if (item.kind === 'report') return '秩序处置'
    if (item.kind === 'lost') return '线索核验'
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
      const next = await updateEventStatus(item.id, action.next, staffName, isComplete ? resultText || '现场已处理，结果已发给指挥端。' : undefined)
      replaceStaffEvent(next)
      Taro.showToast({ title: isComplete ? '处置已完成' : `已更新为${action.next}`, icon: 'none' })
      if (isComplete) {
        setResultText('')
        setExpandedId(activeOrders.find((order) => order.id !== item.id)?.id || '')
      } else {
        setExpandedId(item.id)
      }
    } catch (error) {
      Taro.showToast({ title: '状态没更新成功，请重试', icon: 'none' })
    }
  }

  return (
    <View className='page staff-page'>
      <View className='staff-top'>
        <View>
          <Text>巡防工作台</Text>
          <Text>{staffName} · 已登录 · 仅显示派给我的任务</Text>
        </View>
        <Button className='ghost mini-btn' onClick={logout}>退出</Button>
      </View>
      <View className='staff-nav'>
        {([
          ['tasks', '任务'],
          ['map', '地图'],
          ['ledger', '台账'],
          ['ops', '勤务'],
          ['mine', '我的'],
        ] as Array<[StaffTab, string]>).map(([key, label]) => (
          <View key={key} className={staffTab === key ? 'selected' : ''} onClick={() => setStaffTab(key)}>
            <Text>{label}</Text>
          </View>
        ))}
      </View>
      {staffTab === 'map' && <StaffMapView events={visibleStaffEvents} staffName={staffName} staffLocation={staffLocation} />}
      {staffTab === 'ledger' && <StaffLedgerView events={visibleStaffEvents} />}
      {staffTab === 'ops' && <StaffOpsView events={visibleStaffEvents} />}
      {staffTab === 'mine' && <StaffMineView staffName={staffName} events={visibleStaffEvents} logout={logout} />}
      {staffTab === 'tasks' && (
        <View className='staff-task-dashboard'>
          <View className='staff-task-metrics'>
            <View className='staff-task-metric pending'><Text>{pendingCount}</Text><Text>待接收</Text></View>
            <View className='staff-task-metric processing'><Text>{processingCount}</Text><Text>处理中</Text></View>
            <View className='staff-task-metric done'><Text>{completedOrders.length}</Text><Text>已完成</Text></View>
          </View>
          <View className='staff-task-section-head'>
            <Text>今日任务</Text>
            <Text onClick={() => Taro.showToast({ title: '已显示全部', icon: 'none' })}>全部 ›</Text>
          </View>
          {activeOrders.length === 0 && (
            <View className='empty-state'>
              <Text>暂无待处理工单</Text>
              <Text>当前没有派给你的新工单，按原路线巡查即可。</Text>
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
                    <Text>报警点：{item.meta?.alarmLocation?.name ?? item.bay} · 联系方式：{String(item.meta?.contact || '后续回访')}</Text>
                    {item.meta?.assignment?.assignedAt && <Text>派单时间：{item.meta.assignment.assignedAt}</Text>}
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
                      <Textarea value={resultText} placeholder='写一下现场怎么处理的，例如：已劝离争执人员，摊位恢复营业。' onInput={(event) => setResultText(event.detail.value)} />
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
            {completedOrders.map((item) => <View className='resource-row' key={item.id}><View><Text>{item.title}</Text><Text>{item.bay} · {item.owner}</Text></View><Text className='row-chip safe-chip'>完成</Text></View>)}
          </View>
        </View>
      )}
    </View>
  )
}

type StaffTab = 'tasks' | 'map' | 'ledger' | 'ops' | 'mine'

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
  const staffMapPoints = useMemo(() => {
    const eventPoints: NightMarketMapPoint[] = activeOrders
      .filter((event) => event.status !== '已完成')
      .map((event, index) => {
        const bayPoint = findNightMarketPointByBay(event.bay)
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
    const selfMarkers: NightMarketMapPoint[] = staffLocation
      ? [{
          id: 9001,
          bay: '我的位置',
          name: `${staffName}当前位置`,
          address: '工作人员定位',
          latitude: staffLocation.latitude,
          longitude: staffLocation.longitude,
          tone: 'service',
          summary: '位置已发给指挥端',
        }]
      : []

    return [...selfMarkers, ...nightMarketMapPoints, ...eventPoints]
  }, [activeOrders, staffLocation, staffName])
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
        <Text>夜市任务地图</Text>
        <Text>当前有 {activeCount} 个任务需要关注，蓝色线路先处理</Text>
      </View>
      <View className='staff-map'>
        <Map
          className='native-map'
          longitude={nightMarketCenter.longitude}
          latitude={nightMarketCenter.latitude}
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
            <Text>{event.bay} · 报警点已定位</Text>
          </View>
          <Text>{routeLabel(event)}</Text>
        </View>
      ))}
      <View className='content-card'>
        <CardTitle title='我的路线' action={`${activeOrders.length}单`} />
        {activeOrders.map((item) => (
          <View className='resource-row' key={item.id}>
            <Text>{item.title} · {routeLabel(item)}</Text>
            <Text className='row-chip safe-chip'>{item.status}</Text>
          </View>
        ))}
        {activeOrders.length === 0 && <Text className='body-copy'>现在没有派给你的路线。</Text>}
      </View>
    </View>
  )
}

function StaffLedgerView({ events }: { events: SafetyEvent[] }) {
  return (
    <View className='staff-subpage'>
      <View className='staff-summary-card'>
        <Text>处置台账</Text>
        <Text>记录每条事件的来源、负责人和处理结果</Text>
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
        <CardTitle title='处置提醒' action='今日' />
        <Text className='body-copy'>完成后记得补一句处理结果，群众端和指挥端都会看到。</Text>
      </View>
    </View>
  )
}

function StaffOpsView({ events }: { events: SafetyEvent[] }) {
  const [ops, setOps] = useState<SecurityOpsOverview>({})
  const [transcript, setTranscript] = useState('主街烧烤区有人打架，请尽快处理')
  const [bay, setBay] = useState(events[0]?.bay ?? '主街烧烤区')
  const [query, setQuery] = useState('重点关注')
  const [identityItems, setIdentityItems] = useState<Array<{ personKey: string; name: string; score?: number; tags?: string[] }>>([])
  const [busy, setBusy] = useState('')
  const activeEvent = events.find((event) => event.status !== '已完成') ?? events[0]

  const reload = useCallback(async () => {
    try {
      const [overview, notifications, feeds] = await Promise.all([
        fetchSecurityOpsOverview(),
        fetchSecurityNotifications(),
        fetchSecurityFeeds(),
      ])
      setOps({ ...overview, notifications: { ...(overview.notifications || {}), items: notifications }, feeds: { ...(overview.feeds || {}), items: feeds } })
    } catch {
      Taro.showToast({ title: '勤务数据没刷新出来', icon: 'none' })
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try {
      await action()
      await reload()
    } catch {
      Taro.showToast({ title: '操作没完成，请重试', icon: 'none' })
    } finally {
      setBusy('')
    }
  }

  const makeDutyPlan = () => run('duty', async () => {
    await generateSecurityDutyPlans()
    Taro.showToast({ title: '勤务预案已生成', icon: 'none' })
  })

  const sendVoice = () => run('voice', async () => {
    const result = await submitVoiceIntake({ transcript, bay, autoAssign: true })
    Taro.showToast({ title: `${result.label} · 已入库`, icon: 'none' })
  })

  const compare = () => run('compare', async () => {
    const items = await compareIdentityArchive(query)
    setIdentityItems(items)
    Taro.showToast({ title: items.length ? `匹配到${items.length}条档案` : '没有匹配档案', icon: 'none' })
  })

  const makeContainment = () => run('containment', async () => {
    if (!activeEvent) throw new Error('no_active_event')
    await createContainmentPlan(activeEvent.id)
    Taro.showToast({ title: '合围方案已生成', icon: 'none' })
  })

  const makeReport = () => run('report', async () => {
    await createAnalysisReport('day')
    Taro.showToast({ title: '复盘报告已生成', icon: 'none' })
  })

  const dutyItems = ops.duty?.items ?? []
  const notificationItems = ops.notifications?.items ?? []
  const feedItems = ops.feeds?.items ?? []
  const analysis = ops.analysis

  return (
    <View className='staff-subpage staff-ops-page'>
      <View className='staff-summary-card'>
        <Text>智慧勤务</Text>
        <Text>备勤、接警、研判、协同和复盘统一落库</Text>
      </View>

      <View className='staff-task-metrics'>
        <View className='staff-task-metric pending'><Text>{ops.duty?.total ?? 0}</Text><Text>勤务预案</Text></View>
        <View className='staff-task-metric processing'><Text>{ops.voice?.total ?? 0}</Text><Text>语音接警</Text></View>
        <View className='staff-task-metric done'><Text>{analysis?.total ?? 0}</Text><Text>复盘报告</Text></View>
      </View>

      <View className='content-card'>
        <CardTitle title='现场动作' action={activeEvent ? activeEvent.bay : '暂无事件'} />
        <View className='staff-ops-actions'>
          <Button className='primary compact' loading={busy === 'duty'} onClick={makeDutyPlan}>生成勤务预案</Button>
          <Button className='secondary compact' loading={busy === 'containment'} disabled={!activeEvent} onClick={makeContainment}>生成合围方案</Button>
          <Button className='secondary compact' loading={busy === 'report'} onClick={makeReport}>生成复盘报告</Button>
        </View>
      </View>

      <View className='content-card'>
        <CardTitle title='语音接警' action='自动派单' />
        <Textarea value={transcript} placeholder='输入报警人语音转写内容' onInput={(event) => setTranscript(event.detail.value)} />
        <Input className='staff-ops-input' value={bay} placeholder='所属夜市点位' onInput={(event) => setBay(event.detail.value)} />
        <Button className='primary block' loading={busy === 'voice'} onClick={sendVoice}>提交语音接警</Button>
      </View>

      <View className='content-card'>
        <CardTitle title='身份档案比对' action='研判' />
        <View className='staff-ops-inline'>
          <Input value={query} placeholder='姓名、编号或标签' onInput={(event) => setQuery(event.detail.value)} />
          <Button className='secondary compact' loading={busy === 'compare'} onClick={compare}>比对</Button>
        </View>
        {identityItems.length === 0
          ? <Text className='body-copy'>输入关键词后查询身份档案。</Text>
          : identityItems.map((item) => (
            <View className='resource-row' key={item.personKey}>
              <View><Text>{item.name}</Text><Text>{item.tags?.join(' · ') || item.personKey}</Text></View>
              <Text className='row-chip warn-chip'>{item.score ? `${Math.round(item.score * 100)}%` : '匹配'}</Text>
            </View>
          ))}
      </View>

      <View className='content-card'>
        <CardTitle title='数据与通知' action={`${notificationItems.length}条通知`} />
        {feedItems.slice(0, 5).map((item) => (
          <View className='resource-row' key={item.sourceKey}>
            <View><Text>{item.name}</Text><Text>{item.kind} · {item.lastSyncAt || '尚未同步'}</Text></View>
            <Text className={`row-chip ${item.status === '在线' ? 'safe-chip' : 'warn-chip'}`}>{item.status}</Text>
          </View>
        ))}
        {notificationItems.slice(0, 3).map((item) => (
          <View className='resource-row' key={item.noticeId}>
            <View><Text>{item.title}</Text><Text>{item.channel} · {item.target}</Text></View>
            <Text className='row-chip safe-chip'>{item.status}</Text>
          </View>
        ))}
      </View>

      {dutyItems[0] && <View className='staff-route-card'><Text>{dutyItems[0].summary}</Text><Text>{dutyItems[0].timeSlot}</Text></View>}
    </View>
  )
}

function StaffMineView({ staffName, events, logout }: { staffName: string; events: SafetyEvent[]; logout: () => void }) {
  const completedCount = events.filter((event) => event.status === '已完成').length

  return (
    <View className='staff-subpage'>
      <View className='staff-profile'>
        <View className='staff-avatar'>{staffName.slice(0, 1)}</View>
        <View>
          <Text>{staffName}</Text>
          <Text>夜市巡防 · 已登录</Text>
        </View>
        <Text className='online-dot'>在线</Text>
      </View>
      <View className='home-metrics'>
        <MetricCard label='今日任务' value={`${events.length}`} tone='blue' />
        <MetricCard label='已完成' value={`${completedCount}`} tone='safe' />
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
  const infoRows = [{ label: '隐私说明', type: 'privacy' }, { label: '关于烟火哨兵', type: 'about' }]

  return (
    <View className='page mine-page figma-mine'>
      <View className='mine-topbar'>
        <Text>我的</Text>
        <Text>烟火哨兵</Text>
      </View>
      <View className='profile-card figma-profile-card'>
        <View className='avatar'>夜</View>
        <View><Text>微信用户</Text><Text>今日记录 {events.length} 条 · 处理中 {myOpen} 条</Text></View>
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
