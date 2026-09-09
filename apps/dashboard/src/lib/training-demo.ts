import type { TrainingArchive, TrainingAssessment, TrainingSnapshot, TrainingSubject, TrainingTask } from './training-api';

const officerIds = ['DEMO-OFFICER-017', 'DEMO-OFFICER-018', 'DEMO-OFFICER-019'];
const catalog: TrainingSubject[] = [
  ['单警装备快速取用', '装备应用', '训练装备包', 45],
  ['弱光队形转换', '协同训练', '反光标识', 90],
  ['现场警戒与人员疏散', '现场处置', '模拟警戒带', 120],
  ['对讲机通联与信息报告', '装备应用', '模拟对讲机', 60],
  ['执法记录仪佩戴检查', '装备应用', '模拟记录仪', 45],
  ['现场沟通与矛盾调解', '沟通规范', '情景练习卡', 180],
  ['训练场地安全检查', '安全防护', '检查清单', 90],
  ['应急协作与交接', '协同训练', '模拟交接单', 120],
  ['基础体能与热身', '体能基础', '训练垫', 180],
  ['接报信息记录', '信息记录', '虚拟接报单', 120],
  ['法律知识情景问答', '知识学习', '虚拟题卡', 180],
  ['训练复盘与改进', '知识学习', '复盘清单', 120],
].map(([subject, category, equipment, seconds], index) => ({
  subjectId: `DEMO-SUBJECT-${String(index + 1).padStart(2, '0')}`,
  subject: String(subject), category: String(category), equipment: [String(equipment)],
  standard: { label: `虚拟考核标准：${seconds} 秒内完成，模拟总分 80 分达标`, thresholdSeconds: Number(seconds) },
  basis: ['虚拟勤务画像', '合成训练计划'],
}));

export function demoTrainingSelection(selection: { taskId: string; officerId: string }) {
  const readiness = /^TRAIN-READINESS-00([1-3])$/.exec(selection.taskId);
  const taskOfficer = /^TRAIN-DEMO-(01[789])-/.exec(selection.taskId)?.[1];
  const requestedOfficer = selection.officerId.replace(/^DEMO-/, '');
  const officerId = readiness ? officerIds[Number(readiness[1]) - 1]
    : taskOfficer ? `DEMO-OFFICER-${taskOfficer}`
    : officerIds.includes(`DEMO-${requestedOfficer}`) ? `DEMO-${requestedOfficer}` : officerIds[1];
  return {
    officerId,
    taskId: /^TRAIN-DEMO-01[789]-[\w-]+$/.test(selection.taskId) ? selection.taskId
      : `TRAIN-DEMO-${officerId.slice(-3)}-0${readiness?.[1] ?? '1'}`,
  };
}

function assessmentFor(task: TrainingTask, index: number, time: string): TrainingAssessment {
  const rejected = task.status === '待复训';
  const score = rejected ? 73 : 88 + index % 7;
  return {
    assessmentId: `DEMO-ASSESS-${task.taskId}`, taskId: task.taskId, inputMode: 'synthetic_demo',
    score: { standardization: score + 2, completionTime: score - 2, coordination: score, total: score },
    confidence: 1, evidence: ['合成动作记录', '虚拟训练计时', '演示评分，不代表实际能力'],
    evidenceTime: time, ruleVersion: 'DEMO-RULE-2026.09', humanReviewRequired: true,
    reviewStatus: task.status === '已归档' ? 'confirmed' : rejected ? 'rejected' : 'pending',
    reviewerId: ['已归档', '待复训'].includes(task.status) ? 'DEMO-INSTRUCTOR-01' : null,
    reviewComment: rejected ? '虚拟复核：信息复诵环节需补练，安排一次模拟复训。'
      : task.status === '已归档' ? '虚拟复核：流程完整、记录清晰，本次演示考核通过。' : null,
    auditId: `DEMO-AUDIT-${task.taskId}`,
  };
}

function archiveFor(task: TrainingTask, assessment: TrainingAssessment, time: string): TrainingArchive {
  return {
    recordId: `DEMO-ARCHIVE-${task.taskId}`, taskId: task.taskId, traineeId: task.traineeId, teamName: task.teamName,
    result: (assessment.score.total ?? 0) >= 80 ? '合格' : '待加强',
    weakPoints: ['信息复诵完整性', '装备检查连续性'],
    retrainingRecommendation: '虚拟计划：下一训练周期安排 2 组通联复诵与装备检查，完成后进行模拟复核。',
    auditId: assessment.auditId, createdAt: time,
  };
}

