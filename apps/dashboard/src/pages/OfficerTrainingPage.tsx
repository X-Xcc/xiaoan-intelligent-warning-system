import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen, Camera, Check, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock3, Download, FileCheck2, FileText, History,
  ListChecks, LoaderCircle, Play, RefreshCw, RotateCcw, Search, ShieldCheck,
  Square, Timer, Upload, UserRound, Video,
} from 'lucide-react';
import { Modal, Tooltip } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TrainingPoseOverlay } from '../components/TrainingPoseOverlay';
import {
  getTrainingSnapshot, officerTasks, selectOfficerTask, taskElapsedSeconds, taskStage, trainingRequest,
  type TrainingArchive, type TrainingAssessment, type TrainingSnapshot, type TrainingStage, type TrainingTask,
} from '../lib/training-api';
import { useTrainingMedia } from '../lib/use-training-media';
import { useTrainingDraft } from '../lib/use-training-draft';
import { readTrainingSelection, rememberTrainingSelection } from '../lib/training-navigation';
import { routePath } from '../lib/presentation';
import { XiaoanVoiceControls, useXiaoanVoice } from '../components/XiaoanVoice';
import { trainingPassKey } from '../lib/xiaoan-voice-rules';

const stages: Array<{ id: TrainingStage; label: string; icon: typeof Timer }> = [
  { id: 'prepare', label: '训练准备', icon: ListChecks },
  { id: 'run', label: '训练记录', icon: Timer },
  { id: 'assessment', label: '考核复核', icon: ClipboardCheck },
  { id: 'archive', label: '训练档案', icon: FileCheck2 },
];
const emptySnapshot: TrainingSnapshot = { dataMode: '', tasks: [], assessments: [], archives: [] };
const readableError = (error: unknown) => error instanceof Error && error.message !== 'Failed to fetch'
  ? error.message : '训练服务暂不可用，请检查连接后重试。';
