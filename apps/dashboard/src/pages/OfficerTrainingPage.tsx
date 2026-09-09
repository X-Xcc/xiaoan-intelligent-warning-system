import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock3, FileCheck2, FileText, History,
  ListChecks, LoaderCircle, Plus, RefreshCw, RotateCcw, Search, ShieldCheck,
  Square, Timer, UserRound,
} from 'lucide-react';
import { Modal, Skeleton, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TrainingCameraPreview } from '../components/TrainingCameraPreview';
import {
  filterTrainingSubjects, isCreatedTrainingTask, officerTasks, selectOfficerTask, taskElapsedSeconds, taskStage,
  type TrainingArchive, type TrainingAssessment, type TrainingSnapshot, type TrainingStage, type TrainingTask, type TrainingSubject,
} from '../lib/training-api';
import { demoTrainingSelection, trainingDemo } from '../lib/training-demo';
import { useTrainingDraft } from '../lib/use-training-draft';
import { readTrainingSelection, rememberTrainingSelection } from '../lib/training-navigation';
import { appBasePath, routePath } from '../lib/presentation';
import { XiaoanVoiceControls, useXiaoanVoice } from '../components/XiaoanVoice';
import { trainingPassKey } from '../lib/xiaoan-voice-rules';
import { getTrainingRecommendations } from '../lib/training-recommendations';

const stages: Array<{ id: TrainingStage; label: string; icon: typeof Timer }> = [
  { id: 'prepare', label: '科目建议', icon: ListChecks },
  { id: 'run', label: '训练记录', icon: Timer },
  { id: 'assessment', label: '考核复核', icon: ClipboardCheck },
  { id: 'archive', label: '训练档案', icon: FileCheck2 },
];
const emptySnapshot: TrainingSnapshot = { dataMode: '', tasks: [], assessments: [], archives: [] };
const readableError = (error: unknown) => error instanceof Error && error.message !== 'Failed to fetch'
  ? error.message : '虚拟训练数据读取失败，请重试或重置演示。';
