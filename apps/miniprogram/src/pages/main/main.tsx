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
    bay: '1号泳场',
    name: '龙沙湾',
    address: '南昌市东湖区龙华路1号',
    latitude: 28.7088,
    longitude: 115.8948,
    tone: 'safe',
    summary: '东湖区北段，古豫章文化景观带',
  },
  {
    id: 2,
    bay: '2号泳场',
    name: '摩天湾',
    address: '南昌之星摩天轮旁，红谷滩区赣江沿线',
    latitude: 28.6531,
    longitude: 115.8489,
    tone: 'danger',
    summary: '背靠南昌之星，夜游人流较集中',
  },
  {
    id: 3,
    bay: '3号泳场',
    name: '凤凰湾',
    address: '凤凰洲体育公园内，红谷滩区赣江沿线',
    latitude: 28.6664,
    longitude: 115.8366,
    tone: 'safe',
    summary: '亲子友好，临近凤凰洲体育公园',
  },
  {
    id: 4,
    bay: '4号泳场',
    name: '九龙湾',
    address: '九龙湖音乐广场旁，红谷滩区九龙湖片区',
    latitude: 28.6152,
    longitude: 115.7952,
    tone: 'safe',
    summary: '与九龙湖公园隔街相望',
  },
  {
    id: 5,
    bay: '5号泳场',
    name: '万紫滩',
    address: '朝阳江滩公园内，西湖区赣江沿线',
    latitude: 28.6387,
    longitude: 115.8548,
    tone: 'warn',
    summary: '朝阳江滩公园核心区域之一',
  },
  {
    id: 6,
    bay: '6号泳场',
    name: '千红滩',
    address: '朝阳江滩公园内，西湖区赣江沿线',
    latitude: 28.6405,
    longitude: 115.8509,
    tone: 'safe',
    summary: '与万紫滩相邻，坡度平缓',
  },
  {
    id: 7,
    bay: '7号泳场',
    name: '观洲湾',
    address: '朝阳江滩公园内，西湖区赣江沿线',
    latitude: 28.6432,
    longitude: 115.8468,
    tone: 'safe',
    summary: '标准深水区，适合游泳爱好者',
  },
  {
    id: 8,
    bay: '8号泳场',
    name: '七星湾',
    address: '东新街道赣江昌南外滩公园，南昌县',
    latitude: 28.5886,
    longitude: 115.8294,
    tone: 'safe',
    summary: '配套完善，可一站式露营、骑行、戏水',
  },
  {
    id: 9,
    bay: '9号泳场',
    name: '青洲湾',
    address: '蒋巷镇洲头西侧，南昌县',
    latitude: 28.5719,
    longitude: 115.8178,
    tone: 'service',
    summary: '保留原生湿地风貌，适合野趣江景',
  },
]