const taskUrl = (taskId: string, action: string) => `/training/tasks/${encodeURIComponent(taskId)}/${action}`;
const officerLabel = (id: string) => `民警 ${id.replace(/^OFFICER-/, '')}`;
const dateLabel = (value?: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未记录';
const timeLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function Status({ status }: { status: string }) {
  const tone = status === '已归档' ? 'success' : status === '训练中' ? 'active' : status === '待复训' ? 'danger' : 'pending';
  return <span className={`ot-status ${tone}`}><i />{status}</span>;
}

export function OfficerTrainingPage({ onSituation }: { onSituation: () => void }) {
  const { speak, stop: stopVoice } = useXiaoanVoice();
  const previousPass = useRef<string | null | undefined>(undefined);
  const initial = readTrainingSelection(window.location.search);
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
  const mediaTaskRef = useRef('');
  const [stage, setStage] = useState<TrainingStage>('prepare');
  const [mode, setMode] = useState<'tasks' | 'archives'>('tasks');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [now, setNow] = useState(Date.now());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);

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
      const mediaTask = next.tasks.find((task) => task.taskId === mediaTaskRef.current);
      if (mediaTask) setStatusFilter((current) => current === 'all' || current === mediaTask.status ? current : 'all');
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
      const selection = readTrainingSelection(window.location.search);
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
  const missingTask = Boolean(lastSync && snapshot.tasks.length && selectedId && !requestedTask);
  const effectiveOfficer = requestedTask?.traineeId ?? (officers.includes(officerId) ? officerId : officers[0] ?? '');
  const ownTasks = useMemo(() => officerTasks(snapshot.tasks, effectiveOfficer), [snapshot.tasks, effectiveOfficer]);
  const visibleTasks = ownTasks.filter((task) =>
    (statusFilter === 'all' || task.status === statusFilter) && `${task.subject} ${task.taskId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = missingTask ? undefined : selectOfficerTask(visibleTasks, effectiveOfficer, selectedId);
  useEffect(() => { stopVoice(); }, [selected?.taskId, stopVoice]);
  const assessment = snapshot.assessments.find((item) => item.taskId === selected?.taskId);
  const archive = snapshot.archives.find((item) => item.taskId === selected?.taskId);
  const ownArchives = snapshot.archives.filter((item) => item.traineeId === effectiveOfficer);
  const media = useTrainingMedia(selected?.taskId, selected?.status === '训练中');
  mediaTaskRef.current = media.previewUrl || media.recording || media.opening ? selected?.taskId ?? '' : '';
  const [draft, updateDraft] = useTrainingDraft(selected?.taskId);
  const { checks: selectedChecks, manualTime, elapsedInput, reviewer, reason, exceptionReason } = draft;
  const setManualTime = (value: boolean) => updateDraft({ manualTime: value });
  const setElapsedInput = (value: string) => updateDraft({ elapsedInput: value });
  const setReviewer = (value: string) => updateDraft({ reviewer: value });
  const setReason = (value: string) => updateDraft({ reason: value });
  const setExceptionReason = (value: string) => updateDraft({ exceptionReason: value });
  const interactionLocked = Boolean(busy) || media.recording || media.opening;
  const completedStage = selected ? stages.findIndex((item) => item.id === taskStage(selected.status)) : 0;
  const equipment = selected ? [...selected.equipment, '训练场地与个人防护已确认'] : [];
  const prepared = equipment.length > 0 && equipment.every((item) => selectedChecks.includes(item));
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
  }, [selected?.taskId]);
  useEffect(() => {
    if (selected?.status !== '训练中') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selected?.taskId, selected?.status]);

  const focusTask = (task: TrainingTask) => {
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

  const perform = async (label: string, operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    loadVersion.current += 1;
    loadController.current?.abort();
    setLoading(false);
    setBusy(label);
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
    if (!selected || !prepared || selected.status !== '待训练') return;
    void perform('训练已开始', async () => {
      const result = await trainingRequest<{ task: TrainingTask }>(taskUrl(selected.taskId, 'start'), { method: 'POST' });
      mergeTask(result.task);
      setNow(Date.now());
      setStage('run');
    });
  };

  const finish = () => {
    if (!selected || selected.status !== '训练中' || !validElapsed) return;
    media.stopRecording();
    void perform('训练记录已提交，考核结果待教官复核', async () => {
      const result = await trainingRequest<{ task: TrainingTask }>(taskUrl(selected.taskId, 'complete'), {
        method: 'POST', body: JSON.stringify({ elapsedSeconds: submittedElapsed }),
      });
      mergeTask(result.task);
      setStage('assessment');
      const score = await trainingRequest<{ assessment: TrainingAssessment }>(taskUrl(result.task.taskId, 'assessment'), { method: 'POST' });
      mergeAssessment(score.assessment);
    });
  };

  const generateAssessment = () => {
    if (!selected) return;
    void perform('考核结果已读取', async () => {
      const result = await trainingRequest<{ assessment: TrainingAssessment }>(taskUrl(selected.taskId, 'assessment'), { method: 'POST' });
      mergeAssessment(result.assessment);
      setStage('assessment');
    });
  };
  const review = (decision: 'confirmed' | 'rejected') => {
    if (!assessment || !selected || reviewer.trim().length < 2 || reason.trim().length < 2) return;
    void perform(decision === 'confirmed' ? '复核已确认并归档' : '已退回补训', async () => {
      const result = await trainingRequest<{ assessment: TrainingAssessment }>(
        `/training/assessments/${encodeURIComponent(assessment.assessmentId)}/review`,
        { method: 'POST', body: JSON.stringify({ decision, reviewerId: reviewer.trim(), reason: reason.trim() }) },
      );
      mergeAssessment(result.assessment);
      mergeTask({ ...selected, status: decision === 'confirmed' ? '已归档' : '待复训' });
      setReviewOpen(false);
      setStage(decision === 'confirmed' ? 'archive' : 'assessment');
    });
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
    });
  };
  const reportException = () => {
    if (!selected || exceptionReason.trim().length < 2) return;
    void perform('训练异常已登记', async () => {
      const result = await trainingRequest<{ task: TrainingTask }>(taskUrl(selected.taskId, 'exception'), {
        method: 'POST', body: JSON.stringify({ reason: exceptionReason.trim(), reportedBy: selected.traineeId }),
      });
      mergeTask(result.task);
      setExceptionOpen(false);
    });
  };

  const selectTask = (task: TrainingTask, nextStage?: TrainingStage) => {
    if (interactionLocked) return;
    const select = () => {
      focusTask(task);
      setMode('tasks');
      setStage(nextStage ?? taskStage(task.status));
    };
    if (media.previewUrl && selected?.taskId !== task.taskId) {
      Modal.confirm({
        title: '切换训练任务？', content: '当前本地视频尚未下载，切换后将释放该视频。',
        okText: '切换任务', cancelText: '继续当前任务',
        onOk: select,
      });
      return;
    }
    select();
  };
  const leave = (action: () => void) => {
    if (interactionLocked) return;
    if (media.previewUrl) Modal.confirm({
      title: '离开训练工作台？', content: '任务记录已保留在服务端；未下载的本地视频将被释放。',
      okText: '离开', cancelText: '继续查看', onOk: action,
    });
    else action();
  };
  const openArchive = (item: TrainingArchive) => {
    const task = snapshot.tasks.find((value) => value.taskId === item.taskId);
    if (task) selectTask(task, 'archive');
  };
  const changeFilters = (nextQuery: string, nextStatus: string) => {
    const filtered = ownTasks.filter((task) => (nextStatus === 'all' || task.status === nextStatus)
      && `${task.subject} ${task.taskId}`.toLowerCase().includes(nextQuery.trim().toLowerCase()));
    const nextTask = selectOfficerTask(filtered, effectiveOfficer, selected?.taskId);
    const apply = () => { setQuery(nextQuery); setStatusFilter(nextStatus); };
    if (media.previewUrl && nextTask?.taskId !== selected?.taskId) {
      Modal.confirm({
        title: '筛选将切换当前任务', content: '当前本地视频尚未下载，继续筛选将释放该视频。',
        okText: '继续筛选', cancelText: '保留当前任务', onOk: apply,
      });
    } else apply();
  };

  return <main className="officer-training-workspace">
    <header className="ot-topbar">
      <div className="ot-brand"><img src="/yanhuo-shaobing-mark.png" alt="" /><span>公安 AI<span className="ot-brand-divider">/</span><b>训练中心</b></span></div>
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
              const target = selectOfficerTask(snapshot.tasks, event.target.value);
              if (target) selectTask(target);
            }}>
            {!officers.length && <option value="">等待训练对象</option>}
            {officers.map((id) => <option key={id} value={id}>{officerLabel(id)}</option>)}
          </select></label>
          <span className="ot-source">{snapshot.dataMode === 'desensitized_sample' ? '脱敏样例 · 规则评分' : snapshot.dataMode ? '训练任务数据' : '等待数据'}</span>
          <Tooltip title="刷新训练数据"><button className="ot-icon-button" aria-label="刷新训练数据" disabled={Boolean(busy) || loading} onClick={() => void load()}><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></Tooltip>
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
      <span className={`ot-sync ${online ? 'online' : ''}`}><i />{online ? `已同步 ${lastSync?.toLocaleTimeString('zh-CN', { hour12: false }) ?? ''}` : lastSync ? '连接中断 · 保留上次数据' : loading ? '正在同步' : '服务未连接'}</span>
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
        <div className="ot-rail-heading"><h2>训练任务</h2><span>{ownTasks.length}</span></div>
        <label className="ot-search"><Search size={16} /><input aria-label="搜索训练任务" placeholder="搜索科目或任务编号" value={query} disabled={interactionLocked} onChange={(event) => changeFilters(event.target.value, statusFilter)} /></label>
        <select className="ot-filter" aria-label="筛选任务状态" value={statusFilter} disabled={interactionLocked} onChange={(event) => changeFilters(query, event.target.value)}>
          <option value="all">全部状态</option>{['待训练', '训练中', '待复核', '待复训', '已归档'].map((status) => <option key={status}>{status}</option>)}
        </select>
        <div className="ot-task-list" aria-label="当前民警的训练任务">
          {visibleTasks.map((task) => <button type="button" key={task.taskId} className={`ot-task-item ${selected?.taskId === task.taskId ? 'selected' : ''}`} aria-pressed={selected?.taskId === task.taskId} disabled={interactionLocked} onClick={() => selectTask(task)}>
            <div><span className="ot-task-icon"><ShieldCheck size={18} /></span><Status status={task.status} /></div>
            <strong>{task.subject}</strong><small>{task.standard.label}</small><span className="ot-task-id">{task.taskId}</span>
          </button>)}
          {!visibleTasks.length && <div className="ot-list-empty">{loading && !lastSync ? '正在加载训练任务' : ownTasks.length ? '没有符合条件的任务' : '暂无训练任务'}</div>}
        </div>
        <div className="ot-rail-bottom"><ShieldCheck size={15} /><span>任务与档案按民警独立记录</span></div>
      </aside>
      <section className="ot-detail">
        {!selected ? <div className="ot-empty">{loading ? <LoaderCircle size={30} className="spin" /> : <ClipboardCheck size={30} />}<h2>{loading ? '正在读取训练任务' : missingTask ? '训练任务不可用' : '暂无可执行训练'}</h2><p>{error ? '训练服务恢复后可重新同步。' : missingTask ? '该任务不存在或已撤回，请选择其他训练任务。' : '当前训练对象没有已分配任务。'}</p>
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
          <div id="ot-stage-panel" role="tabpanel" aria-labelledby={`ot-tab-${stage}`} className="ot-stage-panel">
            {stage === 'prepare' && <div className="ot-preparation">
              <div className="ot-standard-band"><span><Timer size={20} />本次任务标准</span><strong>{selected.standard.thresholdSeconds ?? '—'}<small>秒</small></strong><p>{selected.standard.label}</p>{selected.standard.targetMeters && <b>{selected.standard.targetMeters} 米警戒范围</b>}</div>
              <div className="ot-prep-columns">
                <section><div className="ot-section-title"><h3>装备与安全确认</h3><span>{selectedChecks.length} / {equipment.length}</span></div>
                  <div className="ot-checklist">{equipment.map((item) => <label key={item} className={selectedChecks.includes(item) ? 'checked' : ''}>
                    <input type="checkbox" checked={selectedChecks.includes(item)} disabled={Boolean(busy) || selected.status !== '待训练'} onChange={(event) => updateDraft({ checks: event.target.checked ? [...selectedChecks, item] : selectedChecks.filter((value) => value !== item) })} /><span>{item}</span>{selectedChecks.includes(item) && <Check size={15} />}
                  </label>)}</div>
                </section>
                <section className="ot-basis"><h3><BookOpen size={16} />训练依据</h3>{selected.basis.map((item) => <p key={item}>{item}</p>)}<div><span>训练对象</span><strong>{officerLabel(selected.traineeId)}</strong></div><div><span>任务来源</span><strong>勤务态势靶向推荐</strong></div></section>
              </div>
              <footer className="ot-action-bar"><span><ShieldCheck size={15} />{prepared ? '训练准备已确认' : '待完成装备与安全确认'}</span>
                {selected.status === '待训练' ? <button className="ot-button primary" disabled={!prepared || Boolean(busy) || !online} onClick={start}>{busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}开始训练</button>
                  : <button className="ot-button primary" onClick={() => setStage(taskStage(selected.status))}>查看当前进度<ArrowRight size={16} /></button>}
              </footer>
            </div>}
            {stage === 'run' && <div className="ot-execution">
              <div className="ot-recording-layout">
                <section className="ot-video-tool">
                  <div className="ot-video">
                    <video ref={media.videoRef} src={media.previewUrl || undefined} controls={Boolean(media.previewUrl)} autoPlay={!media.previewUrl} playsInline muted={!media.previewUrl} onError={() => setError('视频无法解码，请选择浏览器支持的 MP4 或 WebM 文件。')} />
                    {!media.recording && !media.previewUrl && <div className="ot-video-placeholder"><Video size={36} /><strong>训练影像</strong><span>{media.opening ? '正在连接摄像头' : '尚未接入视频'}</span></div>}
                    <span className={`ot-video-label ${media.previewUrl ? 'has-playback' : ''}`}><i className={media.recording ? 'recording' : ''} />{media.recording ? '本地录制中' : media.previewUrl ? '本地视频回放' : '视频待机'}</span>
                    <TrainingPoseOverlay key={selected.taskId} videoRef={media.videoRef} active={media.recording || Boolean(media.previewUrl)}
                      sourceKey={`${selected.taskId}:${media.previewUrl || 'camera'}`} playback={Boolean(media.previewUrl)} subject={selected.subject} />
                  </div>
                  <div className="ot-media-toolbar">
                    <button className="ot-button" disabled={!media.recording && !media.opening && (Boolean(busy) || selected.status !== '训练中')} onClick={() => media.opening ? media.cancelOpening() : media.recording ? media.stopRecording() : void media.startRecording()}>
                      {media.recording || media.opening ? <Square size={15} /> : <Camera size={15} />}{media.opening ? '取消连接' : media.recording ? '停止录像' : '录制视频'}</button>
                    <label className={`ot-button ${media.recording || media.opening || Boolean(busy) ? 'disabled' : ''}`}><Upload size={15} />导入视频<input type="file" accept="video/*" aria-label="导入本地训练视频" disabled={media.recording || media.opening || Boolean(busy)} onChange={(event) => { media.loadFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
                    {media.previewUrl && <a className="ot-button" href={media.previewUrl} download={media.downloadName}><Download size={15} />下载</a>}
                  </div>
                  <p className="ot-media-note">本地视频，不上传 · 当前考核采用脱敏规则评分</p>
                  {media.error && <p className="ot-inline-error" role="alert"><AlertCircle size={15} />{media.error}</p>}
                </section>
                <section className="ot-timer-tool">
                  <span><Clock3 size={16} />训练用时</span><strong className="ot-timer" aria-label="训练计时">{timeLabel(elapsed)}</strong>
                  <div className="ot-time-standard">本次标准 <b>{selected.standard.thresholdSeconds ?? '—'} 秒</b></div>
                  <label className="ot-checkbox"><input type="checkbox" checked={manualTime} disabled={Boolean(busy) || selected.status !== '训练中'} onChange={(event) => setManualTime(event.target.checked)} />录入现场计时</label>
                  {manualTime && <label className="ot-elapsed-input"><input type="number" min={1} max={3600} step={1} aria-label="现场用时（秒）" value={elapsedInput} disabled={Boolean(busy)} onChange={(event) => setElapsedInput(event.target.value)} /><span>秒</span></label>}
                  {!validElapsed && <p className="ot-inline-error">请填写 1 至 3600 的整数秒数</p>}
                  <div className="ot-started-at"><small>开始时间</small><span>{dateLabel(selected.startedAt)}</span></div>
                  {selected.exception && <p className="ot-inline-error">已登记异常：{selected.exception.reason}</p>}
                </section>
              </div>
              <footer className="ot-action-bar"><button className="ot-text-button" onClick={() => setExceptionOpen(true)} disabled={Boolean(busy) || !online}><AlertCircle size={15} />登记异常</button>
                <button className="ot-button primary" disabled={Boolean(busy) || media.opening || selected.status !== '训练中' || !validElapsed || !online} onClick={finish}>{busy ? <LoaderCircle className="spin" size={16} /> : <Square size={15} />}结束并提交考核</button>
              </footer>
            </div>}
            {stage === 'assessment' && <section className="ot-assessment">
              {!assessment ? <div className="ot-empty"><ClipboardCheck size={30} /><h3>训练记录已提交</h3><p>尚未生成考核结果。</p><button className="ot-button primary" disabled={Boolean(busy) || !online || selected.status !== '待复核'} onClick={generateAssessment}><RefreshCw size={16} />生成考核结果</button></div> : <>
                <div className="ot-result-heading"><div><span>规则考核总分</span><strong>{assessment.score.total}<small>/ 100</small></strong></div>
                  <div className="ot-result-verdict"><span className={`ot-status ${assessment.reviewStatus === 'pending' ? 'pending' : assessment.reviewStatus === 'rejected' ? 'danger' : 'success'}`}>{assessment.reviewStatus === 'pending' ? '待教官复核' : assessment.reviewStatus === 'rejected' ? '已退回补训' : '已复核'}</span><p>{assessment.score.total >= 80 ? '规则评分达到样例任务阈值' : '规则评分低于样例任务阈值'}</p></div></div>
                <div className="ot-score-rows">{([{ field: 'standardization', label: '动作规范度' }, { field: 'completionTime', label: '完成用时' }, { field: 'coordination', label: '协同一致性' }] as const).map((item) =>
                  <div key={item.field}><span>{item.label}</span><meter min={0} max={100} value={assessment.score[item.field]} aria-label={`${item.label}评分`} /><strong>{assessment.score[item.field]}<small>分</small></strong></div>)}</div>
                <div className="ot-evidence"><h3><FileText size={16} />评分记录</h3><dl><div><dt>实际用时</dt><dd>{selected.elapsedSeconds ?? '—'} 秒</dd></div><div><dt>评分来源</dt><dd>脱敏样例规则服务</dd></div><div><dt>规则版本</dt><dd>{assessment.ruleVersion}</dd></div><div><dt>记录时间</dt><dd>{dateLabel(assessment.evidenceTime)}</dd></div><div><dt>审计编号</dt><dd className="ot-mono">{assessment.auditId}</dd></div></dl></div>
                {assessment.reviewStatus === 'pending' ? reviewOpen ? <div className="ot-review-form">
                  <h3>教官复核</h3><label>复核人编号<input aria-label="复核人编号" value={reviewer} disabled={Boolean(busy)} maxLength={80} onChange={(event) => setReviewer(event.target.value)} placeholder="填写教官编号" /></label>
                  <label>复核意见<textarea aria-label="复核意见" value={reason} disabled={Boolean(busy)} maxLength={500} rows={3} onChange={(event) => setReason(event.target.value)} placeholder="填写训练表现与确认或退回依据" /></label>
                  <div className="ot-review-actions"><button className="ot-button" disabled={Boolean(busy)} onClick={() => setReviewOpen(false)}>取消</button><button className="ot-button danger" disabled={Boolean(busy) || !online || reviewer.trim().length < 2 || reason.trim().length < 2} onClick={() => review('rejected')}>退回补训</button><button className="ot-button primary" disabled={Boolean(busy) || !online || reviewer.trim().length < 2 || reason.trim().length < 2} onClick={() => review('confirmed')}><FileCheck2 size={16} />确认并归档</button></div>
                </div> : <footer className="ot-action-bar"><span><ShieldCheck size={15} />人工确认后写入个人档案</span><button className="ot-button primary" onClick={() => setReviewOpen(true)} disabled={Boolean(busy) || !online}><ClipboardCheck size={16} />教官复核</button></footer>
                  : <><div className="ot-reviewed-note"><strong>复核人：{assessment.reviewerId ?? '—'}</strong><p>{assessment.reviewComment}</p></div><footer className="ot-action-bar"><span>复核记录已保留</span>{archive ? <button className="ot-button primary" onClick={() => setStage('archive')}>查看训练档案<ArrowRight size={16} /></button> : <button className="ot-button primary" disabled={Boolean(busy) || !online} onClick={retry}><RotateCcw size={16} />创建复训任务</button>}</footer></>}
              </>}
            </section>}
            {stage === 'archive' && <section className="ot-archive">
              {!archive ? <div className="ot-empty"><FileText size={28} /><h3>尚未生成档案</h3><p>完成教官复核后，档案会在此显示。</p><button className="ot-button" disabled={loading || Boolean(busy)} onClick={() => void load()}>重新同步</button></div> : <>
                <div className="ot-archive-verdict"><span><FileCheck2 size={24} /></span><div><small>训练已归档</small><h3>{selected.subject}</h3></div><b>{archive.result}</b></div>
                <dl className="ot-archive-facts"><div><dt>训练民警</dt><dd>{officerLabel(archive.traineeId)}</dd></div><div><dt>归档时间</dt><dd>{dateLabel(archive.createdAt)}</dd></div><div><dt>档案编号</dt><dd>{archive.recordId}</dd></div><div><dt>审计编号</dt><dd>{archive.auditId}</dd></div></dl>
                <div className="ot-retraining"><h3>后续训练建议</h3><div>{archive.weakPoints.map((item) => <span key={item}>{item}</span>)}</div><p>{archive.retrainingRecommendation}</p></div>
                <footer className="ot-action-bar"><button className="ot-text-button" onClick={() => setMode('archives')}><History size={15} />全部个人档案</button><button className="ot-button primary" disabled={Boolean(busy) || !online} onClick={retry}><RotateCcw size={16} />创建复训任务</button></footer>
              </>}
            </section>}
          </div>
        </>}
      </section>
    </div>}
    <Modal title="登记训练异常" open={exceptionOpen} onCancel={() => { if (!busy) setExceptionOpen(false); }} footer={null} destroyOnHidden>
      <form className="ot-exception-form" onSubmit={(event) => { event.preventDefault(); reportException(); }}>
        <label>异常情况<textarea aria-label="异常情况" rows={4} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} maxLength={500} placeholder="填写设备、场地或训练过程中的异常" disabled={Boolean(busy)} /></label>
        <button className="ot-button primary" disabled={Boolean(busy) || exceptionReason.trim().length < 2 || !online}>提交异常记录</button>
      </form>
    </Modal>
  </main>;
}
