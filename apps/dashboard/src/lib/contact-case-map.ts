import type { ContactReviewRecord } from './contact-review';
import { zijingDemoStops } from './contact-zijing';

export type CaseMapCoordinate = readonly [x: number, y: number];
export type CaseMapRole = 'contact' | 'transit' | 'incident' | 'disposal';
export type CaseMapRouteBranch = {
  readonly id: string;
  readonly points: readonly CaseMapCoordinate[];
};
export type CaseMapRoute = {
  readonly id: string;
  readonly color: 'blue' | 'violet' | 'brown';
  readonly points: readonly CaseMapCoordinate[];
};

export const caseBasemap = {
  title: '夜市街区 · 案件路线',
  kind: 'fictional-street-map',
  width: 1200,
  height: 780,
  assetPath: '/contact-review-assets/night-market-case-basemap.webp',
} as const;

// Local drawing coordinates only. These are not a geographic camera survey.
const stopDefinitions = [
  { anchor: [440, 230], role: 'contact', label: '第一次接触地点', routeIndex: 0 },
  { anchor: [560, 250], role: 'transit', label: '途经点', routeIndex: 2 },
  { anchor: [640, 365], role: 'incident', label: '案发地点', routeIndex: 4 },
  { anchor: [720, 505], role: 'transit', label: '途经点', routeIndex: 7 },
  { anchor: [890, 595], role: 'disposal', label: '销赃点', routeIndex: 10 },
] as const satisfies readonly { anchor: CaseMapCoordinate; role: CaseMapRole; label: string; routeIndex: number }[];

export const caseStops = stopDefinitions.map((stop, index) => ({
  ...stop,
  scene: zijingDemoStops[index].scene,
}));

export const caseOutline: readonly CaseMapCoordinate[] = [
  [400, 192], [745, 131], [854, 492], [675, 547], [539, 406],
];

const caseRoute: readonly CaseMapCoordinate[] = [
  [440, 230], [525, 215], [560, 250], [550, 340], [640, 365], [680, 350],
  [695, 438], [720, 505], [795, 535], [830, 590], [890, 595],
];

export const routeOverlapPercent = 90;

export const caseRouteOverlapRate = 5;

export const caseComparisonRoute: readonly CaseMapCoordinate[] = [
  [585, 305], [640, 365], [675, 420], [760, 480], [835, 555],
];

export const caseRoutes: readonly CaseMapRoute[] = [
  { id: 'primary-route', color: 'blue', points: caseRoute },
  { id: 'comparison-route', color: 'violet', points: caseComparisonRoute },
];

export const caseRouteBranches: readonly CaseMapRouteBranch[] = [
  { id: 'point-1-branch-left', points: [[440, 230], [390, 185], [335, 150]] },
  { id: 'point-1-branch-right', points: [[440, 230], [485, 170], [555, 135]] },
  { id: 'point-3-branch-right', points: [[640, 365], [700, 395], [800, 435], [900, 470]] },
];

const cr019Branches: readonly CaseMapRouteBranch[] = [
  caseRouteBranches[0],
  caseRouteBranches[1],
  { id: 'point-4-branch-left', points: [[720, 505], [690, 535], [510, 565], [330, 595]] },
];

// CR-020 has its own comparison, independent of the legacy violet route.
const cr020ComparisonRoute: readonly CaseMapCoordinate[] = [
  [615, 165], [625, 260], [640, 365], [630, 440], [620, 530], [570, 565], [450, 590],
];

export function getCaseMapPoints(records: readonly ContactReviewRecord[]) {
  return records.slice(0, caseStops.length).map((record, index) => ({ record, ...caseStops[index] }));
}

export function getCaseMapRoute(pointCount: number): readonly CaseMapCoordinate[] {
  if (!Number.isFinite(pointCount) || pointCount < 1) return [];
  const lastStop = caseStops[Math.min(Math.floor(pointCount), caseStops.length) - 1];
  return caseRoute.slice(0, lastStop.routeIndex + 1);
}

export function getCaseComparisonRoute(pointCount: number): readonly CaseMapCoordinate[] {
  return !Number.isFinite(pointCount) || pointCount < 3 ? [] : cr020ComparisonRoute;
}

export function getCaseMapVariant(recordId: string, pointCount = caseStops.length) {
  const count = Number.isFinite(pointCount) ? Math.max(0, Math.floor(pointCount)) : 0;
  const isCr020 = recordId === 'CR-020';
  const isCr019 = recordId === 'CR-019';
  const branches = isCr020 ? [] : isCr019 ? cr019Branches : caseRouteBranches;
  const availableStops = caseStops.slice(0, count);
  const comparisonColor: CaseMapRoute['color'] = isCr020 ? 'brown' : 'violet';
  return {
    id: recordId,
    title: recordId ? `${recordId} · ${caseBasemap.title}` : caseBasemap.title,
    route: getCaseMapRoute(count),
    comparisonRoute: count < 3 || isCr019 ? [] : isCr020 ? getCaseComparisonRoute(count) : caseComparisonRoute,
    comparisonColor,
    overlapRate: isCr020 ? caseRouteOverlapRate : routeOverlapPercent,
    branches: branches.filter(branch => availableStops.some(stop =>
      stop.anchor[0] === branch.points[0][0] && stop.anchor[1] === branch.points[0][1])),
  };
}
