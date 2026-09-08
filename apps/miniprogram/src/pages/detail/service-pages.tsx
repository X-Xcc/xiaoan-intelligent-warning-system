import { useCallback, useEffect, useState } from 'react'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { EmptyState, Icon, Section } from '@/components/ui'
import { parseNightMarketSites, type DetailType, type NightMarketSite } from '@/data/detail'
import { requestApi } from '@/utils/api'
import brandMark from '@/assets/yanhuo-shaobing-mark.png'
import { confirmPhoneCall, goToMain, openPoint } from './native-actions'

const guideTopics = [
  { icon: 'user', title: '同行照看', body: '与同行人约定碰面地点，照看好儿童与随身物品。人多时留意彼此位置，不在通道停留聚集。' },
  { icon: 'briefcase', title: '随身物品', body: '手机、钱包等物品妥善收好。遗失后记下时间、地点与明显特征；发现疑似被盗情况时，保留已有线索。' },
  { icon: 'mapPin', title: '留意通道', body: '注意现场出入口与疏散标识，避免堵塞摊位间通道。前往陌生位置时，以现场标识和实际道路为准。' },
  { icon: 'shield', title: '如实记录', body: '现场信息尽量写清时间、位置与具体情况。不要为拍摄靠近危险，也不要传播他人的身份、电话等无关信息。' },
]

export function ServicePages({ type }: { type: DetailType }) {
  if (type === 'rescue' || type === 'bay') return <SiteDirectory area={type === 'bay'} />
  if (type === 'lost') return <LostService />
  if (type === 'privacy') return <PrivacyPage />
  if (type === 'about') return <AboutPage />
  if (type === 'help' || type === 'report' || type === 'processing') return <PersonalReceipts />
  return (
    <View>
      <Section title='逛夜市的小提醒'>
        {guideTopics.map((topic) => <InfoRow key={topic.title} {...topic} />)}
      </Section>
      <Section title='需要帮助时'>
        <ServiceLink icon='search' title='失物线索' description='物品特征、遗失位置与线索登记' type='lost' />
        <ServiceLink icon='mapPin' title='附近点位' description='已配置的夜市位置' type='rescue' />
      </Section>
      <EmergencyContacts />
    </View>
  )
}

function LostService() {
  return (
    <View>
      <View className='detail-service-intro'>
        <View className='detail-service-symbol amber'><Icon name='search' tone='amber' size={46} /></View>
        <Text className='detail-event-title'>给失物留一条线索</Text>
        <Text className='detail-body'>记下物品特征与最后见到的位置。线索登记不代表已经找到物品，也不代表已受理报案。</Text>
      </View>
      <Button className='mini-primary detail-button' onClick={() => goToMain('tab=home&panel=lost')}>
        <Icon name='plus' tone='white' size={34} /><Text>登记失物线索</Text>
      </Button>
      <Button className='mini-secondary detail-button' onClick={() => goToMain('tab=progress')}>
        <Icon name='clock' tone='blue' size={32} /><Text>查看我的线索回执</Text>
      </Button>
      <Section title='线索要点'>
        <InfoRow icon='briefcase' title='物品特征' body='物品名称、颜色、外观和容易辨认的标记；不要公开证件号码、银行卡号或密码。' />
        <InfoRow icon='mapPin' title='时间与位置' body='大致遗失时间、最后停留的区域，以及附近摊位、入口等参照物。' />
        <InfoRow icon='info' title='疑似被盗' body='遗失线索与电话报警是不同渠道。需要报警时可拨打 110，并如实说明已有线索。' />
      </Section>
      <EmergencyContacts />
    </View>
  )
}

function PersonalReceipts() {
  useEffect(() => { void goToMain('tab=progress') }, [])
  return (
    <View>
      <EmptyState title='打开个人回执' description='求助、上报和线索记录统一保存在“我的进度”。' />
      <Button className='mini-primary detail-button' onClick={() => goToMain('tab=progress')}>
        <Icon name='clock' tone='white' size={32} /><Text>查看我的进度</Text>
      </Button>
    </View>
  )
}

