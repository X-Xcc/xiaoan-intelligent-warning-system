import type { ContactReviewRecord } from './contact-review';
import { zijingDemoStops } from './contact-zijing';

export type CaseMapCoordinate = readonly [x: number, y: number];
export type CaseMapRole = 'contact' | 'transit' | 'incident' | 'disposal';
export type CaseMapRouteBranch = {
  readonly id: string;
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

export const caseRouteBranches: readonly CaseMapRouteBranch[] = [
  { id: 'point-1-branch-left', points: [[440, 230], [390, 185], [335, 150]] },
  { id: 'point-1-branch-right', points: [[440, 230], [485, 170], [555, 135]] },
  { id: 'point-3-branch-right', points: [[640, 365], [700, 395], [770, 420]] },
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
  return pointCount < 3 ? [] : caseComparisonRoute;
}
