import type { TrainingTask } from './training-api';

export type GroupTrainingPhase = 'prepare' | 'run' | 'summary';
export type GroupTrainingParticipant = { officerId: string; label: string };
export type GroupTrainingParticipantTask = { officerId: string; taskId: string | null; completed: boolean };
export type GroupTrainingSubject = {
  subject: string;
  taskIds: string[];
  recommendationId: string;
  participantTasks?: GroupTrainingParticipantTask[];
};
export type GroupTrainingSummary = {
  officerId: string;
  label: string;
  total: number;
  strengths: string[];
  weaknesses: string[];
};

export const GROUP_PARTICIPANTS = [
  { officerId: 'DEMO-OFFICER-017', label: '演示人员 017' },
  { officerId: 'DEMO-OFFICER-018', label: '演示人员 018' },
  { officerId: 'DEMO-OFFICER-019', label: '演示人员 019' },
] as const;

export const GROUP_SUBJECT_NAMES = ['单警装备快速取用', '弱光执法场景战术协同', '防爆先期处置'] as const;

const GROUP_SUBJECT_ALIASES: Record<string, (typeof GROUP_SUBJECT_NAMES)[number]> = {
  '单警装备快速取用': '单警装备快速取用',
  '弱光执法场景战术协同': '弱光执法场景战术协同',
  '弱光队形转换': '弱光执法场景战术协同',
  '防爆先期处置': '防爆先期处置',
  '防爆警戒圈设置': '防爆先期处置',
  '现场警戒与人员疏散': '防爆先期处置',
};

const COMPLETED_STATUSES = new Set(['已完成', '待复核', '待复训', '已归档']);

type SummaryDetails = {
  strengths: string[];
  weaknesses: string[];
};

const SUMMARY_DETAILS = [
  {
    strengths: ['装备取用动作连贯', '队形配合响应及时'],
    weaknesses: ['弱光环境下搜索节奏仍可加强'],
  },
  {
    strengths: ['弱光协同动作稳定', '信息传递清晰'],
    weaknesses: ['防爆先期警戒衔接需要加强'],
  },
  {
    strengths: ['现场警戒意识较好', '处置步骤完成完整'],
    weaknesses: ['装备检查连续性需要保持'],
  },
] satisfies SummaryDetails[];

const SUMMARY_BASE_TOTALS = [92, 87, 82] as const;

function canonicalSubject(value: unknown): (typeof GROUP_SUBJECT_NAMES)[number] | undefined {
  return typeof value === 'string' ? GROUP_SUBJECT_ALIASES[value.trim()] : undefined;
}

function isCompletedTask(task: TrainingTask): boolean {
  return typeof task.status === 'string' && COMPLETED_STATUSES.has(task.status.trim());
}

type TaskRevision = { retry: boolean; serial: number };

function taskRevision(taskId: string): TaskRevision {
  const match = /(?:^|-)((?:RETEST|RETRY|NEW))-([^-]+)$/i.exec(taskId);
  if (!match) return { retry: false, serial: 0 };
  const serial = /^\d+$/.test(match[2]) ? Number(match[2]) : -1;
  return { retry: true, serial };
}

function compareTaskPriority(left: TrainingTask, right: TrainingTask): number {
  const leftRevision = taskRevision(left.taskId);
  const rightRevision = taskRevision(right.taskId);
  const retryDifference = Number(rightRevision.retry) - Number(leftRevision.retry);
  if (retryDifference !== 0) return retryDifference;
  const serialDifference = rightRevision.serial - leftRevision.serial;
  if (serialDifference !== 0) return serialDifference;
  return 0;
}

function isValidTaskId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildGroupSubjects(tasks: TrainingTask[]): GroupTrainingSubject[] {
  const sourceTasks = Array.isArray(tasks) ? tasks : [];
  return GROUP_SUBJECT_NAMES.map((subject, subjectIndex) => {
    const participantTasks = GROUP_PARTICIPANTS.map(({ officerId }) => {
      const candidate = sourceTasks
        .filter(task => task && typeof task === 'object'
          && isValidTaskId(task.taskId)
          && typeof task.traineeId === 'string'
          && task.traineeId === officerId
          && canonicalSubject(task.subject) === subject)
        .sort(compareTaskPriority)[0];
      return {
        officerId,
        taskId: candidate?.taskId ?? null,
        completed: candidate ? isCompletedTask(candidate) : false,
      };
    });
    return {
      subject,
      taskIds: participantTasks.flatMap(({ taskId }) => taskId ? [taskId] : []),
      recommendationId: `DEMO-RECOMMENDATION-${String(subjectIndex + 1).padStart(2, '0')}`,
      participantTasks,
    };
  });
}

export function buildGroupSummaries(
  subjects: GroupTrainingSubject[],
  completedSubjectIndexes: number[],
): GroupTrainingSummary[] {
  const sourceSubjects = Array.isArray(subjects) ? subjects : [];
  const completedIndexes = new Set(
    (Array.isArray(completedSubjectIndexes) ? completedSubjectIndexes : [])
      .filter(index => Number.isInteger(index)
        && index >= 0
        && index < GROUP_SUBJECT_NAMES.length
        && new Set((sourceSubjects[index]?.taskIds ?? []).filter(isValidTaskId)).size === GROUP_PARTICIPANTS.length),
  );

  return GROUP_PARTICIPANTS.map(({ officerId, label }, participantIndex) => {
    const states = GROUP_SUBJECT_NAMES.map((_, subjectIndex) => {
      const participantTask = sourceSubjects[subjectIndex]?.participantTasks
        ?.find(item => item.officerId === officerId);
      return {
        available: isValidTaskId(participantTask?.taskId),
        completed: isValidTaskId(participantTask?.taskId)
          && participantTask?.completed === true
          && completedIndexes.has(subjectIndex),
      };
    });
    const availableCount = states.filter(state => state.available).length;
    const completedCount = states.filter(state => state.completed).length;
    const missingPenalty = (GROUP_SUBJECT_NAMES.length - availableCount) * 4;
    const unfinishedPenalty = (availableCount - completedCount) * 2;
    const total = SUMMARY_BASE_TOTALS[participantIndex]
      + Math.min(completedCount, 2)
      - missingPenalty
      - unfinishedPenalty;
    const strengths = [...SUMMARY_DETAILS[participantIndex].strengths];
    if (completedCount === 0) strengths.splice(0, strengths.length, '暂无完整优势结论');
    else if (completedCount < GROUP_SUBJECT_NAMES.length) strengths.push('已完成部分科目训练');
    const weaknesses = [...SUMMARY_DETAILS[participantIndex].weaknesses];
    if (availableCount === 0) weaknesses.push('尚未形成完整三科目训练记录');
    else if (availableCount < GROUP_SUBJECT_NAMES.length) weaknesses.push('仍有科目任务待补齐');
    else if (completedCount < availableCount) weaknesses.push('部分训练任务尚未完成');
    return {
      officerId,
      label,
      total: Math.max(0, Math.min(100, total)),
      strengths,
      weaknesses,
    };
  });
}
