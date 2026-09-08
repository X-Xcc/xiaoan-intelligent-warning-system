import type { TrainingSnapshot } from './training-api';

// Only cues with an implemented, document-backed trigger belong in this registry.
export const DOCUMENT_VOICE_CUES = {
  'portrait-ready': '画像已生成',
  'training-passed': '全体科目达标',
  'new-incident': '新警情',
  'route-pushed': '路线已推送',
  'verification-done': '核验完成',
  'linked-four': '已串并4起',
  'anomaly-stay': '异常停留，疑似藏匿',
  'chain-closed': '链条闭环',
  'target-alone': '目标落单，建议盾棍',
  '方案已推送': '方案已推送',
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
