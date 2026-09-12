import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock3, LoaderCircle, ListChecks, RefreshCw, RotateCcw, ShieldCheck,
  Timer, UserRound,
} from 'lucide-react';
import { Skeleton, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TrainingCameraPreview } from '../components/TrainingCameraPreview';
import type { TrainingSnapshot, TrainingTask } from '../lib/training-api';
import { demoTrainingSelection, trainingDemo } from '../lib/training-demo';
import {
  buildGroupSubjects, buildGroupSummaries, GROUP_PARTICIPANTS, GROUP_SUBJECT_NAMES,
  type GroupTrainingPhase, type GroupTrainingSummary, type GroupTrainingSubject,
} from '../lib/training-group-demo';
import { readTrainingSelection } from '../lib/training-navigation';
import { appBasePath } from '../lib/presentation';
import { XiaoanVoiceControls, useXiaoanVoice } from '../components/XiaoanVoice';
import { trainingPassKey } from '../lib/xiaoan-voice-rules';
import { getTrainingRecommendations } from '../lib/training-recommendations';

const emptySnapshot: TrainingSnapshot = { dataMode: '', tasks: [], assessments: [], archives: [] };
const readableError = (error: unknown) => error instanceof Error && error.message !== 'Failed to fetch'
  ? error.message : '虚拟训练数据读取失败，请重试或重置演示。';
const fallbackTask = (subject: GroupTrainingSubject): TrainingTask => ({
  taskId: subject.taskIds[0] ?? `GROUP-DEMO-${subject.subject}`,
  subject: subject.subject,
  traineeId: GROUP_PARTICIPANTS[0].officerId,
  teamName: '三人协同演示组',
  equipment: [],
  standard: { label: '演示训练记录' },
  basis: ['固定三人协同演示'],
  status: '待训练',
});

function TrainingLoading({ label }: { label: string }) {
  return <div className="ot-loading-placeholder" role="status" aria-label={label}>
    <div className="ot-loading-caption"><Spin size="small" /><span>{label}</span></div>
    <Skeleton active title={{ width: '42%' }} paragraph={{ rows: 4, width: ['90%', '100%', '76%', '84%'] }} />
    <Skeleton active title={false} paragraph={{ rows: 3, width: ['96%', '82%', '65%'] }} />
  </div>;
}

function GroupSummary({ items }: { items: GroupTrainingSummary[] }) {
  return <section className="ot-group-summary" aria-labelledby="ot-group-summary-title">
    <header className="ot-group-summary-heading">
      <div><span><ClipboardCheck size={18} />训练总结</span><h3 id="ot-group-summary-title">三人协同训练评分</h3></div>
      <strong>三项科目已完成</strong>
    </header>
    <div className="ot-group-summary-list">
      {items.map((item) => <article className="ot-group-summary-row" key={item.officerId}>
        <div className="ot-group-summary-person"><UserRound size={18} /><div><strong>{item.label}</strong><small>{item.officerId}</small></div></div>
        <div className="ot-group-summary-score"><span>训练总分</span><strong>{item.total}<small>/ 100</small></strong></div>
        <div className="ot-group-summary-notes">
          <section><h4>优点</h4><p>{item.strengths.join('；')}</p></section>
          <section><h4>缺点</h4><p>{item.weaknesses.join('；')}</p></section>
        </div>
      </article>)}
    </div>
  </section>;
}

