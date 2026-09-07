import type { EventStatus, GeoPoint, SafetyEvent } from '@/types/events'
import type { TrainingTask } from '@/utils/training-api'

export type StaffTaskFilter = 'all' | 'pending' | 'active' | 'completed'

const nextStatuses: Partial<Record<EventStatus, EventStatus>> = {
  已提交: '已接收', 已派单: '已接收', 已接收: '已到达', 已到达: '处理中', 处理中: '已完成',
}

export function nextTaskStatus(status: string): EventStatus | undefined {
  return nextStatuses[status as EventStatus]
}

export function isAssignedTask(task: SafetyEvent, staffName: string): boolean {
  if (!staffName.trim()) return false
  if (task.meta?.command && task.status === '已提交') return false
  if (task.owner?.trim()) return task.owner === staffName
  return task.status !== '已提交' && task.meta?.assignment?.staffName === staffName
}

export function assignedTasks(tasks: SafetyEvent[], staffName: string): SafetyEvent[] {
  const seen = new Set<string>()
  return tasks.filter((task) => {
    if (!isAssignedTask(task, staffName) || seen.has(task.id)) return false
    seen.add(task.id)
    return true
  })
}

export function taskTransitionError(task: SafetyEvent, staffName: string, next: EventStatus, result?: string): string {
  if (!isAssignedTask(task, staffName)) return '此任务不属于当前工作人员，请刷新任务。'
  if (nextTaskStatus(task.status) !== next) return '任务状态已变化，请刷新后按顺序处理。'
  if (next === '已完成' && !result?.trim()) return '请填写本次现场处置结果。'
  if (next === '已完成' && task.meta?.command && task.meta.command.handover?.status !== 'accepted') {
    return '研判移交尚未接收，现场任务不能完成。'
  }
  return ''
}

export function filterStaffTasks(tasks: SafetyEvent[], filter: StaffTaskFilter, query = ''): SafetyEvent[] {
  const search = query.trim().toLowerCase()
  return tasks.filter((task) => {
    const matches = filter === 'all'
      || (filter === 'pending' && ['已提交', '已派单'].includes(task.status))
      || (filter === 'active' && ['已接收', '已到达', '处理中'].includes(task.status))
      || (filter === 'completed' && task.status === '已完成')
    return matches && `${task.title} ${task.id} ${task.bay} ${task.description ?? ''}`.toLowerCase().includes(search)
  })
}

export function staffTaskCounts(tasks: SafetyEvent[]) {
  return {
    pending: filterStaffTasks(tasks, 'pending').length,
    active: filterStaffTasks(tasks, 'active').length,
    completed: filterStaffTasks(tasks, 'completed').length,
  }
}

export function navigationDestination(task: SafetyEvent): GeoPoint | undefined {
  const meta = task.meta
  if (meta?.command?.sourceMode === 'desensitized_demo') return undefined
  if (meta?.locationSource === 'manual') return undefined
  const valid = (point?: Partial<GeoPoint>): point is GeoPoint =>
    typeof point?.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
    && !/fallback|default|manual|sample|mock/i.test(point.source ?? '')
  // Route destinations can be legacy area defaults, not measured incident locations.
  const candidates = [meta?.alarmLocation, meta?.reporterLocation, meta?.context?.location]
  const measured = candidates.find(valid)
  if (measured) return measured
  const raw = { latitude: meta?.latitude, longitude: meta?.longitude }
  if (!candidates.some((point) => point && /fallback|default|manual|sample|mock/i.test(point.source ?? '')) && valid(raw)) return raw
  const destination = meta?.route?.destination
  return destination?.source && valid(destination) ? destination : undefined
}

export function trainingProfiles(tasks: TrainingTask[]): string[] {
  return [...new Set(tasks.map((task) => task.traineeId).filter((id) => Boolean(id.trim())))].sort()
}

export function resolveTrainingSubject(tasks: TrainingTask[], staffName: string, development: boolean, selected = ''): string {
  if (!staffName.trim()) return ''
  const profiles = trainingProfiles(tasks)
  if (profiles.includes(staffName)) return staffName
  return development && profiles.includes(selected) ? selected : ''
}

export function selectTrainingTask(tasks: TrainingTask[], subject: string, selectedId = ''): TrainingTask | undefined {
  if (!subject) return undefined
  const priority: Record<string, number> = { 训练中: 0, 待训练: 1, 待复核: 2, 待复训: 3, 已归档: 4 }
  const own = tasks.filter((task) => task.traineeId === subject)
  return own.find((task) => task.taskId === selectedId)
    ?? own.sort((a, b) => (priority[a.status] ?? 5) - (priority[b.status] ?? 5))[0]
}

export function trainingElapsedSeconds(task: Pick<TrainingTask, 'startedAt' | 'elapsedSeconds'>, now = Date.now()): number | undefined {
  if (typeof task.elapsedSeconds === 'number' && Number.isFinite(task.elapsedSeconds) && task.elapsedSeconds >= 0) return task.elapsedSeconds
  const started = task.startedAt ? Date.parse(task.startedAt) : NaN
  return Number.isFinite(started) && started <= now ? Math.floor((now - started) / 1000) : undefined
}

export function parseTrainingElapsed(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined
  const seconds = Number(value)
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : undefined
}

export function staffError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'errMsg' in error && typeof error.errMsg === 'string') return error.errMsg
  return '服务暂不可用，请重试。'
}

export function staffDate(value?: string | null): string {
  if (!value) return '尚未记录'
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : value
}
