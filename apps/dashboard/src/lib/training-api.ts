export type TrainingTask = {
  taskId: string;
  subject: string;
  traineeId: string;
  teamName: string;
  equipment: string[];
  standard: { label: string; thresholdSeconds?: number; targetMeters?: number };
  basis: string[];
  status: string;
  elapsedSeconds?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  exception?: { reason: string; auditId: string } | null;
};

export type TrainingAssessment = {
  assessmentId: string;
  taskId: string;
  inputMode: string;
  score: { standardization: number; completionTime: number; coordination: number; total: number };
  confidence: number;
  evidence: string[];
  evidenceTime: string;
  ruleVersion: string;
  humanReviewRequired: boolean;
  reviewStatus: string;
  reviewerId?: string | null;
  reviewComment?: string | null;
  auditId: string;
};

export type TrainingArchive = {
  recordId: string;
  taskId: string;
  traineeId: string;
  teamName: string;
  result: string;
  weakPoints: string[];
  retrainingRecommendation: string;
  auditId: string;
  createdAt: string;
};

export type DutySituation = {
  title: string;
  location: string;
  period: string;
  composition: Array<{ label: string; value: number; color: string }>;
  timeTrend: Array<{ time: string; value: number }>;
  zones: Array<{ id: string; name: string; level: string; share: number; x: number; y: number; description: string }>;
  recommendations: Array<{ taskId: string; subject: string; basis: string; standard: string }>;
};

export type TrainingReadiness = {
  dataMode: string;
  updatedAt: string;
  ruleVersion: string;
  notice: string;
  dutySituation?: DutySituation;
};

export type TrainingSnapshot = {
  dataMode: string;
  tasks: TrainingTask[];
  assessments: TrainingAssessment[];
  archives: TrainingArchive[];
};
export type TrainingStage = 'prepare' | 'run' | 'assessment' | 'archive';

const base = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');

export async function trainingRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 15000);
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${base}${path}`, {
      ...options,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof payload.detail === 'string' ? payload.detail : `训练请求失败（${response.status}）`;
      throw new Error(detail);
    }
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) throw new Error('训练服务响应超时，请重试');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export async function getTrainingReadiness(signal?: AbortSignal): Promise<TrainingReadiness> {
  return trainingRequest('/training/readiness', { signal });
}

export async function getTrainingTasks(signal?: AbortSignal): Promise<{ dataMode: string; items: TrainingTask[] }> {
  const result = await trainingRequest<{ dataMode: string; items: TrainingTask[] }>('/training/tasks', { signal });
  if (!Array.isArray(result.items)) throw new Error('训练任务数据格式不完整，请检查服务版本');
  return result;
}

export async function getTrainingSnapshot(signal?: AbortSignal): Promise<TrainingSnapshot> {
  const [tasks, assessments, archives] = await Promise.all([
    getTrainingTasks(signal),
    trainingRequest<{ items: TrainingAssessment[] }>('/training/assessments', { signal }),
    trainingRequest<{ items: TrainingArchive[] }>('/training/archives', { signal }),
  ]);
  if (!Array.isArray(tasks.items) || !Array.isArray(assessments.items) || !Array.isArray(archives.items)) {
    throw new Error('训练数据格式不完整，请检查服务版本');
  }
  return { dataMode: tasks.dataMode, tasks: tasks.items, assessments: assessments.items, archives: archives.items };
}

export function officerTasks<T extends { traineeId: string; status: string }>(tasks: T[], officerId: string): T[] {
  const priority: Record<string, number> = { '训练中': 0, '待训练': 1, '待复核': 2, '待复训': 3, '已归档': 4 };
  return tasks.filter((task) => task.traineeId === officerId)
    .sort((a, b) => (priority[a.status] ?? 5) - (priority[b.status] ?? 5));
}

export function selectOfficerTask<T extends { taskId: string; traineeId: string; status: string }>(
  tasks: T[], officerId: string, taskId?: string,
): T | undefined {
  const ownTasks = officerTasks(tasks, officerId);
  return ownTasks.find((task) => task.taskId === taskId) ?? ownTasks[0];
}

export function taskStage(status: string): TrainingStage {
  if (status === '训练中') return 'run';
  if (status === '待复核' || status === '待复训') return 'assessment';
  if (status === '已归档') return 'archive';
  return 'prepare';
}

export function taskElapsedSeconds(task: Pick<TrainingTask, 'startedAt' | 'elapsedSeconds'>, now = Date.now()): number {
  if (typeof task.elapsedSeconds === 'number') return Math.max(0, Math.min(3600, task.elapsedSeconds));
  const started = task.startedAt ? Date.parse(task.startedAt) : NaN;
  return Number.isFinite(started) ? Math.max(0, Math.min(3600, Math.floor((now - started) / 1000))) : 0;
}