export function OfficerTrainingPage({ onSituation }: { onSituation: () => void }) {
  const { speak, stop: stopVoice } = useXiaoanVoice();
  const previousPass = useRef<string | null | undefined>(undefined);
  const initial = demoTrainingSelection(readTrainingSelection(window.location.search));
  const [snapshot, setSnapshot] = useState<TrainingSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [phase, setPhase] = useState<GroupTrainingPhase>('prepare');
  const [subjectIndex, setSubjectIndex] = useState(0);
  const [completedSubjectIndexes, setCompletedSubjectIndexes] = useState<number[]>([]);
  const [summary, setSummary] = useState<GroupTrainingSummary[] | null>(null);
  const stagePanelRef = useRef<HTMLDivElement>(null);
  const groupSubjects = useMemo(() => buildGroupSubjects(snapshot.tasks), [snapshot.tasks]);
  const currentSubject = groupSubjects[subjectIndex];
  const currentTask = snapshot.tasks.find((task) => task.taskId === currentSubject?.taskIds[0])
    ?? (currentSubject ? fallbackTask(currentSubject) : undefined);
  const recommendations = currentTask ? getTrainingRecommendations(currentTask) : undefined;
  const progressLabel = phase === 'summary'
    ? '总结评分'
    : `${subjectIndex + 1} / ${GROUP_SUBJECT_NAMES.length} · ${phase === 'prepare' ? '科目建议' : '训练记录'}`;
  const routeOfficer = initial.officerId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await trainingDemo.snapshot();
      setSnapshot(next);
      const passKey = trainingPassKey(next);
      if (previousPass.current === null && passKey) void speak('training-passed', passKey);
      previousPass.current = passKey;
      setOnline(true);
      setLastSync(new Date());
      setError('');
    } catch (cause) {
      setOnline(false);
      previousPass.current = undefined;
      setError(readableError(cause));
    } finally {
      setLoading(false);
    }
  }, [speak]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => () => stopVoice(), [stopVoice]);
  useEffect(() => {
    stagePanelRef.current?.scrollTo({ top: 0 });
  }, [phase, subjectIndex]);

  const resetFlow = () => {
    setPhase('prepare');
    setSubjectIndex(0);
    setCompletedSubjectIndexes([]);
    setSummary(null);
    setFeedback('演示流程已回到第一个科目');
    setError('');
  };

  const nextStep = () => {
    if (!online || loading) return;
    if (phase === 'prepare') {
      setPhase('run');
      setFeedback('');
      return;
    }
    const nextCompleted = [...new Set([...completedSubjectIndexes, subjectIndex])].sort((a, b) => a - b);
    setCompletedSubjectIndexes(nextCompleted);
    if (subjectIndex < GROUP_SUBJECT_NAMES.length - 1) {
      setSubjectIndex(subjectIndex + 1);
      setPhase('prepare');
      setFeedback(`${GROUP_SUBJECT_NAMES[subjectIndex]}训练记录完成，进入下一项`);
      return;
    }
    const summarySubjects = groupSubjects.map((subject, index) => nextCompleted.includes(index)
      ? { ...subject, participantTasks: subject.participantTasks?.map((task) => ({ ...task, completed: Boolean(task.taskId) })) }
      : subject);
    setSummary(buildGroupSummaries(summarySubjects, nextCompleted));
    setPhase('summary');
    setFeedback('三项训练完成，已生成三人总结评分');
  };

  const previousStep = () => {
    if (phase === 'summary') return;
    if (phase === 'run') {
      setPhase('prepare');
      setFeedback('');
    } else if (subjectIndex > 0) {
      setSubjectIndex(subjectIndex - 1);
      setPhase('run');
      setFeedback('');
    }
  };

  return <main className="officer-training-workspace">
    <header className="ot-topbar">
      <div className="ot-brand"><img src={`${appBasePath}/yanhuo-shaobing-mark.png`} alt="" /><span>公安 AI<span className="ot-brand-divider">/</span><b>训练中心</b></span></div>
      <nav className="ot-top-actions" aria-label="训练工作区导航">
        <XiaoanVoiceControls />
        <button type="button" className="ot-button" onClick={onSituation}><ArrowLeft size={16} /><span>返回勤务态势</span></button>
      </nav>
    </header>
    <section className="ot-overview">
      <div className="ot-title-row">
        <div><nav className="ot-breadcrumb" aria-label="训练层级"><button type="button" onClick={onSituation}>A1 勤务态势</button><ChevronRight size={12} /><span>三人协同训练演示</span></nav><h1>三人协同训练演示</h1></div>
        <div className="ot-context">
          <span className="ot-group-mode"><UserRound size={16} />固定三人小组 · {routeOfficer ? '已接入' : '演示'}</span>
          <Tooltip title="刷新训练数据"><button className="ot-icon-button" aria-label="刷新训练数据" disabled={loading} onClick={() => void load()}><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></Tooltip>
          <Tooltip title="重置演示流程"><button className="ot-icon-button" aria-label="重置演示流程" disabled={loading} onClick={resetFlow}><RotateCcw size={17} /></button></Tooltip>
        </div>
      </div>
      <dl className="ot-metrics">
        <div><dt>参训人员</dt><dd>{GROUP_PARTICIPANTS.length}<span>人</span></dd></div>
        <div><dt>训练科目</dt><dd className="ot-accent">{GROUP_SUBJECT_NAMES.length}<span>项</span></dd></div>
        <div><dt>已完成</dt><dd>{completedSubjectIndexes.length}<span>项</span></dd></div>
        <div><dt>流程状态</dt><dd className="ot-green">{phase === 'summary' ? '已完成' : '进行中'}</dd></div>
      </dl>
    </section>
    <div className="ot-subnav">
      <div><span className="ot-group-subnav-label"><ListChecks size={16} />三人协同训练流程</span></div>
      <span className={`ot-sync ${online ? 'online' : ''}`}><i />{online ? '本地演示 · 不写入业务数据' : loading ? '正在加载虚拟数据' : '虚拟数据待加载'}{lastSync ? ` · ${lastSync.toLocaleTimeString('zh-CN', { hour12: false })}` : ''}</span>
    </div>
    {(error || feedback) && <div className={`ot-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
      {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<span>{error || feedback}</span>
      {error && <button type="button" onClick={() => void load()} disabled={loading}>重新同步</button>}
    </div>}
    <div className="ot-workbench ot-group-workbench">
      <aside className="ot-task-rail ot-group-rail">
        <div className="ot-rail-heading"><h2>参训人员</h2><span>{GROUP_PARTICIPANTS.length} 人</span></div>
        <div className="ot-group-members">
          {GROUP_PARTICIPANTS.map((participant) => <div className="ot-group-member" key={participant.officerId}><span><UserRound size={16} /></span><strong>{participant.label}</strong><small>{participant.officerId}</small></div>)}
        </div>
        <div className="ot-group-rail-sequence"><strong>科目顺序</strong>{GROUP_SUBJECT_NAMES.map((subject, index) => <div key={subject} className={index === subjectIndex && phase !== 'summary' ? 'active' : completedSubjectIndexes.includes(index) ? 'done' : ''}><span>{index + 1}</span><b>{subject}</b></div>)}<div className={phase === 'summary' ? 'active' : ''}><span>总</span><b>总结评分</b></div></div>
        <div className="ot-rail-bottom"><ShieldCheck size={15} /><span>本页仅用于三人协同训练演示</span></div>
      </aside>
      <section className="ot-detail">
        <div ref={stagePanelRef} id="ot-stage-panel" role="tabpanel" aria-busy={loading} className="ot-stage-panel">
          {loading && !lastSync ? <TrainingLoading label="正在读取三人训练演示" /> : <div className="ot-stage-content">
            {phase === 'summary' && summary ? <GroupSummary items={summary} /> : phase === 'prepare' && recommendations && currentTask ? <section className="ot-preparation">
              <section className="ot-recommendations" aria-labelledby="ot-recommendations-title">
                <header className="ot-recommendations-heading">
                  <div><span><BookOpen size={18} />科目建议</span><h3 id="ot-recommendations-title">{currentSubject?.subject}</h3></div>
                  <span>{recommendations.items.length} 项<Clock3 size={14} />建议约 {recommendations.items.reduce((total, item) => total + item.minutes, 0)} 分钟</span>
                </header>
                <ol className="ot-drill-list">{recommendations.items.map((item, index) => <li key={item.id}>
                  <span className="ot-drill-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="ot-drill-content"><div className="ot-drill-heading"><h4>{item.title}</h4><span>{index === 0 ? '优先练习' : '配套练习'} · {item.minutes} 分钟</span></div><p>{item.goal}</p><dl><div><dt>练习安排</dt><dd>{item.practice}</dd></div><div><dt>完成检查</dt><dd>{item.check}</dd></div></dl></div>
                </li>)}</ol>
                <div className="ot-training-standard"><ClipboardCheck size={16} /><span>演示训练标准</span><strong>{currentTask.standard.label}</strong></div>
                <p className="ot-recommendation-safety"><ShieldCheck size={16} /><span>{recommendations.safety}</span></p>
              </section>
            </section> : phase === 'run' && currentTask ? <section className="ot-execution">
              <div className="ot-recording-layout"><TrainingCameraPreview key={currentTask.taskId} taskId={currentTask.taskId} officer="三人协同训练小组" teamName="演示训练组" /></div>
              <div className="ot-group-recording-note"><Timer size={18} /><div><strong>训练记录进行中</strong><p>本阶段完成后点击“下一步”，直接进入下一项科目。三项完成后统一生成三人总分。</p></div></div>
            </section> : <div className="ot-empty"><ClipboardCheck size={30} /><h2>演示数据暂不可用</h2><p>请重新同步虚拟训练数据后继续。</p><button className="ot-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />重新同步</button></div>}
          </div>}
        </div>
        <footer className="ot-next-bar">
          <span>{progressLabel}</span>
          <div className="ot-next-actions">
            {phase !== 'summary' && <button className="ot-button" onClick={previousStep} disabled={loading || (phase === 'prepare' && subjectIndex === 0)}><ArrowLeft size={16} />上一步</button>}
            {phase === 'summary'
              ? <button className="ot-button primary" onClick={resetFlow}><CheckCircle2 size={16} />完成演示</button>
              : <button className="ot-button primary" onClick={nextStep} disabled={loading || !online}>{loading ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}{phase === 'prepare' ? '下一步' : subjectIndex === GROUP_SUBJECT_NAMES.length - 1 ? '生成总结评分' : '下一项'}</button>}
          </div>
        </footer>
      </section>
    </div>
  </main>;
}
