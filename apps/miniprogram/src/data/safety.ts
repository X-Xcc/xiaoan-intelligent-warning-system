import type { EventStatus } from '@/types/events'

export const bayOptions = ['主街烧烤区', '三号门夜食街', '后巷摊位区', '停车场入口', '啤酒广场', '亲子餐饮区', '商户服务站']

export const reportCategories = ['街霸滋扰', '打架斗殴', '扒窃线索', '摊位纠纷', '夜间照明异常', '噪音扰民', '其他']

export const statusFlow: EventStatus[] = ['已提交', '已派单', '已接收', '已到达', '处理中', '已完成']

export const statusRank: Record<EventStatus, number> = statusFlow.reduce(
  (rank, status, index) => ({ ...rank, [status]: index }),
  {} as Record<EventStatus, number>,
)
