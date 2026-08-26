import type { EventStatus, SafetyEvent } from '@/types/events'

export const bayOptions = ['主街烧烤区', '三号门夜食街', '后巷摊位区', '停车场入口', '啤酒广场', '亲子餐饮区', '商户服务站']

export const reportCategories = ['街霸滋扰', '打架斗殴', '扒窃线索', '摊位纠纷', '夜间照明异常', '噪音扰民', '其他']

export const statusFlow: EventStatus[] = ['已提交', '已派单', '已接收', '已到达', '处理中', '已完成']

export const statusRank: Record<EventStatus, number> = statusFlow.reduce(
  (rank, status, index) => ({ ...rank, [status]: index }),
  {} as Record<EventStatus, number>,
)

export const initialEvents: SafetyEvent[] = [
  {
    id: 'YS-260815-001',
    kind: 'report',
    title: '烧烤摊前多人推搡',
    bay: '三号门夜食街',
    level: '中风险',
    source: 'AI视频预警',
    status: '已接收',
    owner: '李敏',
    distance: '180m',
    time: '21:08',
    updatedAt: '21:10',
    description: 'AI识别到摊位前多人聚集推搡，疑似酒后消费纠纷升级，请附近巡防组先期劝阻。',
  },
  {
    id: 'YS-260815-002',
    kind: 'help',
    title: '商户一键求助：疑似街霸滋扰',
    bay: '主街烧烤区',
    level: '高风险',
    source: '夜市平安码',
    status: '已到达',
    owner: '王队',
    distance: '90m',
    time: '21:22',
    updatedAt: '21:25',
    description: '商户通过夜市平安码上报，两名醉酒人员拍打桌椅、威胁摊主，现场有围观聚集风险。',
  },
  {
    id: 'YS-260815-003',
    kind: 'lost',
    title: '粉色手机疑似扒窃',
    bay: '三号门夜食街',
    level: '低风险',
    source: '群众报警',
    status: '已完成',
    owner: '研判组',
    distance: '指挥室',
    time: '20:48',
    updatedAt: '21:06',
    description: '群众报警称手机在夜市三号门附近遗失，研判组通过轨迹比对锁定疑似扒窃人员。',
    result: '已完成视频轨迹复盘，嫌疑目标交由处置组跟进。',
  },
]