function SiteDirectory({ area }: { area: boolean }) {
  const [sites, setSites] = useState<NightMarketSite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const load = async () => {
      try {
        const next = parseNightMarketSites(await requestApi<unknown>('/events/night-markets'))
        if (active) setSites(next)
      } catch {
        if (active) setError('点位列表未能读取，请检查网络后重试。')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [revision])

  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const keyword = query.trim().toLowerCase()
  const filtered = sites.filter((site) => `${site.name} ${site.district} ${site.address}`.toLowerCase().includes(keyword))

  return (
    <View>
      <View className='detail-notice'>
        <Icon name='info' tone='blue' size={34} />
        <Text>{area ? '夜市区域目录，不表示实时客流或风险等级。' : '当前提供夜市位置；服务站、AED 等设施位置请以现场标识为准。'}</Text>
      </View>
      <View className='detail-search'>
        <Icon name='search' tone='muted' size={34} />
        <Input className='detail-search-input' value={query} placeholder='搜索夜市、区域或地址' maxlength={100} onInput={(input) => setQuery(input.detail.value)} />
        {query && <Button className='detail-search-clear' aria-label='清除搜索' onClick={() => setQuery('')}><Icon name='close' size={30} /></Button>}
      </View>
      <View className='detail-refresh-row'>
        <Text className='detail-caption'>{loading ? '正在读取点位' : error ? '点位暂未更新' : `${sites.length} 个已配置点位`}</Text>
        <Button className='detail-inline-button' disabled={loading || undefined} onClick={reload}><Icon name='refresh' tone='blue' size={28} /><Text>刷新</Text></Button>
      </View>
      {loading
        ? <View className='detail-loading'><Icon name='mapPin' tone='blue' size={44} /><Text>正在读取夜市位置</Text></View>
        : error
          ? <EmptyState title='点位暂时无法读取' description={error} onRetry={reload} />
          : !sites.length
            ? <EmptyState title='暂无已配置点位' description='当前位置目录尚未提供夜市数据。' onRetry={reload} />
            : !filtered.length
              ? <EmptyState title='没有匹配的点位' description='试试其他夜市名称或地址。' onRetry={() => setQuery('')} />
              : <View className='detail-site-list'>
                {filtered.map((site) => (
                  <View className='detail-site' key={site.id}>
                    <View className='detail-site-heading'>
                      <Icon name='mapPin' tone='blue' size={36} />
                      <Text className='detail-row-title'>{site.name}</Text>
                      {site.district && <Text className='detail-caption'>{site.district}</Text>}
                    </View>
                    <Text className='detail-body'>{site.address || '未提供详细地址'}</Text>
                    {!site.point && <Text className='detail-caption'>尚无可导航坐标</Text>}
                    {site.source && <Text className='detail-site-source'>来源：{site.source}</Text>}
                    <Button className='mini-secondary detail-button' disabled={!site.point || undefined} onClick={() => openPoint(site.point, site.name, site.address || site.name)}>
                      <Icon name='navigation' tone={site.point ? 'blue' : 'muted'} size={30} /><Text>打开位置</Text>
                    </Button>
                  </View>
                ))}
              </View>}
      {!area && <EmergencyContacts />}
    </View>
  )
}

function PrivacyPage() {
  return (
    <View>
      <Section title='提交的信息'>
        <InfoRow icon='report' title='事件记录' body='提交的文字、位置、可选联系方式和附件构成事件记录，供后续核实与处理。请仅提供与本次事件有关的信息。' />
        <InfoRow icon='camera' title='照片与视频' body='附件可能包含人脸、车牌或其他个人信息。提交前请核对内容，避免包含无关人员的证件、电话等敏感信息。' />
      </Section>
      <Section title='设备权限'>
        <InfoRow icon='location' title='位置' body='设备定位需要相应权限。没有准确坐标时，文字地址不应被当作已定位的现场点。权限可在微信或系统设置中管理。' />
        <InfoRow icon='phone' title='联系方式' body='事件预留电话可能用于现场联系。发起电话前会确认号码；打开拨号不表示对方已接听。' />
      </Section>
      <Section title='回执与访问'>
        <Text className='detail-body'>“我的进度”按当前会话在本机保存的回执索引展示记录。更换设备、退出会话或清理本机数据可能影响记录入口，不等于服务端记录已删除。</Text>
        <View className='detail-notice detail-notice-amber'><Icon name='info' tone='amber' size={34} /><Text>本页不是完整隐私政策，也不表示服务端访问隔离、保存期限或删除机制已经完备。相关规则需由运营方另行明确。</Text></View>
      </Section>
      <Section title='信息更正与咨询'>
        <Text className='detail-body'>已有事件可补充更正说明。删除或其他数据处理需求，请向现场运营方说明事件编号并核实处理渠道；本页不提供自动删除承诺。</Text>
        <Button className='mini-secondary detail-button' onClick={() => goToMain('tab=progress')}>
          <Icon name='clock' tone='blue' size={32} /><Text>我的事件回执</Text>
        </Button>
      </Section>
    </View>
  )
}

function AboutPage() {
  return (
    <View>
      <View className='detail-about-brand'>
        <Image src={brandMark} mode='aspectFit' className='detail-about-logo' />
        <View><Text className='detail-event-title'>烟火哨兵</Text><Text className='detail-caption'>夜市现场服务</Text></View>
      </View>
      <Text className='detail-body'>连接逛夜市的人、商户与现场工作人员，让求助有记录，让后续情况可追踪。</Text>
      <Section title='服务说明'>
        <InfoRow icon='report' title='以回执为准' body='提交、派单、接单、到场与完成是不同阶段。处理情况以事件记录为准，不承诺固定响应或到达时间。' />
        <InfoRow icon='phone' title='平台求助与电话报警' body='平台事件提交不会自动拨打报警电话，也不等同于公安机关受理报案。' />
      </Section>
      <Section title='相关信息'>
        <ServiceLink icon='shield' title='隐私说明' description='提交的信息、设备权限与回执' type='privacy' />
        <ServiceLink icon='book' title='安全锦囊' description='同行照看与随身物品提醒' type='guide' />
        <ServiceLink icon='mapPin' title='夜市区域' description='当前已配置的位置目录' type='bay' />
      </Section>
    </View>
  )
}

function InfoRow({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View className='detail-info-row'>
      <Icon name={icon} tone='blue' size={36} />
      <View><Text className='detail-row-title'>{title}</Text><Text className='detail-body'>{body}</Text></View>
    </View>
  )
}

function ServiceLink({ icon, title, description, type }: { icon: string; title: string; description: string; type: DetailType }) {
  const open = async () => {
    try {
      await Taro.navigateTo({ url: `/pages/detail/detail?type=${type}` })
    } catch {
      await Taro.showToast({ title: '页面未打开，请重试', icon: 'none' })
    }
  }
  return (
    <Button className='detail-service-link' onClick={() => void open()}>
      <Icon name={icon} tone='blue' size={38} />
      <View><Text className='detail-row-title'>{title}</Text><Text className='detail-caption'>{description}</Text></View>
      <Icon name='chevronRight' size={28} />
    </Button>
  )
}

function EmergencyContacts() {
  return (
    <Section title='紧急电话'>
      <View className='detail-emergency-actions'>
        <Button className='mini-secondary detail-button' onClick={() => confirmPhoneCall('110', '拨打报警电话')}>
          <Icon name='phone' tone='danger' size={32} /><Text>报警 110</Text>
        </Button>
        <Button className='mini-secondary detail-button' onClick={() => confirmPhoneCall('120', '拨打急救电话')}>
          <Icon name='phone' tone='blue' size={32} /><Text>急救 120</Text>
        </Button>
      </View>
    </Section>
  )
}