function seedSnapshot(): TrainingSnapshot {
  const now = Date.now();
  const tasks: TrainingTask[] = [];
  const assessments: TrainingAssessment[] = [];
  const archives: TrainingArchive[] = [];
  const statuses = ['待训练', '待训练', '训练中', '待复核', '待复核', '待复训', '已归档', '已归档'];
  for (const officer of officerIds) {
    statuses.forEach((status, index) => {
      const subject = catalog[index];
      const completed = ['待复核', '待复训', '已归档'].includes(status);
      const time = new Date(now - (index + 1) * 86400000).toISOString();
      const task: TrainingTask = {
        taskId: `TRAIN-DEMO-${officer.slice(-3)}-${String(index + 1).padStart(2, '0')}`,
        subject: subject.subject, traineeId: officer, teamName: `虚拟训练${officer.slice(-1)}组`,
        equipment: [...subject.equipment], standard: { ...subject.standard }, basis: [...subject.basis], status,
        startedAt: status === '待训练' ? null : status === '训练中' ? new Date(now - 42000).toISOString()
          : new Date(Date.parse(time) - (32 + index * 5) * 1000).toISOString(),
        completedAt: completed ? time : null, elapsedSeconds: completed ? 32 + index * 5 : null,
        exception: status === '待复训' ? { reason: '虚拟通联设备音量偏低，已登记检查。', auditId: `DEMO-EXCEPTION-${officer}` } : null,
      };
      tasks.push(task);
      if (completed) {
        const assessment = assessmentFor(task, index, time);
        assessments.push(assessment);
        if (status === '已归档') archives.push(archiveFor(task, assessment, time));
      }
    });
  }
  return { dataMode: 'synthetic_demo', tasks, assessments, archives };
}

type DemoAction = { path: string; body: Record<string, unknown>; time: string };
type DemoStorage = Pick<Storage, 'getItem' | 'setItem'>;
const storageKey = 'officer-training-synthetic-actions-v1';