const staffPatrolPoints: JiangtanMapPoint[] = [
  { id: 31, bay: '巡防点', name: 'A03 服务岗亭', address: '摩天湾附近巡防岗', latitude: 28.6649, longitude: 115.8378, tone: 'service', summary: '王队在线，距摩天湾 360m' },
  { id: 32, bay: '巡防点', name: '亲水平台巡逻点', address: '凤凰湾西侧巡逻点', latitude: 28.6669, longitude: 115.8348, tone: 'service', summary: '李敏在线，距凤凰湾 520m' },
  { id: 33, bay: '巡防点', name: '万紫滩联动岗', address: '朝阳江滩公园联动岗', latitude: 28.6381, longitude: 115.8496, tone: 'service', summary: '赵师傅在线，处置设施工单' },
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
    cancelLatestHelp,
    supplementEvent,
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
            supplementEvent={supplementEvent}
            cancelHelp={async () => {
              if (await cancelLatestHelp()) openProgress('help')
            }}
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
    { key: 'rescue', title: '服务岗亭', desc: 'AED 饮水 卫生间', icon: '岗' },
    { key: 'guide', title: '游玩提醒', desc: '天气 人流 亲水提示', icon: '游' },
    { key: 'parking', title: '停车路线', desc: '停车场与入口导航', icon: '停' },
    { key: 'station', title: '应急驿站', desc: '医药箱 服务台', icon: '站' },
    { key: 'lost', title: '失物招领', desc: '找物品 登记线索', icon: '物' },
    { key: 'report', title: '隐患上报', desc: '野泳 设施 噪音', icon: '报' },
  ]

  return (
    <View className='page home-page figma-home'>
      <View className='home-hero-card'>
        <View>
          <Text>今日江滩</Text>
          <Text>两滩七湾开放中，摩天湾客流稍多</Text>
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
          <Text>今日状态</Text>
          <Text>适宜游玩</Text>
        </View>
        <View className='home-status-card people' onClick={() => openDetail('bay')}>
          <Text>人流</Text>
          <Text>稍多</Text>
        </View>
        <View className='home-status-card water' onClick={() => openDetail('guide')}>
          <Text>水位</Text>
          <Text>稳定</Text>
        </View>
      </View>

      <View className='home-map-card'>
        <Map
          className='native-map'
          longitude={jiangtanCenter.longitude}
          latitude={jiangtanCenter.latitude}
          scale={12}
          minScale={10}
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
          <Text>开放湾区</Text>
          <Text>9处</Text>
        </View>
        <View onClick={() => openDetail('guide')}>
          <Text>巡防状态</Text>
          <Text>在线</Text>
        </View>
        <View onClick={() => openDetail('rescue')}>
          <Text>最近服务</Text>
          <Text>360m</Text>
        </View>
      </View>

      <View className='home-section-title'>
        <Text>便民服务</Text>
        <Text onClick={() => openDetail('rescue')}>附近设施</Text>
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
                createLostClaim().catch(() => Taro.showToast({ title: '失物登记提交失败', icon: 'none' }))
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
          <Text>群众随手拍 · 隐患上报</Text>
          <Text>发现违规野泳、设施损坏、噪音扰民等问题，可提交点位和照片，后续在进度页查看处置结果。</Text>
        </View>
        <Text>去上报</Text>
      </View>

      <View className='home-activity-banner' onClick={() => latest ? openDetail('serviceOrder', { id: latest.id, title: latest.title, status: latest.status, bay: latest.bay, level: latest.level }) : openDetail('guide')}>
        <Text>!</Text>
        <Text>{latest ? `${latest.title} · ${latest.status}` : '今天服务运行平稳，巡防、救生岗和便民设施在线'}</Text>
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
  const [form, setForm] = useState<ReportForm>({ category: '违规野泳', bay: '摩天湾', description: '', contact: '', anonymous: false })
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
      <PageHeader title='问题反馈' subtitle='设施、秩序、亲水安全等现场问题，都可以在这里告诉我们。' />
      {submitted ? (
        <View className='success-card'>
          <Text>已收到你的反馈</Text>
          <Text>编号 {submitted.id}</Text>
          <Text>{submitted.bay} · {submitted.title} · 工作人员会尽快查看</Text>
          <Button className='primary block' onClick={openProgress}>查看进度</Button>
          <Button className='ghost block' onClick={() => setSubmitted(null)}>继续反馈</Button>
        </View>
      ) : (
        <View>
          <View className='form-card'>
            <Text className='field-label'>想反馈什么？</Text>
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
            <Textarea value={form.description} placeholder='例如：有人翻越围挡靠近水边，或步道、设施存在松动。' onInput={(event) => setForm({ ...form, description: event.detail.value })} />
          </View>
          <Button className='secondary block compact-upload' onClick={addPhoto}>{photoNotice || `添加照片（${photos.length}/3）`}</Button>
          <View className='form-card'>
            <Text className='field-label'>联系方式</Text>
            <Input value={form.contact} placeholder='可选，方便工作人员回访' onInput={(event) => setForm({ ...form, contact: event.detail.value })} />
          </View>
          <View className='switch-row' onClick={() => setForm({ ...form, anonymous: !form.anonymous })}>
            <Text>{form.anonymous ? '已选择匿名反馈' : '实名反馈，点击切换匿名'}</Text>
            <Text className={`switch ${form.anonymous ? 'on' : ''}`}>{form.anonymous ? '开' : '关'}</Text>
          </View>
          {error && <View className='error-card'><Text>{error}</Text></View>}
          <Button className='primary block sticky-submit' loading={submitting} onClick={submit}>{submitting ? '提交中' : '提交反馈'}</Button>
        </View>
      )}
    </View>
  )
}