const trainingRequest = trainingDemo.request;
const getTrainingSnapshot = trainingDemo.snapshot;
const taskUrl = (taskId: string, action: string) => `/training/tasks/${encodeURIComponent(taskId)}/${action}`;
const officerLabel = (id: string) => `虚拟民警 ${id.replace(/^DEMO-OFFICER-/, '')}`;
const dateLabel = (value?: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未记录';
const timeLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function Status({ status }: { status: string }) {
  const tone = status === '已归档' ? 'success' : status === '训练中' ? 'active' : status === '待复训' ? 'danger' : 'pending';
  return <span className={`ot-status ${tone}`}><i />{status}</span>;
}

function TrainingLoading({ label, caption = true }: { label: string; caption?: boolean }) {
  return <div className="ot-loading-placeholder" role="status" aria-label={label}>
    {caption && <div className="ot-loading-caption"><Spin size="small" /><span>{label}</span></div>}
    <Skeleton active title={{ width: '42%' }} paragraph={{ rows: 4, width: ['90%', '100%', '76%', '84%'] }} />
    <Skeleton active title={false} paragraph={{ rows: 3, width: ['96%', '82%', '65%'] }} />
  </div>;
}

export function OfficerTrainingPage({ onSituation }: { onSituation: () => void }) {
  const { speak, stop: stopVoice } = useXiaoanVoice();
  const previousPass = useRef<string | null | undefined>(undefined);
  const initial = demoTrainingSelection(readTrainingSelection(window.location.search));
  const [officerId, setOfficerId] = useState(initial.officerId);
  const [selectedId, setSelectedId] = useState(initial.taskId);
  const [snapshot, setSnapshot] = useState<TrainingSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const loadVersion = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const stagePanelRef = useRef<HTMLDivElement>(null);
  const reviewFormRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<TrainingStage>('prepare');
  const [mode, setMode] = useState<'tasks' | 'archives'>('tasks');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [now, setNow] = useState(Date.now());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [subjects, setSubjects] = useState<TrainingSubject[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [subjectQuery, setSubjectQuery] = useState('');
  const [subjectCategory, setSubjectCategory] = useState('all');
  const [selectedSubjectsOnly, setSelectedSubjectsOnly] = useState(false);
  const [instructorScores, setInstructorScores] = useState<Record<string, string>>({});
  const categories = [...new Set(subjects.map((item) => item.category))];
  const filteredSubjects = filterTrainingSubjects(subjects, subjectCategory, subjectQuery, selectedSubjectsOnly, subjectIds);
  const allFilteredSelected = filteredSubjects.length > 0 && filteredSubjects.every((item) => subjectIds.includes(item.subjectId));
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [archiveTaskId, setArchiveTaskId] = useState('');

  const load = useCallback(async (afterMutation = false) => {
    if (busyRef.current && !afterMutation) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const next = await getTrainingSnapshot(controller.signal);
      if (!mounted.current || version !== loadVersion.current) return;
      setSnapshot(next);
      const passKey = trainingPassKey(next);
      if (previousPass.current === null && passKey) void speak('training-passed', passKey);
      previousPass.current = passKey;
      setOnline(true);
      setLastSync(new Date());
      setError('');
      return next;
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && version === loadVersion.current) {
        setOnline(false);
        previousPass.current = undefined;
        setError(readableError(cause));
      }
    } finally {
      if (mounted.current && version === loadVersion.current) setLoading(false);
    }
  }, [speak]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    const onHistory = () => {
      const selection = demoTrainingSelection(readTrainingSelection(window.location.search));
      setOfficerId(selection.officerId);
      setSelectedId(selection.taskId);
    };
    window.addEventListener('popstate', onHistory);
    return () => {
      mounted.current = false;
      loadController.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('popstate', onHistory);
    };
  }, [load]);

  const officers = useMemo(() => [...new Set(snapshot.tasks.map((task) => task.traineeId))].sort(), [snapshot.tasks]);
  const requestedTask = snapshot.tasks.find((task) => task.taskId === selectedId);
  const missingTask = Boolean(lastSync && selectedId && !requestedTask);
  const effectiveOfficer = requestedTask?.traineeId ?? (officers.includes(officerId) ? officerId : officers[0] ?? '');
  const ownTasks = useMemo(() => officerTasks(snapshot.tasks.filter(isCreatedTrainingTask), effectiveOfficer), [snapshot.tasks, effectiveOfficer]);
  const visibleTasks = ownTasks.filter((task) =>
    (statusFilter === 'all' || task.status === statusFilter) && `${task.subject} ${task.taskId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = missingTask ? undefined : archiveTaskId === selectedId && requestedTask
    ? requestedTask : selectOfficerTask(visibleTasks, effectiveOfficer, selectedId);
  useEffect(() => { stopVoice(); }, [selected?.taskId, stopVoice]);
  const assessment = snapshot.assessments.find((item) => item.taskId === selected?.taskId);
  const recommendations = selected ? getTrainingRecommendations(selected) : undefined;
  const instructorScored = selected?.standard.assessmentMode === 'instructor';
  const scoreFields = [
    { field: 'standardization', label: instructorScored ? '科目掌握' : '动作规范度' },
    { field: 'completionTime', label: instructorScored ? '任务完成' : '完成用时' },
    { field: 'coordination', label: instructorScored ? '规范与安全' : '协同一致性' },
  ] as const;
  const validInstructorScores = scoreFields.every(({ field }) => {
    const value = instructorScores[field];
    return value?.trim() !== '' && value !== undefined && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
  });
  const archive = snapshot.archives.find((item) => item.taskId === selected?.taskId);
  const ownArchives = snapshot.archives.filter((item) => item.traineeId === effectiveOfficer);
  const [draft, updateDraft] = useTrainingDraft(selected?.taskId);
  const { manualTime, elapsedInput, reviewer, reason, exceptionReason } = draft;
  const setManualTime = (value: boolean) => updateDraft({ manualTime: value });
  const setElapsedInput = (value: string) => updateDraft({ elapsedInput: value });
  const setReviewer = (value: string) => updateDraft({ reviewer: value });
  const setReason = (value: string) => updateDraft({ reason: value });
  const setExceptionReason = (value: string) => updateDraft({ exceptionReason: value });
  const interactionLocked = Boolean(busy);
  const completedStage = selected ? stages.findIndex((item) => item.id === taskStage(selected.status)) : 0;
  const elapsed = selected ? taskElapsedSeconds(selected, now) : 0;
  const submittedElapsed = manualTime ? Number(elapsedInput) : Math.max(1, elapsed);
  const validElapsed = !manualTime || (elapsedInput.trim() !== '' && Number.isInteger(submittedElapsed) && submittedElapsed >= 1 && submittedElapsed <= 3600);

  useEffect(() => {
    if (!selected) return;
    const next = new URL(window.location.href);
    next.pathname = routePath('duty-plan');
    next.searchParams.set('officer', selected.traineeId);
    next.searchParams.set('task', selected.taskId);
    window.history.replaceState(window.history.state ?? {}, '', next);
    rememberTrainingSelection({ taskId: selected.taskId, officerId: selected.traineeId });
  }, [selected?.taskId, selected?.traineeId]);

  useEffect(() => {
    setStage(selected ? taskStage(selected.status) : 'prepare');
    setReviewOpen(Boolean(draft.reviewer || draft.reason));
    setExceptionOpen(false);
    setFeedback('');
    setInstructorScores({});
  }, [selected?.taskId]);
  useEffect(() => {
    if (!selected) return;
    stagePanelRef.current?.scrollTo({ top: 0 });
    if (window.matchMedia('(max-width: 900px)').matches) {
      stagePanelRef.current?.closest('.ot-detail')?.scrollIntoView({ block: 'start' });
    }
  }, [stage, selected?.taskId, assessment?.assessmentId]);
  useEffect(() => {
    if (reviewOpen && stage === 'assessment') reviewFormRef.current?.scrollIntoView({ block: 'center' });
  }, [reviewOpen, stage]);
  useEffect(() => {
    if (selected?.status !== '训练中') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selected?.taskId, selected?.status]);

  const focusTask = (task: TrainingTask) => {
    setArchiveTaskId('');
    setError('');
    setSelectedId(task.taskId);
    setOfficerId(task.traineeId);
    setStatusFilter((current) => current === 'all' || current === task.status ? current : 'all');
    setQuery((current) => `${task.subject} ${task.taskId}`.toLowerCase().includes(current.trim().toLowerCase()) ? current : '');
  };
  const mergeTask = (task: TrainingTask) => {
    setSnapshot((current) => ({
      ...current,
      tasks: current.tasks.some((item) => item.taskId === task.taskId)
        ? current.tasks.map((item) => item.taskId === task.taskId ? task : item) : [...current.tasks, task],
    }));
    focusTask(task);
  };
  const mergeAssessment = (item: TrainingAssessment) => setSnapshot((current) => ({
    ...current, assessments: [...current.assessments.filter((value) => value.taskId !== item.taskId), item],
  }));

  const perform = async (label: string, operation: () => Promise<void>, pendingLabel = '正在处理训练数据') => {
    if (busyRef.current) return;
    busyRef.current = true;
    loadVersion.current += 1;
    loadController.current?.abort();
    setLoading(false);
    setBusy(pendingLabel);
    setError('');
    setFeedback('');
    try {
      await operation();
      if (!mounted.current) return;
      setFeedback(label);
      await load(true);
    } catch (cause) {
      if (mounted.current) setError(readableError(cause));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy('');
    }
  };

  const start = () => {
    if (!selected || !online || selected.status !== '待训练') return;
    void perform('训练已开始', async () => {
      const result = await trainingRequest<{ task: TrainingTask }>(taskUrl(selected.taskId, 'start'), { method: 'POST' });
      mergeTask(result.task);
      setNow(Date.now());
      setStage('run');
    }, '正在开始训练');
  };

  const finish = () => {
    if (!selected || selected.status !== '训练中' || !validElapsed) return;
    void perform('训练记录已提交，考核结果待教官复核', async () => {
      const result = await trainingRequest<{ task: TrainingTask }>(taskUrl(selected.taskId, 'complete'), {
        method: 'POST', body: JSON.stringify({ elapsedSeconds: submittedElapsed }),
      });
      mergeTask(result.task);
      setStage('assessment');
      setBusy('正在生成考核结果');
      const score = await trainingRequest<{ assessment: TrainingAssessment }>(taskUrl(result.task.taskId, 'assessment'), { method: 'POST' });
      mergeAssessment(score.assessment);
    }, '正在提交训练记录');
  };

  const generateAssessment = () => {
    if (!selected) return;
    void perform('考核结果已读取', async () => {
      const result = await trainingRequest<{ assessment: TrainingAssessment }>(taskUrl(selected.taskId, 'assessment'), { method: 'POST' });
      mergeAssessment(result.assessment);
      setStage('assessment');
    }, '正在生成考核结果');
  };
  const review = (decision: 'confirmed' | 'rejected') => {
    if (!assessment || !selected || reviewer.trim().length < 2 || reason.trim().length < 2) return;
    if (decision === 'confirmed' && instructorScored && !validInstructorScores) {
      setError('请填写三项教官评分，每项为 0 至 100 的整数。');
      return;
    }
    void perform(decision === 'confirmed' ? '复核已确认并归档' : '已退回补训', async () => {
      const result = await trainingRequest<{ assessment: TrainingAssessment }>(
        `/training/assessments/${encodeURIComponent(assessment.assessmentId)}/review`,
        { method: 'POST', body: JSON.stringify({ decision, reviewerId: reviewer.trim(), reason: reason.trim(),
          ...(instructorScored && decision === 'confirmed' ? { scores: Object.fromEntries(scoreFields.map(({ field }) => [field, Number(instructorScores[field])])) } : {}),
        }) },
      );
      mergeAssessment(result.assessment);
      mergeTask({ ...selected, status: decision === 'confirmed' ? '已归档' : '待复训' });
      setReviewOpen(false);
      setStage(decision === 'confirmed' ? 'archive' : 'assessment');
    }, decision === 'confirmed' ? '正在归档训练记录' : '正在退回补训');
  };
  const retry = () => {
    if (!selected) return;
    void perform('复训任务已创建', async () => {
      const result = await trainingRequest<{ task: TrainingTask }>(taskUrl(selected.taskId, 'retry'), { method: 'POST' });
      mergeTask(result.task);
      setStage('prepare');
      setStatusFilter('all');
      setQuery('');
      setMode('tasks');
    }, '正在创建复训任务');
  };
  const reportException = () => {
    if (!selected || exceptionReason.trim().length < 2) return;
    void perform('训练异常已登记', async () => {
      const result = await trainingRequest<{ task: TrainingTask }>(taskUrl(selected.taskId, 'exception'), {
        method: 'POST', body: JSON.stringify({ reason: exceptionReason.trim(), reportedBy: selected.traineeId }),
      });
      mergeTask(result.task);
      setExceptionOpen(false);
    }, '正在登记训练异常');
  };

  const openCreate = async () => {
    if (interactionLocked) return;
    setCreateOpen(true);
    setSubjectIds([]);
    setSubjectQuery('');
    setSubjectCategory('all');
    setSelectedSubjectsOnly(false);
    setCatalogError('');
    setCatalogLoading(true);
    try {
      const result = await trainingRequest<{ items: TrainingSubject[] }>('/training/subjects');
      setSubjects(result.items);
    } catch (cause) {
      setCatalogError(readableError(cause));
    } finally {
      setCatalogLoading(false);
    }
  };
  const create = () => {
    if (!subjectIds.length || !effectiveOfficer) return;
    void perform('训练任务已新建', async () => {
      const result = await trainingRequest<{ items: TrainingTask[] }>('/training/tasks', {
        method: 'POST', body: JSON.stringify({ subjectIds, traineeId: effectiveOfficer }),
      });
      setSnapshot((current) => ({ ...current, tasks: [...current.tasks, ...result.items] }));
      focusTask(result.items[0]);
      setStage('prepare');
      setMode('tasks');
      setCreateOpen(false);
    }, '正在新建训练任务');
  };
  const openReview = () => {
    if (!reviewer.trim()) setReviewer('DEMO-INSTRUCTOR-01');
    if (!reason.trim()) setReason('虚拟复核：训练环节完整、动作连贯，模拟考核通过。');
    setReviewOpen(true);
  };
  const resetDemo = () => {
    Modal.confirm({
      title: '重置虚拟数据？', content: '本页的虚拟训练操作将清空，恢复初始样例。不会影响真实业务数据。',
      okText: '重置', cancelText: '取消',
      onOk: () => {
        trainingDemo.reset();
        setSelectedId(`TRAIN-DEMO-${effectiveOfficer.slice(-3)}-01`);
        setArchiveTaskId('');
        setStatusFilter('all');
        setQuery('');
        setMode('tasks');
        setStage('prepare');
        setReviewOpen(false);
        setFeedback('虚拟数据已重置');
        void load();
      },
    });
  };
  const nextStep = () => {
    if (busyRef.current || catalogLoading) return;
    if (!selected) { void openCreate(); return; }
    if (stage === 'prepare') {
      if (selected.status === '待训练') {
        start();
      } else setStage('run');
    } else if (stage === 'run') {
      if (selected.status === '待训练') start();
      else if (selected.status === '训练中') finish();
      else setStage('assessment');
    } else if (stage === 'assessment') {
      if (!assessment) generateAssessment();
      else if (assessment.reviewStatus === 'pending') {
        openReview();
        if (!reviewOpen) setFeedback('虚拟复核信息已填入，请确认。');
        else if (reviewer.trim().length < 2 || reason.trim().length < 2) setError('请填写至少 2 个字符的教官编号和复核意见。');
        else review('confirmed');
      } else if (archive) setStage('archive');
      else retry();
    } else setMode('archives');
  };
  const previousStep = () => {
    if (busyRef.current || !selected) return;
    const index = stages.findIndex((item) => item.id === stage);
    if (index <= 0) return;
    setStage(stages[index - 1].id);
    setFeedback('');
  };

  const selectTask = (task: TrainingTask, nextStage?: TrainingStage) => {
    if (interactionLocked) return;
    focusTask(task);
    setMode('tasks');
    setStage(nextStage ?? taskStage(task.status));
  };
  const leave = (action: () => void) => {
    if (interactionLocked) return;
    action();
  };
  const openArchive = (item: TrainingArchive) => {
    const task = snapshot.tasks.find((value) => value.taskId === item.taskId);
    if (task) {
      selectTask(task, 'archive');
      setArchiveTaskId(task.taskId);
    }
  };
  const changeFilters = (nextQuery: string, nextStatus: string) => {
    setArchiveTaskId('');
    setQuery(nextQuery);
    setStatusFilter(nextStatus);
  };

  return <main className="officer-training-workspace">
    <header className="ot-topbar">
      <div className="ot-brand"><img src={`${appBasePath}/yanhuo-shaobing-mark.png`} alt="" /><span>公安 AI<span className="ot-brand-divider">/</span><b>训练中心</b></span></div>
      <nav className="ot-top-actions" aria-label="训练工作区导航">
        <XiaoanVoiceControls />
        <button type="button" className="ot-button" onClick={() => leave(onSituation)} disabled={interactionLocked}><ArrowLeft size={16} /><span>返回勤务态势</span></button>
      </nav>
    </header>
    <section className="ot-overview">
      <div className="ot-title-row">
        <div><nav className="ot-breadcrumb" aria-label="训练层级">
          <button type="button" onClick={() => leave(onSituation)} disabled={interactionLocked}>A1 勤务态势</button><ChevronRight size={12} />
          <span>单警训练</span>{selected && <><ChevronRight size={12} /><span aria-current="page">{selected.subject}</span></>}
        </nav><h1>单警训练</h1></div>
        <div className="ot-context">
          <label className="ot-officer-select"><UserRound size={16} /><select aria-label="训练对象" value={effectiveOfficer} disabled={interactionLocked || !officers.length}
            onChange={(event) => {
              const target = selectOfficerTask(snapshot.tasks.filter(isCreatedTrainingTask), event.target.value);
              if (target) selectTask(target);
              else {
                const nextOfficer = event.target.value;
                leave(() => { setOfficerId(nextOfficer); setSelectedId(''); setArchiveTaskId(''); setQuery(''); setStatusFilter('all'); });
              }
            }}>
            {!officers.length && <option value="">等待训练对象</option>}
            {officers.map((id) => <option key={id} value={id}>{officerLabel(id)}</option>)}
          </select></label>
          <Tooltip title="刷新训练数据"><button className="ot-icon-button" aria-label="刷新训练数据" disabled={Boolean(busy) || loading} onClick={() => void load()}><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></Tooltip>
          <Tooltip title="重置虚拟数据"><button className="ot-icon-button" aria-label="重置虚拟数据" disabled={interactionLocked || loading} onClick={resetDemo}><RotateCcw size={17} /></button></Tooltip>
        </div>
      </div>
      <dl className="ot-metrics">
        <div><dt>待训练</dt><dd>{ownTasks.filter((task) => task.status === '待训练').length}<span>项</span></dd></div>
        <div><dt>训练中</dt><dd className="ot-accent">{ownTasks.filter((task) => task.status === '训练中').length}<span>项</span></dd></div>
        <div><dt>待教官复核</dt><dd>{ownTasks.filter((task) => task.status === '待复核').length}<span>项</span></dd></div>
        <div><dt>个人训练档案</dt><dd className="ot-green">{ownArchives.length}<span>份</span></dd></div>
      </dl>
    </section>
    <div className="ot-subnav">
      <div role="tablist" aria-label="个人训练视图">
        <button role="tab" aria-selected={mode === 'tasks'} className={mode === 'tasks' ? 'active' : ''} onClick={() => setMode('tasks')} disabled={interactionLocked}><ListChecks size={16} />我的训练</button>
        <button role="tab" aria-selected={mode === 'archives'} className={mode === 'archives' ? 'active' : ''} onClick={() => setMode('archives')} disabled={interactionLocked}><History size={16} />个人档案<span>{ownArchives.length}</span></button>
      </div>
      <span className={`ot-sync ${online ? 'online' : ''}`}><i />{online ? '本地演示 · 不写入业务数据' : loading ? '正在加载虚拟数据' : '虚拟数据待加载'}</span>
    </div>
    {(error || feedback) && <div className={`ot-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
      {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<span>{error || feedback}</span>
      {error && <button type="button" onClick={() => void load()} disabled={Boolean(busy)}>重新同步</button>}
    </div>}
    {mode === 'archives' ? <section className="ot-archive-list">
      <div className="ot-section-title"><h2>个人训练档案</h2><span>{officerLabel(effectiveOfficer)} · {ownArchives.length} 份</span></div>
      {!ownArchives.length ? <div className="ot-empty"><FileText size={28} /><h3>暂无已归档训练</h3><p>完成考核并通过教官复核后生成档案。</p><button className="ot-button" onClick={() => setMode('tasks')}>查看训练任务<ArrowRight size={15} /></button></div>
        : <div className="ot-table-scroll"><table><thead><tr><th>训练科目</th><th>考核结论</th><th>归档时间</th><th>档案编号</th><th><span className="sr-only">操作</span></th></tr></thead>
          <tbody>{ownArchives.map((item) => <tr key={item.recordId}><td>{snapshot.tasks.find((task) => task.taskId === item.taskId)?.subject ?? item.taskId}</td><td><span className={`ot-status ${item.result === '合格' ? 'success' : 'danger'}`}>{item.result}</span></td><td>{dateLabel(item.createdAt)}</td><td className="ot-mono">{item.recordId}</td><td><button className="ot-text-button" onClick={() => openArchive(item)}>查看档案<ChevronRight size={14} /></button></td></tr>)}</tbody></table></div>}
    </section> : <div className="ot-workbench">
      <aside className="ot-task-rail">
        <div className="ot-rail-heading"><h2>训练任务</h2><span>{ownTasks.length}</span><button className="ot-button" onClick={() => void openCreate()} disabled={interactionLocked || !online}><Plus size={15} />新建</button></div>
        <label className="ot-search"><Search size={16} /><input aria-label="搜索训练任务" placeholder="搜索科目或任务编号" value={query} disabled={interactionLocked} onChange={(event) => changeFilters(event.target.value, statusFilter)} /></label>
        <select className="ot-filter" aria-label="筛选任务状态" value={statusFilter} disabled={interactionLocked} onChange={(event) => changeFilters(query, event.target.value)}>
          <option value="all">全部状态</option>{['待训练', '训练中', '待复核', '待复训', '已归档'].map((status) => <option key={status}>{status}</option>)}
        </select>
        <div className="ot-task-list" aria-label="当前民警的训练任务">
          {visibleTasks.map((task) => <button type="button" key={task.taskId} className={`ot-task-item ${selected?.taskId === task.taskId ? 'selected' : ''}`} aria-pressed={selected?.taskId === task.taskId} disabled={interactionLocked} onClick={() => selectTask(task)}>
            <div><span className="ot-task-icon"><ShieldCheck size={18} /></span><Status status={task.status} /></div>
            <strong>{task.subject}</strong><small>{task.standard.label}</small><span className="ot-task-id">{task.taskId}</span>
          </button>)}
          {loading && !lastSync ? <div className="ot-task-loading" aria-label="训练列表加载中"><Skeleton active paragraph={{ rows: 3 }} /><Skeleton active paragraph={{ rows: 3 }} /></div>
            : !visibleTasks.length && <div className="ot-list-empty">{ownTasks.length ? '没有符合条件的任务' : '暂无训练任务'}</div>}
        </div>
        <div className="ot-rail-bottom"><ShieldCheck size={15} /><span>任务与档案按民警独立记录</span></div>
      </aside>
      <section className="ot-detail">
        {!selected && loading ? <TrainingLoading label="正在读取训练任务" /> : !selected ? <div className="ot-empty"><ClipboardCheck size={30} /><h2>{missingTask ? '训练任务不可用' : '暂无训练任务'}</h2><p>{error ? '训练服务恢复后可重新同步。' : missingTask ? '该任务不存在或已撤回，请选择其他训练任务。' : '新建科目后生成训练任务。'}</p>
          {missingTask && <button className="ot-button" onClick={() => { setSelectedId(''); setQuery(''); setStatusFilter('all'); }}>查看我的训练<ArrowRight size={16} /></button>}
          <button className="ot-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />重新同步</button></div> : <>
          <div className="ot-detail-heading">
            <div><span className="ot-task-number">{selected.taskId}</span><h2 className="ot-task-title">{selected.subject}</h2><p>{officerLabel(selected.traineeId)}<span>·</span>{selected.teamName}</p></div>
            <Status status={selected.status} />
          </div>
          <div className="ot-steps" role="tablist" aria-label="训练流程">
            {stages.map((item, index) => {
              const Icon = item.icon;
              const enabled = index < 2 || (index === 2 && ['待复核', '已归档', '待复训'].includes(selected.status)) || (index === 3 && Boolean(archive));
              return <button key={item.id} role="tab" id={`ot-tab-${item.id}`} aria-controls="ot-stage-panel" aria-selected={stage === item.id} disabled={!enabled || interactionLocked} tabIndex={stage === item.id ? 0 : -1}
                className={`${stage === item.id ? 'active' : ''} ${index < completedStage ? 'done' : ''}`} onClick={() => setStage(item.id)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
                  const position = buttons.indexOf(event.currentTarget);
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (position + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                  buttons[next]?.click(); buttons[next]?.focus();
                }}>
                <span>{index < completedStage ? <Check size={15} /> : <Icon size={16} />}</span><b>{item.label}</b><ChevronRight className="ot-step-chevron" size={14} />
              </button>;
            })}
          </div>
          <div ref={stagePanelRef} id="ot-stage-panel" role="tabpanel" aria-labelledby={`ot-tab-${stage}`} aria-busy={Boolean(busy)} className="ot-stage-panel">
            <Spin spinning={Boolean(busy)} description={busy ? <span role="status">{busy}</span> : undefined} classNames={{ root: 'ot-stage-loading', container: 'ot-stage-container' }}>
            <div className="ot-stage-content" inert={Boolean(busy)}>
            {stage === 'prepare' && <div className="ot-preparation">
              {recommendations && <section className="ot-recommendations" aria-labelledby="ot-recommendations-title">
                <header className="ot-recommendations-heading">
                  <div><span><BookOpen size={18} />科目建议</span><h3 id="ot-recommendations-title">本次推荐训练项目</h3></div>
                  <span>{recommendations.items.length} 项<Clock3 size={14} />建议约 {recommendations.items.reduce((total, item) => total + item.minutes, 0)} 分钟</span>
                </header>
                <ol className="ot-drill-list">{recommendations.items.map((item, index) => <li key={item.id}>
                  <span className="ot-drill-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="ot-drill-content">
                    <div className="ot-drill-heading"><h4>{item.title}</h4><span>{index === 0 ? '优先练习' : '配套练习'} · {item.minutes} 分钟</span></div>
                    <p>{item.goal}</p>
                    <dl><div><dt>练习安排</dt><dd>{item.practice}</dd></div><div><dt>完成检查</dt><dd>{item.check}</dd></div></dl>
                  </div>
                </li>)}</ol>
                <div className="ot-training-standard"><ClipboardCheck size={16} /><span>任务考核标准</span><strong>{selected.standard.label}</strong></div>
                <p className="ot-recommendation-safety"><ShieldCheck size={16} /><span>{recommendations.safety}</span></p>
              </section>}
            </div>}
            {stage === 'run' && <div className="ot-execution">
              <div className="ot-recording-layout">
                <TrainingCameraPreview key={selected.taskId} taskId={selected.taskId} officer={officerLabel(selected.traineeId)} teamName={selected.teamName} />
                <section className="ot-timer-tool">
                  <span><Clock3 size={16} />训练用时</span><strong className="ot-timer" aria-label="训练计时">{timeLabel(elapsed)}</strong>
                  <div className="ot-time-standard">本次标准 <b>{selected.standard.thresholdSeconds != null ? `${selected.standard.thresholdSeconds} 秒` : '按本单位教学计划'}</b></div>
                  <label className="ot-checkbox"><input type="checkbox" checked={manualTime} disabled={Boolean(busy) || selected.status !== '训练中'} onChange={(event) => setManualTime(event.target.checked)} />录入现场计时</label>
                  {manualTime && <label className="ot-elapsed-input"><input type="number" min={1} max={3600} step={1} aria-label="现场用时（秒）" value={elapsedInput} disabled={Boolean(busy)} onChange={(event) => setElapsedInput(event.target.value)} /><span>秒</span></label>}
                  {!validElapsed && <p className="ot-inline-error">请填写 1 至 3600 的整数秒数</p>}
                  <div className="ot-started-at"><small>开始时间</small><span>{dateLabel(selected.startedAt)}</span></div>
                  {selected.exception && <p className="ot-inline-error">已登记异常：{selected.exception.reason}</p>}
                </section>
              </div>
              <footer className="ot-action-bar"><button className="ot-text-button" onClick={() => { if (!exceptionReason.trim()) setExceptionReason('虚拟异常：训练设备电量偏低，已更换备用设备。'); setExceptionOpen(true); }} disabled={Boolean(busy) || !online}><AlertCircle size={15} />登记异常</button>
                <button className="ot-button primary" disabled={Boolean(busy) || selected.status !== '训练中' || !validElapsed || !online} onClick={finish}>{busy ? <LoaderCircle className="spin" size={16} /> : <Square size={15} />}结束并提交考核</button>
              </footer>
            </div>}
            {stage === 'assessment' && <section className="ot-assessment">
              {!assessment && busy ? <TrainingLoading label="正在生成考核结果" caption={false} /> : !assessment ? <div className="ot-empty"><ClipboardCheck size={30} /><h3>训练记录已提交</h3><p>尚未生成考核结果。</p><button className="ot-button primary" disabled={Boolean(busy) || !online || selected.status !== '待复核'} onClick={generateAssessment}><RefreshCw size={16} />生成考核结果</button></div> : <>
                <div className="ot-result-heading"><div><span>虚拟考核总分</span><strong>{assessment.score.total ?? '—'}<small>/ 100</small></strong></div>
                  <div className="ot-result-verdict"><span className={`ot-status ${assessment.reviewStatus === 'pending' ? 'pending' : assessment.reviewStatus === 'rejected' ? 'danger' : 'success'}`}>{assessment.reviewStatus === 'pending' ? '待教官复核' : assessment.reviewStatus === 'rejected' ? '已退回补训' : '已复核'}</span><p>{instructorScored ? (assessment.score.total == null ? '待教官录入评分' : '达标结论以教官复核意见为准') : (assessment.score.total ?? 0) >= 80 ? '规则评分达到样例任务阈值' : '规则评分低于样例任务阈值'}</p></div></div>
                <div className="ot-assessment-identity" aria-label="参训警员身份"><UserRound size={18} /><strong>{officerLabel(selected.traineeId)}</strong><span>警员编号：{selected.traineeId}</span><span>所属：{selected.teamName}</span></div>
                <div className="ot-assessment-columns">{scoreFields.map((item) =>
                  <article key={item.field} className="ot-assessment-item">
                    <header><span className="ot-score-officer"><UserRound size={14} />{officerLabel(selected.traineeId)}</span><strong>{assessment.score[item.field] ?? '—'}<small> 分</small></strong></header>
                    <h3>{item.label}</h3>
                    <section><h4>优点</h4><p>{instructorScored ? '以教官复核意见为准。' : (assessment.score[item.field] ?? 0) >= 80 ? '该项规则评分达到样例阈值。' : '暂无达到样例阈值的优势记录，待教官补充。'}</p></section>
                    <section><h4>不足</h4><p>{instructorScored ? '以教官复核意见为准。' : (assessment.score[item.field] ?? 0) < 80 ? '该项低于样例阈值，建议作为复训重点。' : '规则评分未提示不足，仍需教官核验。'}</p></section>
                  </article>)}</div>
                <div className="ot-evidence"><h3><FileText size={16} />评分记录</h3><dl><div><dt>模拟用时</dt><dd>{selected.elapsedSeconds ?? '—'} 秒</dd></div><div><dt>评分来源</dt><dd>本地合成数据（非真实考核）</dd></div><div><dt>规则版本</dt><dd>{assessment.ruleVersion}</dd></div><div><dt>记录时间</dt><dd>{dateLabel(assessment.evidenceTime)}</dd></div><div><dt>审计编号</dt><dd className="ot-mono">{assessment.auditId}</dd></div></dl></div>
                {assessment.reviewStatus === 'pending' ? reviewOpen ? <div ref={reviewFormRef} className="ot-review-form">
                  <h3>教官复核</h3><label>复核人编号<input aria-label="复核人编号" value={reviewer} disabled={Boolean(busy)} maxLength={80} onChange={(event) => setReviewer(event.target.value)} placeholder="填写教官编号" /></label>
                  {instructorScored && <div className="ot-instructor-scores">{scoreFields.map(({ field, label }) => <label key={field}>{label}<input type="number" min={0} max={100} step={1} aria-label={`${label}评分`} value={instructorScores[field] ?? ''} disabled={Boolean(busy)} onChange={(event) => setInstructorScores((current) => ({ ...current, [field]: event.target.value }))} /></label>)}</div>}
                  <label>复核意见<textarea aria-label="复核意见" value={reason} disabled={Boolean(busy)} maxLength={500} rows={3} onChange={(event) => setReason(event.target.value)} placeholder="填写训练表现与确认或退回依据" /></label>
                  <div className="ot-review-actions"><button className="ot-button" disabled={Boolean(busy)} onClick={() => setReviewOpen(false)}>取消</button><button className="ot-button danger" disabled={Boolean(busy) || !online || reviewer.trim().length < 2 || reason.trim().length < 2} onClick={() => review('rejected')}>退回补训</button><button className="ot-button primary" disabled={Boolean(busy) || !online || reviewer.trim().length < 2 || reason.trim().length < 2} onClick={() => review('confirmed')}><FileCheck2 size={16} />确认并归档</button></div>
                </div> : <footer className="ot-action-bar"><span><ShieldCheck size={15} />确认后写入虚拟个人档案</span><button className="ot-button primary" onClick={openReview} disabled={Boolean(busy) || !online}><ClipboardCheck size={16} />教官复核</button></footer>
                  : <><div className="ot-reviewed-note"><strong>复核人：{assessment.reviewerId ?? '—'}</strong><p>{assessment.reviewComment}</p></div><footer className="ot-action-bar"><span>复核记录已保留</span>{archive ? <button className="ot-button primary" onClick={() => setStage('archive')}>查看训练档案<ArrowRight size={16} /></button> : <button className="ot-button primary" disabled={Boolean(busy) || !online} onClick={retry}><RotateCcw size={16} />创建复训任务</button>}</footer></>}
              </>}
            </section>}
            {stage === 'archive' && <section className="ot-archive">
              {!archive && (busy || loading) ? <TrainingLoading label="正在读取训练档案" caption={!busy} /> : !archive ? <div className="ot-empty"><FileText size={28} /><h3>尚未生成档案</h3><p>完成教官复核后，档案会在此显示。</p><button className="ot-button" disabled={loading || Boolean(busy)} onClick={() => void load()}>重新同步</button></div> : <>
                <div className="ot-archive-verdict"><span><FileCheck2 size={24} /></span><div><small>训练已归档</small><h3>{selected.subject}</h3></div><b>{archive.result}</b></div>
                <dl className="ot-archive-facts"><div><dt>训练民警</dt><dd>{officerLabel(archive.traineeId)}</dd></div><div><dt>归档时间</dt><dd>{dateLabel(archive.createdAt)}</dd></div><div><dt>档案编号</dt><dd>{archive.recordId}</dd></div><div><dt>审计编号</dt><dd>{archive.auditId}</dd></div></dl>
                <div className="ot-retraining"><h3>后续训练建议</h3><div>{archive.weakPoints.map((item) => <span key={item}>{item}</span>)}</div><p>{archive.retrainingRecommendation}</p></div>
                <footer className="ot-action-bar"><button className="ot-text-button" onClick={() => setMode('archives')}><History size={15} />全部个人档案</button><button className="ot-button primary" disabled={Boolean(busy) || !online} onClick={retry}><RotateCcw size={16} />创建复训任务</button></footer>
              </>}
            </section>}
            </div>
            </Spin>
          </div>
        </>}
        <footer className="ot-next-bar">
          <span>{selected ? `${stages.findIndex((item) => item.id === stage) + 1} / 4 · ${stages.find((item) => item.id === stage)?.label}` : '新建训练任务'}</span>
          <div className="ot-next-actions">
          <button className="ot-button" onClick={previousStep} disabled={Boolean(busy) || !selected || stage === 'prepare'}><ArrowLeft size={16} />上一步</button>
          <button className="ot-button primary" onClick={nextStep} disabled={Boolean(busy) || !online || catalogLoading || (stage === 'run' && !validElapsed)}>
            {busy ? <LoaderCircle size={16} className="spin" /> : null}{stage === 'archive' && selected ? '完成' : '下一步'}<ArrowRight size={16} />
          </button>
          </div>
        </footer>
      </section>
    </div>}
    <Modal title="新建训练任务" className="ot-catalog-modal" open={createOpen} onCancel={() => { if (!busy) setCreateOpen(false); }} footer={null} width={900} destroyOnHidden>
      <div className="ot-create-form">
        <div className="ot-section-title"><span>{officerLabel(effectiveOfficer)} · 全部科目 {subjects.length}</span><span>已选 {subjectIds.length} 项</span></div>
        <div className="ot-catalog-filters">
          <label className="ot-search"><Search size={16} /><input aria-label="搜索训练科目" placeholder="搜索科目、分类或装备" value={subjectQuery} onChange={(event) => setSubjectQuery(event.target.value)} /></label>
          <select className="ot-filter" aria-label="训练科目分类" value={subjectCategory} onChange={(event) => setSubjectCategory(event.target.value)}><option value="all">全部分类（{categories.length}）</option>{categories.map((category) => <option key={category} value={category}>{category}（{subjects.filter((item) => item.category === category).length}）</option>)}</select>
        </div>
        <div className="ot-catalog-tools">
          <label><input type="checkbox" aria-label="选择当前结果" checked={allFilteredSelected} disabled={!filteredSubjects.length || Boolean(busy)} onChange={(event) => setSubjectIds((current) => event.target.checked ? [...new Set([...current, ...filteredSubjects.map((item) => item.subjectId)])] : current.filter((id) => !filteredSubjects.some((item) => item.subjectId === id)))} />当前结果 {filteredSubjects.length} 项</label>
          <label><input type="checkbox" checked={selectedSubjectsOnly} onChange={(event) => setSelectedSubjectsOnly(event.target.checked)} />仅看已选</label>
          <button className="ot-text-button" onClick={() => setSubjectIds([])} disabled={!subjectIds.length || Boolean(busy)}>清空选择</button>
        </div>
        {catalogLoading ? <div className="ot-catalog-loading"><TrainingLoading label="正在读取科目库" /></div> : catalogError ? <p role="alert" className="ot-inline-error">{catalogError}<button className="ot-text-button" onClick={() => void openCreate()}>重试</button></p> :
          <div className="ot-subject-list">{filteredSubjects.map((item) => <label key={item.subjectId}>
            <input type="checkbox" aria-label={item.subject} checked={subjectIds.includes(item.subjectId)} disabled={Boolean(busy)} onChange={(event) => setSubjectIds((current) => event.target.checked ? [...current, item.subjectId] : current.filter((id) => id !== item.subjectId))} />
            <span><strong>{item.subject}</strong><small className="ot-subject-category">{item.category}</small><small>{item.standard.label}</small></span>
          </label>)}{!filteredSubjects.length && <p className="ot-catalog-empty">暂无符合条件的科目</p>}</div>}
        {error && <p role="alert" className="ot-inline-error">{error}</p>}
        <div className="ot-review-actions"><button className="ot-button" onClick={() => setCreateOpen(false)} disabled={Boolean(busy)}>取消</button><button className="ot-button primary" onClick={create} disabled={!subjectIds.length || Boolean(busy) || catalogLoading || Boolean(catalogError) || !online}><Plus size={16} />确认新建{subjectIds.length ? `（${subjectIds.length}）` : ''}</button></div>
      </div>
    </Modal>
    <Modal title="登记训练异常" open={exceptionOpen} onCancel={() => { if (!busy) setExceptionOpen(false); }} footer={null} destroyOnHidden>
      <form className="ot-exception-form" onSubmit={(event) => { event.preventDefault(); reportException(); }}>
        <label>异常情况<textarea aria-label="异常情况" rows={4} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} maxLength={500} placeholder="填写设备、场地或训练过程中的异常" disabled={Boolean(busy)} /></label>
        <button className="ot-button primary" disabled={Boolean(busy) || exceptionReason.trim().length < 2 || !online}>提交异常记录</button>
      </form>
    </Modal>
  </main>;
}
