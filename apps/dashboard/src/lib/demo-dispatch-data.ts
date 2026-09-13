export type DemoDispatchPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  status: 'incident' | 'available';
};

export type DemoDispatchData = {
  incident: DemoDispatchPoint;
  routePoints: Array<{ x: number; y: number }>;
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
  units: [
    { id: 'demo-unit-01', name: '警力点 01', x: 34, y: 27 },
    { id: 'demo-unit-02', name: '警力点 02', x: 52, y: 70 },
    { id: 'demo-unit-03', name: '警力点 03', x: 82, y: 77 },
  ],
};
