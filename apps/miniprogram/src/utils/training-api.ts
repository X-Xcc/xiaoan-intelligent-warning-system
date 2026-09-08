import { requestApi } from '@/utils/api'

export type TrainingTask = {
  taskId: string
  subject: string
  traineeId: string
  teamName: string
  equipment: string[]
  standard: { label: string; thresholdSeconds?: number; targetMeters?: number }
  basis: string[]
  status: string
  elapsedSeconds?: number | null
  startedAt?: string | null
  completedAt?: string | null
  exception?: { reason: string; auditId: string } | null
}

export type TrainingAssessment = {
  assessmentId: string
  taskId: string
  inputMode: string
  score: { standardization: number; completionTime: number; coordination: number; total: number }
  confidence: number
  evidence: string[]
  evidenceTime: string
  ruleVersion: string
  humanReviewRequired: boolean
  reviewStatus: string
  reviewerId?: string | null
  reviewComment?: string | null
  auditId: string
}

export type TrainingArchive = {
  recordId: string
  taskId: string
  traineeId: string
  teamName: string
  result: string
  weakPoints: string[]
  retrainingRecommendation: string
  auditId: string
  createdAt: string
}

export type TrainingReadiness = {
  dataMode: string
  updatedAt: string
  ruleVersion: string
  notice: string
}

export type TrainingWorkspace = {
  dataMode: string
  tasks: TrainingTask[]
  assessments: TrainingAssessment[]
  archives: TrainingArchive[]
  readiness: TrainingReadiness
}

const taskPath = (id: string, action: string) => `/training/tasks/${encodeURIComponent(id)}/${action}`
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const validTask = (task: TrainingTask): boolean => Boolean(task?.taskId && task.traineeId && task.status)
  && typeof task.subject === 'string' && typeof task.teamName === 'string'
  && typeof task.standard?.label === 'string' && strings(task.equipment) && strings(task.basis)
const validAssessment = (item: TrainingAssessment): boolean => Boolean(item?.assessmentId && item.taskId && item.auditId)
  && typeof item.inputMode === 'string' && typeof item.reviewStatus === 'string' && typeof item.ruleVersion === 'string'
  && typeof item.humanReviewRequired === 'boolean' && strings(item.evidence)
  && typeof item.confidence === 'number' && Number.isFinite(item.confidence)
  && [item.score?.total, item.score?.standardization, item.score?.completionTime, item.score?.coordination]
    .every((score) => typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100)

export async function getTrainingWorkspace(): Promise<TrainingWorkspace> {
  const [tasks, assessments, archives, readiness] = await Promise.all([
    requestApi<{ dataMode: string; items: TrainingTask[] }>('/training/tasks'),
    requestApi<{ items: TrainingAssessment[] }>('/training/assessments'),
    requestApi<{ items: TrainingArchive[] }>('/training/archives'),
    requestApi<TrainingReadiness>('/training/readiness'),
  ])
  if (!Array.isArray(tasks?.items) || !Array.isArray(assessments?.items) || !Array.isArray(archives?.items)
    || typeof tasks.dataMode !== 'string' || typeof readiness?.notice !== 'string' || typeof readiness.dataMode !== 'string'
    || tasks.items.some((task) => !validTask(task))
    || assessments.items.some((item) => !validAssessment(item))
    || archives.items.some((item) => !item?.recordId || !item.taskId || !item.traineeId || !Array.isArray(item.weakPoints))) {
    throw new Error('训练数据格式不完整，请检查服务版本。')
  }
  return { dataMode: tasks.dataMode, tasks: tasks.items, assessments: assessments.items, archives: archives.items, readiness }
}

async function mutateTask(id: string, action: string, data?: Record<string, string | number>): Promise<TrainingTask> {
  const result = await requestApi<{ task: TrainingTask }>(taskPath(id, action), { method: 'POST', data })
  if (!validTask(result?.task)) throw new Error('训练操作未返回有效回执，请刷新核对。')
  return result.task
}

export function startTrainingTask(id: string): Promise<TrainingTask> {
  return mutateTask(id, 'start')
}

export async function completeTrainingTask(id: string, elapsedSeconds: number): Promise<TrainingTask> {
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 1 || elapsedSeconds > 3600) {
    throw new Error('请填写 1 至 3600 的整数秒数。')
  }
  return mutateTask(id, 'complete', { elapsedSeconds })
}

export async function createTrainingAssessment(id: string): Promise<TrainingAssessment> {
  const result = await requestApi<{ assessment: TrainingAssessment }>(taskPath(id, 'assessment'), { method: 'POST' })
  if (!validAssessment(result?.assessment) || result.assessment.taskId !== id) throw new Error('考核操作未返回有效回执，请刷新核对。')
  return result.assessment
}

export function retryTrainingTask(id: string): Promise<TrainingTask> {
  return mutateTask(id, 'retry')
}

export function reportTrainingException(id: string, reason: string, reportedBy: string): Promise<TrainingTask> {
  return mutateTask(id, 'exception', { reason: reason.trim(), reportedBy })
}
