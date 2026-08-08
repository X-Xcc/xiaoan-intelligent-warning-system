export type DetailType =
  | 'help'
  | 'report'
  | 'lost'
  | 'guide'
  | 'rescue'
  | 'privacy'
  | 'about'
  | 'bay'
  | 'processing'
  | 'serviceOrder'
  | 'staffOrder'

export type DetailMeta = {
  title: string
  subtitle: string
  badge: string
}

export const detailFallback: DetailType = 'guide'

export const detailMap: Record<DetailType, DetailMeta> = {
  help: { title: '我的求助', subtitle: '查看求助记录、工作人员响应和补充说明', badge: '紧急服务' },
  report: { title: '我的反馈', subtitle: '查看问题反馈、受理状态和回访记录', badge: '游客反馈' },
  lost: { title: '失物招领', subtitle: '查看待认领物品，提交认领登记', badge: '便民服务' },
  guide: { title: '游玩提醒', subtitle: '今日天气、人流、亲水区域和安全建议', badge: '今日适用' },
  rescue: { title: '附近服务', subtitle: '服务点、救援岗亭、AED 和卫生间位置', badge: '离你最近' },
  privacy: { title: '隐私说明', subtitle: '说明定位、求助、反馈信息的使用范围', badge: '安心使用' },
  about: { title: '关于江滩服务', subtitle: '面向游客的江滩安全与便民服务助手', badge: '游客端' },
  bay: { title: '开放区域', subtitle: '七个湾区开放状态、人流舒适度和游玩建议', badge: '实时更新' },
  processing: { title: '我的进度', subtitle: '查看求助、反馈、失物登记的当前状态', badge: '持续更新' },
  serviceOrder: { title: '服务详情', subtitle: '查看服务状态、位置、负责人和处理进度', badge: '服务追踪' },
  staffOrder: { title: '工单详情', subtitle: '工作人员现场处置、资源联动和结果回填', badge: '巡防处置' },
}

export const normalizeDetailType = (value?: string): DetailType => {
  return value && value in detailMap ? (value as DetailType) : detailFallback
}
