import type { TrainingSnapshot } from './training-api';

// Only cues with an implemented, document-backed trigger belong in this registry.
export const DOCUMENT_VOICE_CUES = {
  'portrait-ready': '画像已生成',
  'training-passed': '全体科目达标',
} as const;
export type XiaoanCue = keyof typeof DOCUMENT_VOICE_CUES;

export function trainingPassKey(snapshot: TrainingSnapshot): string | null {
  const ids = ['TRAIN-READINESS-001', 'TRAIN-READINESS-002', 'TRAIN-READINESS-003'];
  const records: string[] = [];
  for (const id of ids) {
    const task = snapshot.tasks.find((item) => item.taskId === id);
    const assessment = snapshot.assessments.find((item) => item.taskId === id);
    const archive = snapshot.archives.find((item) => item.taskId === id);
    if (task?.status !== '已归档' || assessment?.reviewStatus !== 'confirmed'
      || archive?.result !== '合格' || !assessment.assessmentId || !archive.recordId) return null;
    records.push(`${assessment.assessmentId}:${archive.recordId}`);
  }
  return records.join('|');
}
