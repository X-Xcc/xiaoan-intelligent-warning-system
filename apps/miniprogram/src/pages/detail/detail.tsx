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
        <Text>江滩服务</Text>
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
  const bay = params.bay ? decodeURIComponent(params.bay) : '3号湾区'
  const level = params.level ? decodeURIComponent(params.level) : '中风险'

  if (type === 'serviceOrder') {
    return (
      <View>
        <StatusCard label='当前状态' value={status} desc={`${bay} · 编号 ${id} · 工作人员会持续更新`} tone={level === '高风险' ? 'danger' : 'blue'} />
        <View className='order-summary'>
          <Text>{title || '游客现场协同求助'}</Text>
          <Text>我们已收到你的信息，并同步给附近工作人员。</Text>
          <Text>当前位置：{bay}亲水平台附近。</Text>
          <Text>预计联系：2 分钟内。</Text>
        </View>
        <View className='soft-map'>
          <Text>位置已同步</Text>
          <Text>{bay} · 亲水平台外侧 · 距离最近服务点约 360m</Text>
        </View>
        <FlowCard active={status} />
        <Button className='primary-action' onClick={() => Taro.showToast({ title: '已提醒工作人员', icon: 'none' })}>提醒工作人员</Button>
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
          <Button onClick={() => Taro.showToast({ title: '已联系游客', icon: 'none' })}>联系游客</Button>
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
        <StatusCard label='待认领' value='2 件' desc='服务点会持续同步失物信息' tone='warn' />
        <RecordCard title='儿童蓝色水杯' meta='3号湾区服务点 · 待认领' desc='请到服务点核验颜色、贴纸或姓名标识。' status='待认领' />
        <RecordCard title='白色遮阳帽' meta='5号湾区服务台 · 待认领' desc='服务台保管中，认领需描述遗失时间。' status='待认领' />
        <Button className='primary-action' onClick={() => Taro.showToast({ title: '已生成认领登记', icon: 'none' })}>提交认领登记</Button>
      </View>
    )
  }

  if (type === 'rescue') {
    return (
      <View>
        <StatusCard label='最近服务点' value='360m' desc='A03 服务岗亭在线，AED 和医药箱可用' tone='safe' />
        <View className='soft-map'>
          <Text>附近服务覆盖</Text>
          <Text>3号湾区 5 分钟步行圈，覆盖岗亭、卫生间、AED 和服务驿站。</Text>
        </View>
        <ResourceCard title='A03 服务岗亭' desc='工作人员在线 · 饮水与问询 · 距你 360m' action='去这里' />
        <ResourceCard title='亲水平台服务点' desc='医药箱可用 · AED 正常 · 志愿者 2 人' action='联系' />
        <ResourceCard title='公共卫生间' desc='沿江步道内侧 · 约 280m · 当前开放' action='导航' />
      </View>
    )
  }

  if (type === 'bay') {
    return (
      <View>
        <StatusCard label='当前开放' value='7 个湾区' desc='3号湾区人流稍多，建议老人儿童走外侧步道' tone='blue' />
        <View className='bay-dashboard'>
          <View><Text>稍多</Text><Text>当前人流</Text></View>
          <View><Text>29°C</Text><Text>体感温度</Text></View>
          <View><Text>360m</Text><Text>最近服务点</Text></View>
        </View>
        {[
          ['1号湾区 · 开放中', '舒适'],
          ['2号湾区 · 开放中', '舒适'],
          ['3号湾区 · 人流稍多', '建议慢行'],
          ['4号湾区 · 开放中', '舒适'],
          ['5号湾区 · 设施处理中', '绕行'],
          ['6号湾区 · 开放中', '舒适'],
          ['7号湾区 · 开放中', '舒适'],
        ].map(([item, state]) => <View className='simple-row' key={item}><Text>{item}</Text><Text>{state}</Text></View>)}
      </View>
    )
  }

  if (type === 'processing' || type === 'help' || type === 'report') {
    const recordTitle = type === 'help' ? '儿童无人看护' : type === 'report' ? '救生圈箱门松动' : '儿童蓝色水杯认领'
    const recordMeta = type === 'help' ? '3号湾区 · 工作人员已到达' : type === 'report' ? '5号湾区 · 已接收' : '3号湾区服务点 · 待核验'
    const recordDesc = type === 'help'
      ? '亲水平台附近儿童独自靠近水边，工作人员已到达现场。'
      : type === 'report'
        ? '设施问题已进入处理队列，游客可继续关注进度。'
        : '认领登记已提交，服务台会核对物品特征并联系你。'
    const recordStatus = type === 'help' ? '已到达' : type === 'report' ? '已接收' : '已提交'
    return (
      <View>
        <StatusCard label='当前记录' value={type === 'help' ? '1 条' : type === 'report' ? '1 条' : '3 条'} desc='求助、反馈和失物登记都会在这里持续更新' tone='blue' />
        <RecordCard title={recordTitle} meta={recordMeta} desc={recordDesc} status={recordStatus} />
      </View>
    )
  }

  if (type === 'privacy') {
    return (
      <View>
        <StatusCard label='数据使用' value='仅为服务' desc='演示版仅使用本机模拟数据' tone='safe' />
        {[
          '定位只用于求助、反馈和附近服务匹配。',
          '联系方式为可选项，仅用于工作人员回访。',
          '真实版本应支持授权撤回、记录查询和数据删除申请。',
        ].map((item) => <View className='policy-row' key={item}><Text>{item}</Text></View>)}
      </View>
    )
  }

  if (type === 'about') {
    return (
      <View>
        <StatusCard label='系统定位' value='游客服务助手' desc='帮助游客游得安心、找得到服务、遇事能求助' tone='blue' />
        <View className='info-section'>
          <Text>服务范围</Text>
          <Text>提供今日提醒、区域开放、附近服务、紧急求助、问题反馈和失物招领。</Text>
        </View>
      </View>
    )
  }

  return (
    <View>
      <StatusCard label='今日提醒' value='人流稍多' desc='请照看好老人儿童，亲水平台内侧请勿越线停留' tone='warn' />
      <View className='soft-map guide-map'>
        <Text>推荐游玩方式</Text>
        <Text>走外侧步道更舒适；老人儿童建议避开亲水平台边缘区域。</Text>
      </View>
      {[
        '儿童请全程陪同，不要单独靠近水边。',
        '橙色围挡外为暂不开放区域，请勿翻越。',
        '发现设施损坏或人员异常，可以先反馈位置。',
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
      <Text>服务进度</Text>
      {statusFlow.map((step, stepIndex) => (
        <View className='flow-row' key={step}>
          <Text className={stepIndex <= index ? 'flow-dot active' : 'flow-dot'} />
          <View>
            <Text>{step}</Text>
            <Text>{stepIndex <= index ? '已同步给你' : '等待工作人员更新'}</Text>
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
