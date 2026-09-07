import { useState } from 'react';

type TrainingDraft = {
  checks: string[];
  manualTime: boolean;
  elapsedInput: string;
  reviewer: string;
  reason: string;
  exceptionReason: string;
};
const emptyDraft: TrainingDraft = { checks: [], manualTime: false, elapsedInput: '', reviewer: '', reason: '', exceptionReason: '' };
const storageKey = 'officer-training-drafts-v1';

function readDrafts(): Record<string, TrainingDraft> {
  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).slice(-50).flatMap(([id, entry]) => {
      if (!entry || typeof entry !== 'object') return [];
      const value = entry as Partial<TrainingDraft>;
      return [[id, {
        checks: Array.isArray(value.checks) ? value.checks.filter((item) => typeof item === 'string') : [],
        manualTime: value.manualTime === true,
        elapsedInput: typeof value.elapsedInput === 'string' ? value.elapsedInput : '',
        reviewer: typeof value.reviewer === 'string' ? value.reviewer.slice(0, 80) : '',
        reason: typeof value.reason === 'string' ? value.reason.slice(0, 500) : '',
        exceptionReason: typeof value.exceptionReason === 'string' ? value.exceptionReason.slice(0, 500) : '',
      }]];
    }));
  } catch { return {}; }
}

export function useTrainingDraft(taskId?: string) {
  const [drafts, setDrafts] = useState(readDrafts);
  const update = (patch: Partial<TrainingDraft>) => {
    if (!taskId) return;
    setDrafts((current) => {
      const next = Object.fromEntries(Object.entries({
        ...current, [taskId]: { ...emptyDraft, ...current[taskId], ...patch },
      }).slice(-50));
      try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Private contexts may disallow storage. */ }
      return next;
    });
  };
  return [taskId ? drafts[taskId] ?? emptyDraft : emptyDraft, update] as const;
}
