export type DemoDispatchPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  status: 'incident' | 'available';
};

export type DemoDispatchRoute = {
  id: string;
  label: string;
  points: Array<{ x: number; y: number }>;
  status: 'candidate' | 'recommended' | 'congested';
  congestionSegment?: Array<{ x: number; y: number }>;
};

export type DemoDispatchData = {
  incident: DemoDispatchPoint;
  routePoints: Array<{ x: number; y: number }>;
  routeOptions: DemoDispatchRoute[];
  recommendedRouteId: string;
  congestion: {
    routeId: string;
    x: number;
    y: number;
    label: string;
  };
  units: Array<{ id: string; name: string; x: number; y: number }>;
};

export const demoDispatchData: DemoDispatchData = {
  incident: { id: 'demo-incident', label: '报警处', x: 74, y: 54, status: 'incident' },
  routePoints: [
    { x: 34, y: 27 },
    { x: 39, y: 33 },
    { x: 48, y: 37 },
    { x: 58, y: 43 },
    { x: 66, y: 49 },
    { x: 74, y: 54 },
  ],
  routeOptions: [
    {
      id: 'demo-route-01',
      label: '系统推荐',
      status: 'recommended',
      points: [
        { x: 34, y: 27 },
        { x: 39, y: 33 },
        { x: 48, y: 37 },
        { x: 58, y: 43 },
        { x: 66, y: 49 },
        { x: 74, y: 54 },
      ],
    },
    {
      id: 'demo-route-02',
      label: '候选路线 02',
      status: 'congested',
      points: [
        { x: 34, y: 27 },
        { x: 28, y: 35 },
        { x: 31, y: 43 },
        { x: 44, y: 49 },
        { x: 58, y: 52 },
        { x: 74, y: 54 },
      ],
      congestionSegment: [
        { x: 28, y: 35 },
        { x: 31, y: 43 },
        { x: 44, y: 49 },
      ],
    },
    {
      id: 'demo-route-03',
      label: '候选路线 03',
      status: 'candidate',
      points: [
        { x: 34, y: 27 },
        { x: 46, y: 22 },
        { x: 61, y: 29 },
        { x: 69, y: 39 },
        { x: 74, y: 54 },
      ],
    },
  ],
  recommendedRouteId: 'demo-route-01',
  congestion: {
    routeId: 'demo-route-02',
    x: 34,
    y: 42,
    label: '前方拥堵',
  },
  units: [
    { id: 'demo-unit-01', name: '警力点 01', x: 34, y: 27 },
    { id: 'demo-unit-02', name: '警力点 02', x: 52, y: 70 },
    { id: 'demo-unit-03', name: '警力点 03', x: 82, y: 77 },
  ],
};
