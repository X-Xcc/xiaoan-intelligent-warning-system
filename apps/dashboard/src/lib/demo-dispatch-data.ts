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
    { x: 36, y: 29 },
    { x: 40, y: 31 },
    { x: 44, y: 34 },
    { x: 48, y: 36 },
    { x: 52, y: 39 },
    { x: 56, y: 42 },
    { x: 60, y: 45 },
    { x: 64, y: 47 },
    { x: 68, y: 50 },
    { x: 74, y: 54 },
  ],
  routeOptions: [
    {
      id: 'demo-route-01',
      label: '系统推荐',
      status: 'recommended',
      points: [
        { x: 34, y: 27 },
        { x: 36, y: 29 },
        { x: 40, y: 31 },
        { x: 44, y: 34 },
        { x: 48, y: 36 },
        { x: 52, y: 39 },
        { x: 56, y: 42 },
        { x: 60, y: 45 },
        { x: 64, y: 47 },
        { x: 68, y: 50 },
        { x: 74, y: 54 },
      ],
    },
    {
      id: 'demo-route-02',
      label: '候选路线 02',
      status: 'congested',
      points: [
        { x: 34, y: 27 },
        { x: 31, y: 29 },
        { x: 29, y: 33 },
        { x: 27, y: 37 },
        { x: 28, y: 41 },
        { x: 32, y: 44 },
        { x: 38, y: 47 },
        { x: 45, y: 49 },
        { x: 52, y: 51 },
        { x: 61, y: 53 },
        { x: 74, y: 54 },
      ],
      congestionSegment: [
        { x: 27, y: 37 },
        { x: 28, y: 41 },
        { x: 32, y: 44 },
      ],
    },
    {
      id: 'demo-route-03',
      label: '候选路线 03',
      status: 'candidate',
      points: [
        { x: 34, y: 27 },
        { x: 40, y: 24 },
        { x: 46, y: 22 },
        { x: 52, y: 23 },
        { x: 58, y: 27 },
        { x: 63, y: 32 },
        { x: 66, y: 37 },
        { x: 70, y: 45 },
        { x: 72, y: 50 },
        { x: 74, y: 54 },
      ],
    },
  ],
  recommendedRouteId: 'demo-route-01',
  congestion: {
    routeId: 'demo-route-02',
    x: 30,
    y: 40,
    label: '前方拥堵',
  },
  units: [
    { id: 'demo-unit-01', name: '警力点 01', x: 34, y: 27 },
    { id: 'demo-unit-02', name: '警力点 02', x: 52, y: 70 },
    { id: 'demo-unit-03', name: '警力点 03', x: 82, y: 77 },
  ],
};
