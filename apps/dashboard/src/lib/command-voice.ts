import type { CommandResponse, CommandStage } from './command-workflow';

export const voiceTexts = {
  'new-incident': '小安提醒您，有新的警情。',
  'dispatch-sent': '派警指令已下达。',
  'task-accepted': '任务已签收。',
  'field-arrived': '处警人员已到场。',
  'verification-ready': '核验线索已返回，请人工复核。',
  'evidence-registered': '现场材料已登记。',
  'handover-submitted': '研判移交已提交。',
  'handover-accepted': '研判移交已接收。',
  'field-completed': '现场处置已完成。',
} as const;
export type VoiceCue = keyof typeof voiceTexts;
export function stageVoice(stage: CommandStage): VoiceCue | null {
  return ({ b1: 'new-incident', b2: 'dispatch-sent', b3: 'verification-ready',
    b4: null, handover: 'handover-submitted' } as const)[stage];
}
export function voiceChanges(previous: CommandResponse | null, next: CommandResponse): VoiceCue[] {
  if (!previous || previous.event.id !== next.event.id || previous.command.version >= next.command.version) return [];
  const before = previous.command, after = next.command;
  const cues: VoiceCue[] = [];
  if (!before.dispatch?.dispatchedAt && after.dispatch?.dispatchedAt) cues.push('dispatch-sent');
  if (previous.event.status !== next.event.status) {
    if (next.event.status === '已接收') cues.push('task-accepted');
    if (next.event.status === '已到达') cues.push('field-arrived');
    if (next.event.status === '已完成') cues.push('field-completed');
  }
  if (after.verification?.verificationId && before.verification?.verificationId !== after.verification.verificationId)
    cues.push('verification-ready');
  if (after.evidenceIndex.some((item) => !before.evidenceIndex.some((old) => old.evidenceId === item.evidenceId)))
    cues.push('evidence-registered');
  const handover = after.handover;
  if (handover && (before.handover?.handoverId !== handover.handoverId
      || before.handover?.version !== handover.version || before.handover?.status !== handover.status)) {
    if (handover.status === 'submitted') cues.push('handover-submitted');
    if (handover.status === 'accepted') cues.push('handover-accepted');
  }
  return cues;
}
