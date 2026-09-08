import { routePath } from './presentation';

type TrainingSelection = { taskId: string; officerId: string };
export type SituationPhase = 'idle' | 'lead' | 'donut' | 'hotspot' | 'ticker';
export type SituationView = {
  selectedId: string;
  scrollY: number;
  phase: SituationPhase;
  remainingMs: number;
  paused: boolean;
  sound: boolean;
  panels: number[];
};
const selectionKey = 'a1-training-selection-v1';
const situationKey = 'a1-situation-view-v1';
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
const scrollPosition = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

function read(key: string): Record<string, unknown> {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function write(key: string, value: unknown) {
  try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Navigation remains usable without storage. */ }
}

export function rememberTrainingSelection(selection: TrainingSelection) {
  write(selectionKey, selection);
}

export function readTrainingSelection(search = ''): TrainingSelection {
  const params = new URLSearchParams(search);
  const value = params.has('task') || params.has('officer')
    ? { taskId: params.get('task'), officerId: params.get('officer') } : read(selectionKey);
  return {
    taskId: identifier(value.taskId) ? value.taskId : '',
    officerId: identifier(value.officerId) ? value.officerId : '',
  };
}

export function trainingEntryPath(taskId?: string): string {
  const params = new URLSearchParams();
  if (taskId) params.set('task', taskId);
  else {
    const saved = readTrainingSelection();
    if (identifier(saved.taskId)) params.set('task', saved.taskId);
    if (identifier(saved.officerId)) params.set('officer', saved.officerId);
  }
  return `${routePath('duty-plan')}${params.size ? `?${params}` : ''}`;
}

export function rememberSituationView(view: SituationView) {
  write(situationKey, view);
}

export function readSituationView(): SituationView {
  const saved = read(situationKey);
  const phase = ['idle', 'lead', 'donut', 'hotspot', 'ticker'].includes(String(saved.phase))
    ? saved.phase as SituationPhase : saved.generated === true ? 'ticker' : 'idle';
  return {
    selectedId: identifier(saved.selectedId) ? saved.selectedId : 'B',
    scrollY: scrollPosition(saved.scrollY),
    phase,
    remainingMs: typeof saved.remainingMs === 'number' && Number.isFinite(saved.remainingMs)
      ? Math.min(phase === 'lead' ? 500 : 1000, Math.max(0, saved.remainingMs)) : phase === 'lead' ? 500 : 1000,
    paused: saved.paused === true,
    sound: saved.sound === true,
    panels: Array.isArray(saved.panels) ? saved.panels.slice(0, 3).map(scrollPosition) : [],
  };
}