// This store deliberately has no network fallback; every mutation is confined to synthetic records.
export function createTrainingDemo(storage?: DemoStorage, latencyMs = 0) {
  const waitForResponse = async (signal?: AbortSignal | null) => {
    signal?.throwIfAborted();
    if (latencyMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', abort);
          resolve();
        }, latencyMs);
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
    signal?.throwIfAborted();
  };
  let state = seedSnapshot();
  let sequence = 0;
  let actions: DemoAction[] = [];
  const persist = () => {
    try { storage?.setItem(storageKey, JSON.stringify(actions)); } catch { /* The in-memory demo still works without storage. */ }
  };
  const taskById = (id: string) => {
    const task = state.tasks.find((item) => item.taskId === id);
    if (!task) throw new Error('未找到虚拟训练任务');
    return task;
  };
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const newTask = (subject: Pick<TrainingTask, 'subject' | 'equipment' | 'standard' | 'basis'>, traineeId: string): TrainingTask => ({
    ...structuredClone(subject), taskId: `TRAIN-DEMO-${traineeId.slice(-3)}-NEW-${++sequence}`,
    traineeId, teamName: `虚拟训练${traineeId.slice(-1)}组`, status: '待训练',
    elapsedSeconds: null, startedAt: null, completedAt: null, exception: null,
  });
  const mutate = ({ path, body, time }: DemoAction): unknown => {
    if (path === '/training/tasks') {
      if (!officerIds.includes(String(body.traineeId))) throw new Error('请选择虚拟训练对象');
      const ids = Array.isArray(body.subjectIds) ? [...new Set(body.subjectIds)] : [];
      const subjects = ids.map((id) => catalog.find((item) => item.subjectId === id));
      if (!subjects.length || subjects.some((item) => !item)) throw new Error('请选择有效虚拟科目');
      const items = subjects.map((subject) => newTask(subject!, String(body.traineeId)));
      state.tasks.push(...items);
      return { items };
    }
    const reviewMatch = /^\/training\/assessments\/([^/]+)\/review$/.exec(path);
    if (reviewMatch) {
      const assessment = state.assessments.find((item) => item.assessmentId === decodeURIComponent(reviewMatch[1]));
      if (!assessment || assessment.reviewStatus !== 'pending') throw new Error('该虚拟评分不在待复核状态');
      if (!['confirmed', 'rejected'].includes(String(body.decision)) || text(body.reviewerId).length < 2 || text(body.reason).length < 2) {
        throw new Error('请填写虚拟复核人及复核意见');
      }
      const task = taskById(assessment.taskId);
      assessment.reviewStatus = String(body.decision);
      assessment.reviewerId = text(body.reviewerId).slice(0, 80);
      assessment.reviewComment = text(body.reason).slice(0, 500);
      task.status = body.decision === 'confirmed' ? '已归档' : '待复训';
      if (body.decision === 'confirmed') state.archives.push(archiveFor(task, assessment, time));
      return { assessment };
    }
    const match = /^\/training\/tasks\/([^/]+)\/(start|complete|assessment|retry|exception)$/.exec(path);
    if (!match) throw new Error('不支持的虚拟训练操作');
    const task = taskById(decodeURIComponent(match[1]));
    switch (match[2]) {
      case 'start':
        if (task.status !== '待训练') throw new Error('只有待训练的虚拟任务可以开始');
        task.status = '训练中';
        task.startedAt = time;
        return { task };
      case 'complete':
        if (task.status !== '训练中') throw new Error('请先开始虚拟训练');
        if (typeof body.elapsedSeconds !== 'number' || !Number.isInteger(body.elapsedSeconds) || body.elapsedSeconds < 1 || body.elapsedSeconds > 3600) {
          throw new Error('虚拟训练用时应为 1 至 3600 的整数秒数');
        }
        task.status = '待复核';
        task.elapsedSeconds = body.elapsedSeconds;
        task.completedAt = time;
        return { task };
      case 'assessment': {
        if (!['待复核', '待复训', '已归档'].includes(task.status)) throw new Error('请先完成虚拟训练');
        let assessment = state.assessments.find((item) => item.taskId === task.taskId);
        if (!assessment) {
          assessment = assessmentFor(task, 3, time);
          state.assessments.push(assessment);
        }
        return { assessment };
      }
      case 'retry': {
        if (!['已归档', '待复训'].includes(task.status)) throw new Error('完成复核后可创建虚拟复训');
        const next = newTask({ subject: task.subject, equipment: task.equipment, standard: task.standard, basis: task.basis }, task.traineeId);
        state.tasks.push(next);
        return { task: next };
      }
      case 'exception':
        if (text(body.reason).length < 2) throw new Error('请填写虚拟异常情况');
        task.exception = { reason: text(body.reason).slice(0, 500), auditId: `DEMO-EXCEPTION-${task.taskId}` };
        return { task };
    }
  };
  // Replaying a separate demo-only action log avoids importing existing real task snapshots.
  try {
    const saved: unknown = JSON.parse(storage?.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved) && saved.length <= 500) {
      for (const action of saved) {
        if (!action || typeof action.path !== 'string' || !action.body || typeof action.body !== 'object'
          || typeof action.time !== 'string' || !Number.isFinite(Date.parse(action.time))) throw new Error('Invalid demo action');
        mutate(action);
        actions.push(action);
      }
    }
  } catch { state = seedSnapshot(); actions = []; sequence = 0; persist(); }
  return {
    async snapshot(signal?: AbortSignal): Promise<TrainingSnapshot> {
      await waitForResponse(signal);
      return structuredClone(state);
    },
    async request<T>(path: string, options: RequestInit = {}): Promise<T> {
      await waitForResponse(options.signal);
      const method = options.method ?? 'GET';
      if (method === 'GET') {
        const items = path === '/training/subjects' ? catalog : path === '/training/tasks' ? state.tasks
          : path === '/training/assessments' ? state.assessments : path === '/training/archives' ? state.archives : undefined;
        if (!items) throw new Error('不支持的虚拟数据查询');
        return structuredClone({ dataMode: state.dataMode, items }) as T;
      }
      if (method !== 'POST') throw new Error('不支持的虚拟训练操作');
      if (actions.length >= 500) throw new Error('本轮演示记录已满，请重置虚拟数据');
      const body: unknown = JSON.parse(typeof options.body === 'string' ? options.body : '{}');
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('虚拟训练参数无效');
      const action = { path, body: body as Record<string, unknown>, time: new Date().toISOString() };
      const result = mutate(action);
      actions.push(action);
      persist();
      return structuredClone(result) as T;
    },
    reset() { state = seedSnapshot(); actions = []; sequence = 0; persist(); },
  };
}

let storage: DemoStorage | undefined;
try { storage = typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { /* Storage is optional. */ }
// Simulated latency makes the local demo's loading states visible without calling business APIs.
export const trainingDemo = createTrainingDemo(storage, 1000);
