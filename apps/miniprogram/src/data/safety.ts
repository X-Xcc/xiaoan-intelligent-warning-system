import type { EventStatus, SafetyEvent } from '@/types/events'

export const bayOptions = ['龙沙湾', '摩天湾', '凤凰湾', '九龙湾', '万紫滩', '千红滩', '观洲湾', '七星湾', '青洲湾']

export const reportCategories = ['设施损坏', '环境卫生', '人流拥挤', '儿童走失', '亲水提醒', '其他']

export const statusFlow: EventStatus[] = ['已提交', '已派单', '已接收', '已到达', '处理中', '已完成']

export const statusRank: Record<EventStatus, number> = statusFlow.reduce(
  (rank, status, index) => ({ ...rank, [status]: index }),
  {} as Record<EventStatus, number>,
)

export const initialEvents: SafetyEvent[] = [
  {
    id: 'JT-260802-001',
    kind: 'report',
    title: '救生圈箱门松动',
    bay: '万紫滩',
    level: '中风险',
    source: '游客反馈',
    status: '已接收',
    owner: '李敏',
    distance: '1.1km',
    time: '15:08',
    updatedAt: '15:18',
    description: '救生圈箱门无法完全闭合，可能影响取用。',
  },
  {
    id: 'JT-260802-002',
    kind: 'help',
    title: '儿童靠近水边',
    bay: '摩天湾',
    level: '高风险',
    source: '一键求助',
    status: '已到达',
    owner: '王队',
    distance: '420m',
    time: '15:22',
    updatedAt: '15:26',
    description: '亲水平台附近儿童独自靠近水边。',
  },
  {
    id: 'JT-260802-003',
    kind: 'lost',
    title: '黑色双肩包遗失',
    bay: '龙沙湾',
    level: '低风险',
    source: '失物招领',
    status: '已完成',
    owner: '服务台',
    distance: '服务点',
    time: '14:48',
    updatedAt: '15:02',
    description: '游客已在服务台取回。',
    result: '已核验失主信息并完成领取登记。',
  },
]
