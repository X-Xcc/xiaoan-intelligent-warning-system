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

type DetailMeta = {
  title: string
  subtitle: string
  badge: string
}

const detailFallback: DetailType = 'guide'

export const detailMap: Record<DetailType, DetailMeta> = {
  help: { title: '我的求助', subtitle: '查看求助记录、巡防组响应和补充说明', badge: '夜市平安码' },
  report: { title: '我的上报', subtitle: '查看隐患上报、受理状态和回访记录', badge: '群众上报' },
  lost: { title: '失物/扒窃线索', subtitle: '提交遗失物品、疑似扒窃线索和核验信息', badge: '线索登记' },
  guide: { title: '夜市提醒', subtitle: '今日客流、重点区域和现场提示', badge: '今日' },
  rescue: { title: '附近点位', subtitle: '服务站、PTU快反点、AED 和卫生间位置', badge: '就近' },
  privacy: { title: '隐私说明', subtitle: '说明定位、求助、上报信息会怎么用', badge: '请放心' },
  about: { title: '关于烟火哨兵', subtitle: '给商户和逛夜市的人用的安全服务小程序', badge: '群众端' },
  bay: { title: '夜市网格', subtitle: '查看各区域状态、客流和巡防提示', badge: '更新中' },
  processing: { title: '我的进度', subtitle: '查看求助、上报、线索登记的当前状态', badge: '持续更新' },
  serviceOrder: { title: '事件详情', subtitle: '查看位置、负责人和处理进度', badge: '事件' },
  staffOrder: { title: '工单详情', subtitle: '现场处置、支援和结果回填', badge: '巡防' },
}

export const normalizeDetailType = (value?: string): DetailType => {
  return value && value in detailMap ? (value as DetailType) : detailFallback
}