function HelpView({
  latestHelp,
  createHelp,
  openProgress,
  supplementEvent,
  cancelHelp,
}: {
  latestHelp?: SafetyEvent
  createHelp: () => Promise<void>
  openProgress: () => void
  supplementEvent: (id: string, text: string) => Promise<SafetyEvent>
  cancelHelp: () => Promise<void>
}) {
  const [supplement, setSupplement] = useState('')
  const [saved, setSaved] = useState(false)
  const [supplementError, setSupplementError] = useState('')

  const syncSupplement = async () => {
    if (!latestHelp) return
    if (!supplement.trim()) {
      setSupplementError('请先写一点现场信息。')
      return
    }
    try {
      await supplementEvent(latestHelp.id, supplement.trim())
      setSupplement('')
      setSupplementError('')
      setSaved(true)
    } catch (error) {
      setSupplementError('同步失败，请确认后端服务已启动。')
    }
  }

  return (
    <View className='page help-page'>
      <PageHeader title='紧急求助' subtitle='报警和急救优先，小程序用于把定位和现场信息同步给江滩工作人员。' />
      {!latestHelp ? (
        <View>
          <View className='emergency-guide-card'>
            <Text>先判断情况</Text>
            <Text>人身危险、冲突纠纷拨打 110；溺水、受伤、身体不适拨打 120。报警后可继续同步当前位置给附近岗点。</Text>
          </View>
          <View className='emergency-call-grid'>
            <Button className='emergency-call police' onClick={() => callEmergency('110')}>
              <Text>110</Text>
              <Text>治安 / 人身危险</Text>
            </Button>
            <Button className='emergency-call medical' onClick={() => callEmergency('120')}>
              <Text>120</Text>
              <Text>溺水 / 受伤不适</Text>
            </Button>
          </View>
          <View className='content-card center-card'>
            <Text className='strong-title'>同步给江滩工作人员</Text>
            <Text className='body-copy'>上传定位后，系统会生成高优先级事件，推送给附近巡防和服务岗。它用于现场协同，不能替代报警。</Text>
            <Button className='secondary block staff-sync-button' onClick={createHelp}>同步位置给工作人员</Button>
          </View>
        </View>
      ) : (
        <View>
          <View className='response-card'>
            <Text className='row-chip safe-chip'>{latestHelp.status}</Text>
            <Text className='response-title'>工作人员正在赶来</Text>
            <Text className='response-meta'>求助编号 {latestHelp.id} · 预计 2 分钟内联系你</Text>
            <View className='response-route'>
              <Text>当前位置已同步</Text>
              <Text>{latestHelp.bay}亲水平台外侧 · 请留在原地或明显地标旁</Text>
            </View>
            <View className='response-grid'>
              <MetricCard label='负责人' value={latestHelp.owner} tone='blue' />
              <MetricCard label='位置' value={latestHelp.bay} tone='safe' />
              <MetricCard label='距离' value={latestHelp.distance} tone='warn' />
            </View>
            <Button className='primary block' onClick={openProgress}>查看进度</Button>
            <Button className='ghost block' onClick={cancelHelp}>误触取消</Button>
          </View>
          <View className='form-card'>
            <Text className='field-label'>补充一句现场情况</Text>
            <Textarea
              value={supplement}
              placeholder='例如：老人摔倒，需要轮椅；孩子走散，穿蓝色上衣。'
              onInput={(event) => {
                setSupplement(event.detail.value)
                setSaved(false)
              }}
            />
            {supplementError && <View className='error-card'><Text>{supplementError}</Text></View>}
            <Button className='secondary block' onClick={syncSupplement}>{saved ? '已同步给工作人员' : '同步补充信息'}</Button>
          </View>
        </View>
      )}
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
      <PageHeader title='我的进度' subtitle='求助、反馈、失物登记都会在这里更新。' />
      <View className='segmented'>
        {[
          ['all', '全部'],
          ['help', '求助'],
          ['report', '反馈'],
          ['lost', '失物'],
        ].map(([key, label]) => (
          <View key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key as 'all' | EventKind)}>
            <Text>{label}</Text>
          </View>
        ))}
      </View>
      {visibleEvents.length === 0 && (
        <View className='empty-state'>
          <Text>还没有记录</Text>
          <Text>可以先发起求助，或反馈一个现场问题。</Text>
          <View>
            <Button className='primary compact' onClick={goHelp}>去求助</Button>
            <Button className='secondary compact' onClick={goReport}>去反馈</Button>
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
        <Button className='secondary compact' onClick={goReport}>新增反馈</Button>
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
      <PageHeader title='工作人员登录' subtitle='登录后查看派发工单和处置任务。' />
      <View className='form-card elevated'>
        <View className='field'>
          <Text>工号</Text>
          <Input value={staffId} placeholder='请输入工号，如 JT001' onInput={(event) => setStaffId(event.detail.value)} />
        </View>
        <View className='field'>
          <Text>密码</Text>
          <Input password value={password} placeholder='请输入密码' onInput={(event) => setPassword(event.detail.value)} />
        </View>
        {error && <View className='error-card'><Text>{error}</Text></View>}
        <Button className='primary block' onClick={submit}>登录查看工单</Button>
        <Button className='ghost block' onClick={back}>返回游客端</Button>
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
  const activeOrders = events.filter((event) => event.status !== '已完成')
  const completedOrders = events.filter((event) => event.status === '已完成')
  const pendingCount = events.filter((event) => event.status === '已提交' || event.status === '已派单').length
  const processingCount = events.length - pendingCount - completedOrders.length
  const taskCardTone = (item: SafetyEvent) => {
    if (item.level === '高风险') return 'high-risk'
    if (item.status === '处理中') return 'processing'
    return 'pending'
  }
  const taskTypeLabel = (item: SafetyEvent) => {
    if (item.level === '高风险') return '高风险'
    if (item.source.includes('巡')) return '常规巡检'
    if (item.kind === 'report') return '设备维护'
    return item.source
  }
  const taskPrimaryLabel = (item: SafetyEvent) => {
    if (item.level === '高风险' && (item.status === '已提交' || item.status === '已派单')) return '去处理'
    if (item.status === '处理中') return '完成巡检'
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
      await updateEventStatus(item.id, action.next, '王队', isComplete ? resultText || '现场风险已解除。' : undefined)
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
          <Text>王队 · 在线 · 摩天湾优先响应</Text>
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
      {staffTab === 'map' && <StaffMapView events={events} />}
      {staffTab === 'ledger' && <StaffLedgerView events={events} />}
      {staffTab === 'mine' && <StaffMineView events={events} logout={logout} />}
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
              <Text>当前湾区运行平稳，继续保持巡查节奏。</Text>
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
                {expandedId === item.id && (
                  <View className='staff-task-detail'>
                    <Text>{item.description}</Text>
                    <Text>负责人：{item.owner} · 来源：{item.source}</Text>
                    <View className='timeline compact-line'>
                      {statusFlow.map((status) => <Text key={status} className={statusRank[item.status] >= statusRank[status] ? 'active-step' : ''}>{status}</Text>)}
                    </View>
                    {item.status === '处理中' && (
                      <Textarea value={resultText} placeholder='填写处置结果，如：已劝离、设施已临时固定。' onInput={(event) => setResultText(event.detail.value)} />
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

function StaffMapView({ events }: { events: SafetyEvent[] }) {
  const activeCount = events.filter((event) => event.status !== '已完成').length
  const staffMapPoints = useMemo(() => {
    const eventPoints: JiangtanMapPoint[] = events
      .filter((event) => event.status !== '已完成')
      .map((event, index) => {
        const bayPoint = findJiangtanPointByBay(event.bay)
        return {
          id: 100 + index,
          bay: event.bay,
          name: event.title,
          address: bayPoint.address,
          latitude: bayPoint.latitude + index * 0.0012,
          longitude: bayPoint.longitude + index * 0.001,
          tone: eventMarkerTone(event),
          summary: `${event.bay} · ${event.status} · ${event.owner}`,
        }
      })

    return [...jiangtanMapPoints, ...staffPatrolPoints, ...eventPoints]
  }, [events])
  const staffMapMarkers = useMemo(() => createMapMarkers(staffMapPoints), [staffMapPoints])
  const staffIncludePoints = useMemo(
    () => staffMapPoints.map(({ latitude, longitude }) => ({ latitude, longitude })),
    [staffMapPoints],
  )

  return (
    <View className='staff-subpage'>
      <View className='staff-summary-card'>
        <Text>两滩七湾态势</Text>
        <Text>当前有 {activeCount} 个任务需要巡防力量关注</Text>
      </View>
      <View className='staff-map'>
        <Map
          className='native-map'
          longitude={jiangtanCenter.longitude}
          latitude={jiangtanCenter.latitude}
          scale={12}
          minScale={10}
          maxScale={19}
          markers={staffMapMarkers}
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
        <View><View className='legend-dot service' /><Text>巡防/服务</Text></View>
      </View>
      <View className='content-card'>
        <CardTitle title='附近巡防力量' action='3 组在线' />
        {['A03 服务岗亭 · 王队 · 360m', '亲水平台 · 李敏 · 520m', '万紫滩 · 赵师傅 · 1.1km'].map((item) => (
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
        <Text className='body-copy'>完成处置后请及时填写结果，系统会同步给游客端和 Web 指挥舱。</Text>
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
          <Text>江滩巡防 · 摩天湾</Text>
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
      <Button className='ghost block logout' onClick={logout}>退出工作人员端</Button>
    </View>
  )
}

function MineView({ events, logout }: { events: SafetyEvent[]; logout: () => void }) {
  const myOpen = useMemo(() => events.filter((event) => event.status !== '已完成').length, [events])
  const serviceRows = [{ label: '我的求助', type: 'help' }, { label: '我的反馈', type: 'report' }, { label: '失物认领记录', type: 'lost' }]
  const infoRows = [{ label: '隐私说明', type: 'privacy' }, { label: '关于江滩服务', type: 'about' }]

  return (
    <View className='page mine-page figma-mine'>
      <View className='mine-topbar'>
        <Text>我的</Text>
        <Text>江滩服务</Text>
      </View>
      <View className='profile-card figma-profile-card'>
        <View className='avatar'>江</View>
        <View><Text>微信游客</Text><Text>今日记录 {events.length} 条 · 处理中 {myOpen} 条</Text></View>
      </View>
      <View className='mine-section figma-mine-section'>
        <Text>我的服务</Text>
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
