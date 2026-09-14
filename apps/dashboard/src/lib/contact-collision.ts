export type CollisionPoint = {
  x: number;
  y: number;
  label: string;
  time: string;
};

export type CollisionRoute = {
  person: '赵六' | '受害人' | '张三' | '李四';
  color: string;
  points: CollisionPoint[];
  state: string;
  detail: string;
};

export type CollisionEvidencePoint = {
  x: number;
  y: number;
  label: string;
  imagePath: string;
  note: string;
};

export type CollisionTimelineItem = {
  time: string;
  label: string;
  detail: string;
  tone: 'blue' | 'green' | 'purple' | 'red' | 'gold';
};

export const collisionOverlapRate = 68;

export const collisionRoutes: CollisionRoute[] = [
  {
    person: '赵六',
    color: '#2f6fd2',
    state: '路线完整',
    detail: '共 06 个虚拟节点',
    points: [
      { x: 92, y: 286, label: 'P-01', time: '20:11:20' },
      { x: 790, y: 258, label: 'P-02', time: '20:12:40' },
      { x: 625, y: 300, label: 'P-03', time: '20:13:50' },
      { x: 500, y: 368, label: 'P-04', time: '20:14:20' },
      { x: 355, y: 454, label: 'P-05', time: '20:15:10' },
      { x: 190, y: 520, label: 'P-06', time: '20:16:05' },
    ],
  },
  {
    person: '受害人',
    color: '#318978',
    state: '路线完整',
    detail: '共 06 个虚拟节点',
    points: [
      { x: 445, y: 96, label: 'V-01', time: '20:10:55' },
      { x: 400, y: 220, label: 'V-02', time: '20:12:05' },
      { x: 375, y: 308, label: 'V-03', time: '20:13:10' },
      { x: 485, y: 356, label: 'V-04', time: '20:13:50' },
      { x: 640, y: 430, label: 'V-05', time: '20:14:20' },
      { x: 825, y: 548, label: 'V-06', time: '20:16:20' },
    ],
  },
  {
    person: '张三',
    color: '#875ac7',
    state: '路线缺失',
    detail: '遮挡脸部信息 · 仅保留接触点',
    points: [
      { x: 120, y: 128, label: 'Z-01', time: '20:12:48' },
      { x: 270, y: 190, label: 'Z-02', time: '20:13:22' },
      { x: 455, y: 270, label: 'Z-03', time: '20:13:50' },
      { x: 640, y: 285, label: 'Z-04', time: '20:14:05' },
      { x: 790, y: 190, label: 'Z-05', time: '20:14:26' },
    ],
  },
  {
    person: '李四',
    color: '#c4515e',
    state: '路线缺失',
    detail: '遮挡脸部信息 · 仅保留接触点',
    points: [
      { x: 790, y: 525, label: 'L-01', time: '20:12:35' },
      { x: 720, y: 450, label: 'L-02', time: '20:13:12' },
      { x: 615, y: 320, label: 'L-03', time: '20:13:50' },
      { x: 470, y: 365, label: 'L-04', time: '20:14:12' },
      { x: 275, y: 520, label: 'L-05', time: '20:15:08' },
    ],
  },
];

export const collisionEvidencePoints: CollisionEvidencePoint[] = [
  {
    x: 455,
    y: 270,
    label: 'P-03 · 第一次接触',
    imagePath: '/contact-review-assets/zijing-demo-cam-02.thumb.webp',
    note: '赵六 / 受害人 首次进入同一虚拟区域',
  },
  {
    x: 625,
    y: 300,
    label: '案发地 · 同时接触',
    imagePath: '/contact-review-assets/zijing-demo-cam-04.thumb.webp',
    note: '四人轨迹在中心广场发生时序交汇',
  },
  {
    x: 790,
    y: 285,
    label: 'P-04 · 再次重合',
    imagePath: '/contact-review-assets/zijing-demo-cam-08.thumb.webp',
    note: '赵六 / 受害人 第二次进入重叠带',
  },
];

export const collisionTimeline: CollisionTimelineItem[] = [
  { time: '20:13:10', label: '受害人进入中心巷道', detail: 'V-03 · 南侧摊位区', tone: 'green' },
  { time: '20:13:50', label: '第一次接触', detail: 'P-03 · 赵六 / 受害人', tone: 'gold' },
  { time: '20:14:05', label: '张三进入接触带', detail: 'Z-04 · 路线未形成', tone: 'purple' },
  { time: '20:14:12', label: '李四进入接触带', detail: 'L-04 · 路线未形成', tone: 'red' },
  { time: '20:14:20', label: '同时接触', detail: '中心广场 · 四人时序交汇', tone: 'gold' },
  { time: '20:15:10', label: '赵六离开中心区域', detail: 'P-05 · 主通道 A', tone: 'blue' },
];
