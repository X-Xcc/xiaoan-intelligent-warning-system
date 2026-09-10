export type DemoStageId = 'A1'|'A2'|'A3'|'B1'|'B2'|'B3'|'B4'|'C1'|'C2'|'C3'|'C4'|'D1'|'D2'|'D3'|'D4';
export type DemoStage = { id: DemoStageId; label: string; route: 'duty-situation'|'duty-plan'|'command'|'case'|'community'; cue?: string | null };
export const DEMO_STAGES: DemoStage[] = [
  { id: 'A1', label: '勤务画像', route: 'duty-situation', cue: 'portrait-ready' },
  { id: 'A2', label: '训练清单', route: 'duty-plan' },
  { id: 'A3', label: '全体达标', route: 'duty-plan', cue: 'training-passed' },
  { id: 'B1', label: '新警情', route: 'command', cue: 'new-incident' },
  { id: 'B2', label: '路线派警', route: 'command', cue: 'route-pushed' },
  { id: 'B3', label: '盘查核验', route: 'command', cue: 'verification-done' },
  { id: 'B4', label: '物证同步', route: 'command' },
  { id: 'C1', label: '串并案研判', route: 'case', cue: 'linked-four' },
  { id: 'C2', label: '视频图侦', route: 'case' },
  { id: 'C3', label: 'GIS轨迹', route: 'case', cue: 'anomaly-stay' },
  { id: 'C4', label: '链条闭环', route: 'case', cue: 'chain-closed' },
  { id: 'D1', label: '目标追踪', route: 'community', cue: 'target-alone' },
  { id: 'D2', label: '指挥调度', route: 'community' },
  { id: 'D3', label: '室内方案', route: 'community', cue: '方案已推送' },
  { id: 'D4', label: '案件闭环', route: 'case' },
];
export type DemoState = { stage: DemoStageId; running: boolean; revision: number };
export function initialDemoState(): DemoState { return { stage: 'A1', running: false, revision: 0 }; }
export function nextDemoStage(stage: DemoStageId): DemoStageId {
  return DEMO_STAGES[Math.min(DEMO_STAGES.length - 1, DEMO_STAGES.findIndex((item) => item.id === stage) + 1)].id;
}
export function previousDemoStage(stage: DemoStageId): DemoStageId {
  return DEMO_STAGES[Math.max(0, DEMO_STAGES.findIndex((item) => item.id === stage) - 1)].id;
}
export function demoCueForStage(stage: DemoStageId): string | null { return DEMO_STAGES.find((item) => item.id === stage)?.cue ?? null; }
export function demoStage(stage: DemoStageId): DemoStage { return DEMO_STAGES.find((item) => item.id === stage) ?? DEMO_STAGES[0]; }
