import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Map, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { BottomSheet, EmptyState, EventCard, Icon, PageHeader, Section } from '@/components/ui'
import { Tabbar } from '@/components/Tabbar'
import { useSafetyEvents } from '@/hooks/useSafetyEvents'
import type { TabKey } from '@/types/events'
import { requestApi } from '@/utils/api'
import { openDetail } from '@/utils/navigation'
import markerService from '@/assets/map-marker-service.png'
import { AlarmScreen } from './AlarmScreen'
import { ReportScreen } from './ReportScreen'
import { errorText } from './media'
import './citizen.scss'

type Market = { id: string; name: string; latitude: number; longitude: number; address?: string; district?: string; summary?: string }
type Panel = 'markets' | 'lost' | null
const validTabs: TabKey[] = ['home', 'report', 'help', 'progress', 'mine']

export function CitizenWorkspace({ initialTab, initialPanel, onStaff, onLogout }: {
  initialTab?: string; initialPanel?: string; onStaff: () => void; onLogout: () => void
}) {
  const controller = useSafetyEvents()
  const [tab, setTab] = useState<TabKey>(validTabs.includes(initialTab as TabKey) ? initialTab as TabKey : 'home')
  const [panel, setPanel] = useState<Panel>(initialPanel === 'lost' ? 'lost' : null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [marketId, setMarketId] = useState('')
  const [marketLoading, setMarketLoading] = useState(true)
  const [marketError, setMarketError] = useState('')
  const [mapFailed, setMapFailed] = useState(false)
  const [lostName, setLostName] = useState('')
  const [lostBay, setLostBay] = useState('')
  const [lostBusy, setLostBusy] = useState(false)
  const [lostError, setLostError] = useState('')
  const market = markets.find((item) => item.id === marketId) || markets[0]

  const loadMarkets = useCallback(async () => {
    setMarketLoading(true)
    setMarketError('')
    try {
      const result = await requestApi<{ items: Market[] }>('/events/night-markets')
      setMarkets(Array.isArray(result.items) ? result.items : [])
    } catch (error) { setMarketError(errorText(error, '商圈信息暂时无法读取')) }
    finally { setMarketLoading(false) }
  }, [])
  useEffect(() => { loadMarkets() }, [loadMarkets])
  useEffect(() => {
    const titles = { home: '小安智能预警系统', report: '隐患上报', help: '一键报警', progress: '我的进度', mine: '我的' }
    Taro.setNavigationBarTitle({ title: titles[tab] })
  }, [tab])

  const changeTab = (next: TabKey) => {
    setTab(next)
    setPanel(null)
    Taro.pageScrollTo({ scrollTop: 0, duration: 0 }).catch(() => undefined)
  }
  const goProgress = () => changeTab('progress')
  const submitLost = async () => {
    if (lostBusy) return
    if (!lostName.trim() || !lostBay.trim()) { setLostError('请填写物品或线索名称，以及发生位置。'); return }
    setLostBusy(true)
    setLostError('')
    try {
      await controller.createLostClaim(lostName.trim(), lostBay.trim())
      setLostName('')
      setLostBay('')
      setPanel(null)
      goProgress()
    } catch (error) { setLostError(errorText(error, '线索未提交，请重试')) }
    finally { setLostBusy(false) }
  }
  const navigateMarket = async () => {
    if (!market || !Number.isFinite(market.latitude) || !Number.isFinite(market.longitude)) return
    try {
      await Taro.openLocation({ latitude: market.latitude, longitude: market.longitude, name: market.name, address: market.address || market.district || '', scale: 16 })
    } catch { Taro.showToast({ title: '当前环境无法打开地图导航', icon: 'none' }) }
  }

  return <View className='mini-app citizen-app'>
    {tab === 'home' && <View>
      <PageHeader title='小安智能预警系统' subtitle='夜市有烟火，身边有守护' brand>
        <Button className='citizen-market-switch' onClick={() => setPanel('markets')}><Icon name='mapPin' tone='blue' size={29} /><Text>{market?.name || (marketLoading ? '读取商圈信息' : '选择商圈')}</Text><Icon name='chevronDown' size={25} /></Button>
      </PageHeader>
      <View className='mini-surface'>
        <View className='mini-section-head'><Text className='mini-section-title'>平安夜市</Text><Text className='citizen-service-caption'>现场服务</Text></View>
        <Button className='citizen-help-entry' onClick={() => changeTab('help')}>
          <View className='citizen-help-symbol'><Icon name='siren' tone='danger' size={55} /></View>
          <View className='citizen-help-copy'><Text>一键报警</Text><Text>紧急求助 · 联系平台</Text></View>
          <View className='citizen-help-arrow'><Icon name='arrowUpRight' tone='white' size={31} /></View>
        </Button>
        <View className='citizen-services'>
          {[
            { name: '隐患上报', icon: 'shield', tone: 'blue' as const, action: () => changeTab('report') },
            { name: '失物线索', icon: 'search', tone: 'amber' as const, action: () => setPanel('lost') },
            { name: '附近服务', icon: 'navigation', tone: 'green' as const, action: () => openDetail('rescue') },
            { name: '安全锦囊', icon: 'book', tone: 'blue' as const, action: () => openDetail('guide') },
          ].map((item) => <Button className='citizen-service' key={item.name} onClick={item.action}><View className={`citizen-service-icon ${item.tone}`}><Icon name={item.icon} tone={item.tone} size={43} /></View><Text>{item.name}</Text></Button>)}
        </View>
        <Section title='身边的守护' action='全部商圈' onAction={() => setPanel('markets')}>
          {marketLoading && !market ? <EmptyState title='读取商圈信息' /> : marketError ? <EmptyState title='商圈信息暂不可用' description={marketError} onRetry={loadMarkets} /> : market ?
            <View>
              {process.env.TARO_ENV !== 'h5' && !mapFailed && Number.isFinite(market.latitude) && Number.isFinite(market.longitude) && !panel ?
                <Map className='citizen-map' latitude={market.latitude} longitude={market.longitude} scale={15} markers={[{ id: 1, latitude: market.latitude, longitude: market.longitude, title: market.name, iconPath: markerService, width: 28, height: 28 }]} onMarkerTap={navigateMarket} onError={() => setMapFailed(true)} /> :
                <Button className='citizen-location-panel' onClick={navigateMarket}><Icon name='mapPin' tone='blue' size={68} /><View><Text>{market.name}</Text><Text>{market.address || market.district || '商圈服务区域'}</Text></View><Icon name='navigation' size={36} /></Button>}
              <View className='citizen-map-footer'><Text>{market.name}</Text><Button onClick={navigateMarket}><Icon name='navigation' tone='blue' size={29} /><Text>导航</Text></Button></View>
            </View> : <EmptyState title='暂无已配置商圈' />}
        </Section>
        <Section title='我的进度' action='全部' onAction={goProgress}>
          {controller.loading ? <EmptyState title='正在读取回执' /> : controller.error ? <EmptyState title='回执暂未更新' description={controller.error} onRetry={() => controller.reloadEvents()} /> : controller.events.length ?
            controller.events.slice(0, 2).map((event) => <EventCard key={event.id} event={event} onClick={() => openDetail('serviceOrder', { id: event.id })} />) :
            <EmptyState title='暂无提交记录' description='当前设备还没有保存的求助或上报回执' />}
        </Section>
      </View>
    </View>}
    <View style={{ display: tab === 'help' ? 'block' : 'none' }}><AlarmScreen controller={controller} /></View>
    <View style={{ display: tab === 'report' ? 'block' : 'none' }}><ReportScreen createReport={controller.createReport} onProgress={goProgress} /></View>
    {tab === 'progress' && <View><PageHeader title='我的进度' subtitle='求助、上报与线索的处理记录' />
      <View className='mini-surface'>
        <View className='mini-tabs'>{([{ key: 'all', name: '全部' }, { key: 'help', name: '求助' }, { key: 'report', name: '上报' }, { key: 'lost', name: '线索' }] as const).map((filter) =>
          <Button key={filter.key} className={controller.progressFilter === filter.key ? 'active' : ''} onClick={() => controller.setProgressFilter(filter.key)}>{filter.name}</Button>)}</View>
        <Button className='mini-text-action citizen-refresh' onClick={() => controller.reloadEvents()}><Icon name='refresh' size={30} /><Text>刷新进度</Text></Button>
        {controller.error && <Text className='mini-error'>{controller.error}</Text>}
        {controller.loading ? <EmptyState title='正在读取回执' /> : controller.events.filter((event) => controller.progressFilter === 'all' || event.kind === controller.progressFilter).length ?
          controller.events.filter((event) => controller.progressFilter === 'all' || event.kind === controller.progressFilter).map((event) => <EventCard key={event.id} event={event} onClick={() => openDetail('serviceOrder', { id: event.id })} />) :
          <EmptyState title='暂无相关记录' description='仅展示当前设备和会话保存的提交回执' />}
      </View></View>}
    {tab === 'mine' && <View><PageHeader title='我的' subtitle='小安智能预警系统 · 个人服务' />
      <View className='mini-surface'>
        <View className='citizen-profile'><View className='citizen-avatar'><Icon name='user' tone='blue' size={60} /></View><View><Text>本机访客</Text><Text>本机记录 {controller.events.length} 条</Text></View></View>
        <Section title='我的记录'>{[{ name: '求助记录', kind: 'help' as const, icon: 'siren' }, { name: '上报记录', kind: 'report' as const, icon: 'report' }, { name: '线索记录', kind: 'lost' as const, icon: 'search' }].map((item) =>
          <Button className='citizen-menu-row' key={item.name} onClick={() => { controller.setProgressFilter(item.kind); goProgress() }}><Icon name={item.icon} size={38} /><Text>{item.name}</Text><Icon name='chevronRight' size={28} /></Button>)}</Section>
        <Section title='服务与设置'>
          <Button className='citizen-menu-row' onClick={onStaff}><Icon name='briefcase' size={38} /><Text>工作人员入口</Text><Icon name='chevronRight' size={28} /></Button>
          <Button className='citizen-menu-row' onClick={() => openDetail('privacy')}><Icon name='shield' size={38} /><Text>隐私与授权</Text><Icon name='chevronRight' size={28} /></Button>
          <Button className='citizen-menu-row' onClick={() => openDetail('about')}><Icon name='info' size={38} /><Text>关于小安智能预警系统</Text><Icon name='chevronRight' size={28} /></Button>
        </Section>
        <Button className='mini-secondary mini-block' onClick={onLogout}><Icon name='logout' size={34} /><Text>结束本次使用</Text></Button>
      </View></View>}
    <Tabbar active={tab} setTab={changeTab} />
    {panel === 'markets' && <BottomSheet title='商圈位置' onClose={() => setPanel(null)}>
      {marketError ? <EmptyState title='未能加载商圈' description={marketError} onRetry={loadMarkets} /> : markets.map((item) =>
        <Button className='citizen-market-row' key={item.id} onClick={() => { setMarketId(item.id); setPanel(null) }}><Icon name='mapPin' tone='blue' size={38} /><View><Text>{item.name}</Text><Text>{item.address || item.district}</Text></View><Icon name={market?.id === item.id ? 'check' : 'chevronRight'} tone='blue' size={30} /></Button>)}
      {!marketLoading && !marketError && !markets.length && <EmptyState title='暂无商圈配置' />}
    </BottomSheet>}
    {panel === 'lost' && <BottomSheet title='登记失物线索' onClose={() => { if (!lostBusy) setPanel(null) }}>
      <Text className='mini-label'>物品或线索名称</Text><Input disabled={lostBusy || undefined} className='mini-input' value={lostName} maxlength={150} placeholder='物品名称或线索概要' onInput={(event) => setLostName(event.detail.value)} />
      <Text className='mini-label'>遗失或发现位置</Text><Input disabled={lostBusy || undefined} className='mini-input' value={lostBay} maxlength={120} placeholder='街道、摊位或附近地标' onInput={(event) => setLostBay(event.detail.value)} />
      {!!lostError && <Text className='mini-error'>{lostError}</Text>}
      <Button className='mini-primary mini-block' loading={lostBusy} disabled={lostBusy || undefined} onClick={submitLost}><Icon name='send' tone='white' size={32} /><Text>提交线索</Text></Button>
    </BottomSheet>}
  </View>
}
