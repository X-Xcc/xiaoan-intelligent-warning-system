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
  help: { title: '我的求助', subtitle: '查看求助记录、巡防组响应和补充说明', badge: '夜市平安码' },
  report: { title: '我的上报', subtitle: '查看隐患上报、受理状态和回访记录', badge: '群众上报' },
  lost: { title: '失物/扒窃线索', subtitle: '提交遗失物品、疑似扒窃线索和核验信息', badge: '线索登记' },
  guide: { title: '夜市提醒', subtitle: '今日客流、重点网格、风险提示和安全建议', badge: '今日适用' },
  rescue: { title: '附近联动点', subtitle: '商户服务站、PTU快反点、AED 和卫生间位置', badge: '离你最近' },
  privacy: { title: '隐私说明', subtitle: '说明定位、求助、上报信息的使用范围', badge: '安心使用' },
  about: { title: '关于夜市智防', subtitle: '面向商户与群众的夜市数智安全治理助手', badge: '群众端' },
  bay: { title: '智防网格', subtitle: '夜市网格状态、客流舒适度和巡防建议', badge: '实时更新' },
  processing: { title: '我的进度', subtitle: '查看求助、上报、线索登记的当前状态', badge: '持续更新' },
  serviceOrder: { title: '事件详情', subtitle: '查看事件状态、位置、负责人和处理进度', badge: '事件追踪' },
  staffOrder: { title: '工单详情', subtitle: '巡防人员现场处置、资源联动和结果回填', badge: '巡防处置' },
}

export const normalizeDetailType = (value?: string): DetailType => {
  return value && value in detailMap ? (value as DetailType) : detailFallback
}
