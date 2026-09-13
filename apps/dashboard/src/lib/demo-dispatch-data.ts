export type DemoDispatchPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  status: 'incident' | 'available' | 'busy';
};

export type DemoDispatchUnit = {
  id: string;
  name: string;
  role: string;
  status: '可调度' | '处置中' | '已离线';
  distanceLabel: string;
  etaLabel: string;
  pointId: string;
};

export type DemoCommuteOption = {
  id: string;
  label: string;
  detail: string;
  distanceLabel: string;
  etaLabel: string;
  recommended?: boolean;
};

export type DemoDispatchData = {
  incident: DemoDispatchPoint;
  points: DemoDispatchPoint[];
  routePoints: Array<{ x: number; y: number }>;
  units: DemoDispatchUnit[];
  commuteOptions: DemoCommuteOption[];
};

export const demoDispatchData: DemoDispatchData = {
  incident: { id: 'demo-incident', label: '演示辖区 · B 区 07 号点位', x: 74, y: 54, status: 'incident' },
  points: [
    { id: 'demo-unit-point-01', label: '北侧入口', x: 34, y: 27, status: 'available' },
    { id: 'demo-unit-point-02', label: '主街巡防点', x: 52, y: 70, status: 'busy' },
    { id: 'demo-unit-point-03', label: 'A 区服务点', x: 82, y: 77, status: 'available' },
  ],
  routePoints: [
    { x: 34, y: 27 },
    { x: 39, y: 33 },
    { x: 48, y: 37 },
    { x: 58, y: 43 },
    { x: 66, y: 49 },
    { x: 74, y: 54 },
  ],
  units: [
    { id: 'demo-unit-01', name: '快反组 01', role: '摩托车巡防组', status: '可调度', distanceLabel: '演示距离 680m', etaLabel: '预计 3 分钟', pointId: 'demo-unit-point-01' },
    { id: 'demo-unit-02', name: '巡逻组 02', role: '步巡处置组', status: '处置中', distanceLabel: '演示距离 420m', etaLabel: '预计 5 分钟', pointId: 'demo-unit-point-02' },
    { id: 'demo-unit-03', name: '机动组 03', role: '车辆机动组', status: '可调度', distanceLabel: '演示距离 1.2km', etaLabel: '预计 6 分钟', pointId: 'demo-unit-point-03' },
  ],
  commuteOptions: [
    { id: 'motorcycle-walk', label: '摩托车 + 步行', detail: '到北侧入口后步行进入 B 区', distanceLabel: '680m + 120m', etaLabel: '约 3 分钟', recommended: true },
    { id: 'patrol-car', label: '巡逻车', detail: '可到达外围接驳点，需步行进入', distanceLabel: '1.2km', etaLabel: '约 6 分钟' },
    { id: 'walk', label: '步行', detail: '沿主街巡防线进入现场', distanceLabel: '420m', etaLabel: '约 5 分钟' },
  ],
};

export function selectRecommendedUnit(data: DemoDispatchData): DemoDispatchUnit {
  return data.units.find((unit) => unit.status === '可调度') ?? data.units[0];
}
