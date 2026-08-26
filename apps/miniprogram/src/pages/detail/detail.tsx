import { useEffect } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { detailMap, normalizeDetailType, type DetailType } from '@/data/detail'
import { statusFlow } from '@/data/safety'
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
        <Text>夜市智防</Text>
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
  const title = params.title ? decodeURIComponent(params.title) : ''
  const id = params.id || 'JT-260802-002'
  const status = params.status ? decodeURIComponent(params.status) : '已派单'
  const bay = params.bay ? decodeURIComponent(params.bay) : '主街烧烤区'
  const level = params.level ? decodeURIComponent(params.level) : '中风险'

  if (type === 'serviceOrder') {
    return (
      <View>
        <StatusCard label='当前状态' value={status} desc={`${bay} · 编号 ${id} · 巡防组会持续更新`} tone={level === '高风险' ? 'danger' : 'blue'} />
        <View className='order-summary'>
          <Text>{title || '夜市现场一键求助'}</Text>
          <Text>我们已收到你的信息，并同步给附近巡防组。</Text>
          <Text>当前位置：{bay}附近。</Text>
          <Text>预计联系：2 分钟内。</Text>
        </View>
        <View className='soft-map'>
          <Text>位置已同步</Text>
          <Text>{bay} · 夜市主通道 · 距离最近联动点约 90m</Text>
        </View>
        <FlowCard active={status} />
        <Button className='primary-action' onClick={() => Taro.showToast({ title: '已提醒巡防组', icon: 'none' })}>提醒巡防组</Button>
      </View>
    )
  }

  if (type === 'staffOrder') {
    return (
      <View>
        <StatusCard label='工单风险' value={level} desc={`${bay} · ${id} · 当前${status}`} tone={level === '高风险' ? 'danger' : 'warn'} />
        <View className='staff-note'>
          <Text>现场处置提示</Text>
          <Text>先确认人员安全，再同步现场照片和处置结果；高风险工单优先请求支援。</Text>
        </View>
        <View className='action-grid'>
          <Button onClick={() => Taro.showToast({ title: '已联系群众', icon: 'none' })}>联系群众</Button>
          <Button onClick={() => Taro.showToast({ title: '已请求支援', icon: 'none' })}>请求支援</Button>
          <Button onClick={() => Taro.showToast({ title: '已打开路线', icon: 'none' })}>查看路线</Button>
          <Button onClick={() => Taro.showToast({ title: '已同步指挥端', icon: 'none' })}>同步指挥</Button>
        </View>
        <FlowCard active={status} />
      </View>
    )
  }

  if (type === 'lost') {
    return (
      <View>
        <StatusCard label='线索登记' value='2 条' desc='研判组会持续同步遗失与扒窃线索' tone='warn' />
        <RecordCard title='粉色手机遗失' meta='三号门夜食街 · 待核验' desc='请补充手机壳、遗失时间和最后出现点位。' status='待核验' />
        <RecordCard title='黑色双肩包遗失' meta='啤酒广场 · 待核验' desc='请描述包内物品，便于研判组比对轨迹。' status='待核验' />
        <Button className='primary-action' onClick={() => Taro.showToast({ title: '已生成线索登记', icon: 'none' })}>提交线索登记</Button>
      </View>
    )
  }

  if (type === 'rescue') {
    return (
      <View>
        <StatusCard label='最近联动点' value='90m' desc='PTU快反点在线，AED 和警戒物资可用' tone='safe' />
        <View className='soft-map'>
          <Text>附近联动覆盖</Text>
          <Text>主街烧烤区 3 分钟响应圈，覆盖PTU快反点、卫生间、AED 和商户服务站。</Text>
        </View>
        <ResourceCard title='PTU快反点' desc='巡防组在线 · 警戒物资 · 距你 90m' action='去这里' />
        <ResourceCard title='商户服务站' desc='平安码咨询 · AED 正常 · 义警 2 人' action='联系' />
        <ResourceCard title='公共卫生间' desc='夜市东侧通道 · 约 120m · 当前开放' action='导航' />
      </View>
    )
  }

  if (type === 'bay') {
    return (
      <View>
        <StatusCard label='当前网格' value='7 个网格' desc='主街烧烤区重点巡防，建议避开围观聚集点' tone='blue' />
        <View className='bay-dashboard'>
          <View><Text>稍多</Text><Text>当前人流</Text></View>
          <View><Text>29°C</Text><Text>体感温度</Text></View>
          <View><Text>90m</Text><Text>最近联动点</Text></View>
        </View>
        {[
          ['主街烧烤区 · 重点巡防', '关注'],
          ['三号门夜食街 · 客流稍多', '慢行'],
          ['后巷摊位区 · 机器狗巡逻', '平稳'],
          ['停车场入口 · 散场关注', '平稳'],
          ['啤酒广场 · AI预警在线', '关注'],
          ['亲子餐饮区 · 义警在线', '舒适'],
          ['商户服务站 · 正常运行', '在线'],
        ].map(([item, state]) => <View className='simple-row' key={item}><Text>{item}</Text><Text>{state}</Text></View>)}
      </View>
    )
  }

  if (type === 'processing' || type === 'help' || type === 'report') {
    const recordTitle = type === 'help' ? '商户一键求助' : type === 'report' ? '烧烤摊前多人推搡' : '粉色手机线索登记'
    const recordMeta = type === 'help' ? '主街烧烤区 · 巡防组已到达' : type === 'report' ? '三号门夜食街 · 已接收' : '三号门夜食街 · 待核验'
    const recordDesc = type === 'help'
      ? '商户上报疑似街霸滋扰，巡防组已到达现场。'
      : type === 'report'
        ? '夜市秩序问题已进入处理队列，群众可继续关注进度。'
        : '线索登记已提交，研判组会核对轨迹和物品特征并联系你。'
    const recordStatus = type === 'help' ? '已到达' : type === 'report' ? '已接收' : '已提交'
    return (
      <View>
        <StatusCard label='当前记录' value={type === 'help' ? '1 条' : type === 'report' ? '1 条' : '3 条'} desc='求助、上报和线索登记都会在这里持续更新' tone='blue' />
        <RecordCard title={recordTitle} meta={recordMeta} desc={recordDesc} status={recordStatus} />
      </View>
    )
  }

  if (type === 'privacy') {
    return (
      <View>
        <StatusCard label='数据使用' value='仅为服务' desc='演示版仅使用本机模拟数据' tone='safe' />
        {[
          '定位只用于求助、上报和附近联动点匹配。',
          '联系方式为可选项，仅用于巡防组回访。',
          '真实版本应支持授权撤回、记录查询和数据删除申请。',
        ].map((item) => <View className='policy-row' key={item}><Text>{item}</Text></View>)}
      </View>
    )
  }

  if (type === 'about') {
    return (
      <View>
        <StatusCard label='系统定位' value='夜市智防助手' desc='帮助群众遇事能求助、商户有事能上报、巡防处置可闭环' tone='blue' />
        <View className='info-section'>
          <Text>服务范围</Text>
          <Text>提供今日提醒、智防网格、附近联动点、紧急求助、隐患上报和线索登记。</Text>
        </View>
      </View>
    )
  }

  return (
    <View>
      <StatusCard label='今日提醒' value='客流稍多' desc='请避开围观聚集，商户遇到滋扰可优先使用平安码同步点位' tone='warn' />
      <View className='soft-map guide-map'>
        <Text>推荐通行方式</Text>
        <Text>走主街外侧通道更顺畅；老人儿童建议避开啤酒广场拥挤区域。</Text>
      </View>
      {[
        '儿童请全程陪同，不要在高峰通道长时间停留。',
        '发现人员围观、推搡或酒后滋事，请先保持安全距离。',
        '发现摊位纠纷、扒窃线索或人员异常，可以先上报位置。',
        '紧急情况请优先拨打 110 或 120，再同步现场位置。',
      ].map((item) => <View className='policy-row' key={item}><Text>{item}</Text></View>)}
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

function RecordCard({ title, meta, desc, status }: { title: string; meta: string; desc: string; status: string }) {
  return (
    <View className='record-card'>
      <View className='record-head'>
        <View>
          <Text>{title}</Text>
          <Text>{meta}</Text>
        </View>
        <Text>{status}</Text>
      </View>
      <Text className='record-desc'>{desc}</Text>
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
            <Text>{stepIndex <= index ? '已同步给你' : '等待巡防组更新'}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function ResourceCard({ title, desc, action }: { title: string; desc: string; action: string }) {
  return (
    <View className='resource-card'>
      <View>
        <Text>{title}</Text>
        <Text>{desc}</Text>
      </View>
      <Button onClick={() => Taro.showToast({ title: `${action}已触发`, icon: 'none' })}>{action}</Button>
    </View>
  )
}
