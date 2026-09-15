import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Input, Select, Tag, Tooltip } from 'antd';
import { ArrowLeft, ArrowUpRight, Check, FileCheck2, Monitor, Plus, RefreshCw, Send, ShieldCheck, Upload, X } from 'lucide-react';
import {
  actionAllowed, advanceControl, acceptsResponse, initialControl, localDateTimeInput, RequestLedger, stages, commandRequestId,
  type CommandContext, type CommandEvent, type CommandMode, type CommandResponse,
  type CommandRoute, type ControlState,
} from '../lib/command-workflow';
import { commandAction, commandContext, commandRequest, commandRoute, commandUpload, CommandApiError, protectedMaterial, reconcileCommandRequests } from '../lib/command-api';
import { commandScenario, playbackSnapshot } from '../lib/command-scenario';
import { routePath } from '../lib/presentation';
import { CommandControls } from '../components/command/CommandControls';
import { CommandStageView } from '../components/command/CommandStageView';
import { CommandVoice } from '../components/command/CommandVoice';
import '../styles/command.css';

type Principal = { openid: string; roles: string[]; staffId?: string };
type CommandProps = { onBack?: () => void };
const stageNames = ['接警工单', '导航派警', '盘查核验', '物证同步', '研判移交'];
const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败，请核对回执';

function readControl(): ControlState {
  const params = new URLSearchParams(window.location.search);
  const runKey = params.get('runKey') || 'night-market-local';
  const mode: CommandMode = params.get('mode') === 'playback' ? 'playback' : 'rehearsal';
  const initial = { ...initialControl(runKey, mode), eventId: params.get('eventId') };
  try {
    const stored = JSON.parse(sessionStorage.getItem(`command-control:${runKey}`) || 'null') as ControlState | null;
    const requestedStage = params.get('stage');
    const selected = requestedStage && stages.includes(requestedStage as typeof stages[number])
      ? requestedStage as typeof stages[number] : stored?.stage;
    return stored?.runKey === runKey ? { ...initial, stage: selected || 'b1', reveal: stored.reveal, revision: stored.revision }
      : { ...initial, stage: selected || 'b1' };
  } catch { return initial; }
}

export function CommandOperationsPage({ onBack }: CommandProps) {
  const [control, setControl] = useState(readControl);
  const token = '';
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [events, setEvents] = useState<CommandEvent[]>([]);
  const [snapshot, setSnapshot] = useState<CommandResponse | null>(null);
  const [online, setOnline] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [route, setRoute] = useState<CommandRoute | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newText, setNewText] = useState('');
  const [newBay, setNewBay] = useState('');
  const [materialUrls, setMaterialUrls] = useState<Record<string, string>>({});
  const surface = new URLSearchParams(window.location.search).get('surface');
  const display = surface === 'display';
  const channel = useRef<BroadcastChannel | null>(null);
  const controlRef = useRef(control);
  controlRef.current = control;
  const current = useRef({ id: control.eventId, version: 0, token });
  const mounted = useRef(true);
  const operation = useRef(false);
  const loadSequence = useRef(0);
  const ledger = useMemo(() => new RequestLedger(sessionStorage, `command-pending:${principal?.openid || 'guest'}`), [principal?.openid]);
  const playback = control.mode === 'playback';
  const view = playback ? playbackSnapshot() : snapshot;
  current.current.id = control.eventId;
  current.current.token = token;

  const updateControl = useCallback((next: ControlState) => {
    if (!mounted.current) return;
    setControl(next);
    sessionStorage.setItem(`command-control:${next.runKey}`, JSON.stringify(next));
    const params = new URLSearchParams(window.location.search);
    params.set('runKey', next.runKey); params.set('mode', next.mode);
    if (next.eventId) params.set('eventId', next.eventId); else params.delete('eventId');
    window.history.replaceState({}, '', `${routePath('command-workbench')}?${params}`);
    channel.current?.postMessage({ type: 'control', state: next });
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const connection = new BroadcastChannel(`command:${control.runKey}`);
    channel.current = connection;
    connection.onmessage = (message) => {
      if (message.data?.type === 'sync' && !display) {
        connection.postMessage({ type: 'control', state: controlRef.current });
      }
      const next = message.data?.state as ControlState | undefined;
      if (display && message.data?.type === 'control' && next?.runKey === control.runKey
          && stages.includes(next.stage) && ['rehearsal', 'playback'].includes(next.mode)) {
        setControl({ ...next, reveal: Math.max(0, Math.min(3, Number(next.reveal) || 0)) });
      }
    };
    if (display) connection.postMessage({ type: 'sync' });
    return () => { connection.close(); channel.current = null; };
  }, [control.runKey, display]);

  useEffect(() => {
    if (display || busy || control.paused || control.reveal >= 3) return;
    const timer = window.setTimeout(() => updateControl(advanceControl(control, 'next')), 2000);
    return () => window.clearTimeout(timer);
  }, [control, display, busy, updateControl]);

  useEffect(() => {
    void commandRequest<{ demoEnabled: boolean }>('/command/config', '').then((value) => setDemoEnabled(value.demoEnabled)).catch(() => undefined);
    void commandRequest<{ items: Array<{ id: string; name: string }> }>('/events/staff', '').then((value) => setStaff(value.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setPrincipal(null); setSnapshot(null); setEvents([]); setOnline(false); setError(''); setRoute(null);
    current.current.version = 0;
    loadSequence.current++;
    void commandRequest<Principal>('/command/me', '', { signal: abort.signal })
      .then(setPrincipal).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [token]);

  const load = useCallback(async () => {
    if (!principal || playback || operation.current) return;
    const sequence = ++loadSequence.current;
    const id = control.eventId;
    try {
      const queue = await commandRequest<{ items: CommandEvent[] }>('/command/events', token);
      if (sequence !== loadSequence.current || current.current.token !== token) return;
      setEvents(queue.items);
      if (id) {
        const value = await commandContext(id, token);
        if (sequence !== loadSequence.current || current.current.id !== id || current.current.token !== token) return;
        if (acceptsResponse(id, current.current.version, value)) {
          current.current.version = value.command.version;
          setSnapshot(value);
          setLastSync(new Date().toLocaleTimeString('zh-CN'));
        }
      }
      setOnline(true); setError('');
    } catch (cause) {
      if (sequence !== loadSequence.current || current.current.token !== token) return;
      setOnline(false); setError(errorText(cause));
      if (cause instanceof CommandApiError && [401, 403, 404].includes(cause.status)) setSnapshot(null);
    }
  }, [control.eventId, token, principal, playback]);
  useEffect(() => {
    setSnapshot(null); setRoute(null); setFeedback(''); setError('');
    current.current.version = 0;
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { window.clearInterval(timer); loadSequence.current++; };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    setMaterialUrls({});
    if (!playback && snapshot) {
      for (const item of snapshot.command.evidenceIndex) {
        if (!item.url) continue;
        void protectedMaterial(item.url, token).then((url) => {
          objectUrls.push(url);
          if (cancelled) URL.revokeObjectURL(url);
          else setMaterialUrls((old) => ({ ...old, [item.evidenceId]: url }));
        }).catch(() => undefined);
      }
    }
    return () => { cancelled = true; objectUrls.forEach(URL.revokeObjectURL); };
  }, [snapshot?.command.version, snapshot?.event.id, token, playback]);

  const reconcile = async () => {
    const id = control.eventId;
    if (!id || !principal || operation.current || playback) return;
    operation.current = true; setBusy(true); setError(''); loadSequence.current++;
    try {
      const { snapshot: latest, pendingCount } = await reconcileCommandRequests(id, token, ledger);
      if (current.current.id === id && current.current.token === token) {
        current.current.version = latest.command.version;
        setSnapshot(latest); setOnline(true);
        setFeedback(pendingCount ? '回执尚未确认，原请求编号已保留。'
          : '回执已核对，事件已同步。');
      }
    } catch (cause) { setError(`核对未完成：${errorText(cause)}`); }
    finally { operation.current = false; setBusy(false); }
  };

  const perform = async (action: string, fields: Record<string, unknown>) => {
    if (operation.current || !snapshot || !principal || display
        || !actionAllowed(snapshot.event, principal.roles, action.replace(/\/[^/]+\/review$/, '/review'), control.mode, online)) return false;
    const id = snapshot.event.id;
    operation.current = true; setBusy(true); setError(''); setFeedback('');
    loadSequence.current++;
    let payload: Record<string, unknown> | undefined;
    try {
      payload = ledger.begin(id, action, { ...fields, expectedVersion: snapshot.command.version });
      const result = await commandAction(id, action, payload, token);
      ledger.resolve(id, action);
      if (current.current.token === token && acceptsResponse(current.current.id || '', current.current.version, result)) {
        current.current.version = result.command.version;
        setSnapshot(result); setRoute(null); setFeedback(`已保存 · 审计 ${result.auditId}`);
      }
      return true;
    } catch (cause) {
      if (cause instanceof CommandApiError && cause.status < 500) {
        ledger.resolve(id, action);
        if (current.current.id === id && current.current.token === token) setError(errorText(cause));
      } else if (payload) {
        try {
          const receipt = await commandRequest<CommandResponse>(
            `/command/events/${encodeURIComponent(id)}/receipts/${payload.requestId}`, token);
          ledger.resolve(id, action);
          if (current.current.id === id && current.current.token === token) {
            if (acceptsResponse(id, current.current.version, receipt)) {
              current.current.version = receipt.command.version; setSnapshot(receipt);
            }
            setFeedback(`已核对服务器回执 · ${receipt.auditId}`);
          }
          return true;
        } catch {
          if (current.current.id === id && current.current.token === token)
            setError('请求结果尚未确认，草稿及原请求编号已保留。请核对回执后重试同一动作。');
        }
      } else setError(errorText(cause));
      return false;
    } finally {
      operation.current = false; setBusy(false);
    }
  };

  const create = async (demo: boolean) => {
    if (operation.current || !principal || playback) return;
    const fields = demo ? { runKey: commandRequestId(), scenarioId: commandScenario.scenarioId, scenarioVersion: commandScenario.version }
      : { transcript: newText, bay: newBay };
    operation.current = true; setBusy(true);
    try {
      // Creation requests keep a stable run key across uncertain retries.
      const saved = sessionStorage.getItem(`command-create:${principal.openid}`);
      const payload = saved ? JSON.parse(saved) : { ...fields, requestId: commandRequestId(), demo };
      sessionStorage.setItem(`command-create:${principal.openid}`, JSON.stringify(payload));
      const { demo: isDemo, ...body } = payload;
      const result = await commandRequest<CommandResponse>(`/command/${isDemo ? 'demo-runs' : 'intakes'}`, token,
        { method: 'POST', body: JSON.stringify(body) });
      sessionStorage.removeItem(`command-create:${principal.openid}`);
      setCreateOpen(false); setNewText(''); setNewBay('');
      updateControl({ ...initialControl(result.command.runKey || control.runKey, 'rehearsal'),
        eventId: result.event.id, revision: control.revision + 1 });
      setFeedback(`事件已创建：${result.event.id}`); setError('');
    } catch (cause) {
      if (cause instanceof CommandApiError && cause.status < 500) sessionStorage.removeItem(`command-create:${principal.openid}`);
      setError(errorText(cause));
    } finally { operation.current = false; setBusy(false); }
  };
  const pickEvent = (id: string) => {
    if (operation.current) return;
    updateControl({ ...control, eventId: id, revision: control.revision + 1 });
  };
  const setMode = (mode: CommandMode) => {
    if (operation.current) return;
    updateControl({ ...control, mode, paused: true, revision: control.revision + 1 });
  };
  const openDisplay = () => {
    const params = new URLSearchParams({ surface: 'display', mode: control.mode, runKey: control.runKey });
    if (control.eventId) params.set('eventId', control.eventId);
    window.open(`${routePath('command-workbench')}?${params}`, '_blank');
  };

  if (display) return <main className="command-display-shell">{view
    ? <CommandStageView snapshot={view} stage={control.stage} reveal={control.reveal} display playback={playback} offline={!online && !playback} materialUrls={materialUrls} />
    : <section className="command-display-wait"><Monitor size={56} /><h1>小安 · 等待控屏连接</h1>
      <p>{error || '正在读取事件快照'}</p></section>}</main>;

  return <section className="command-workbench">
    <header className="command-header"><div><span className="command-kicker">小安 / 接处警</span><h1>接处警工作台</h1></div>
      <div className="command-header-actions">
        {onBack && <Button icon={<ArrowLeft size={16} />} onClick={onBack} disabled={busy}>返回接警单</Button>}
        <Select aria-label="工作模式" value={control.mode} disabled={busy}
        onChange={setMode} options={[{ value: 'playback', label: '只读教学回放' }, { value: 'rehearsal', label: '业务联调' }]} />
        <Tooltip title="打开同机大屏"><Button aria-label="打开同机大屏" icon={<Monitor size={17} />} onClick={openDisplay} /></Tooltip></div>
    </header>
    <div className="command-status" role="status" aria-live="polite">
      <Tag color={playback ? 'gold' : online ? 'green' : 'red'}>{playback ? '只读回放，不写业务' : online ? '接口在线' : '离线 / 未同步'}</Tag>
      <span>{error || feedback || (lastSync && !playback ? `最后同步 ${lastSync}` : '教学场景 V1.0')}</span>
      {!playback && <Tooltip title="刷新队列及当前事件"><Button aria-label="刷新接处警" icon={<RefreshCw size={15} />} onClick={() => void load()} disabled={busy} /></Tooltip>}
      {!playback && control.eventId && ledger.pending(control.eventId).length > 0
        && <Button icon={<RefreshCw size={15} />} disabled={busy || !principal} onClick={() => void reconcile()}>核对待确认回执</Button>}
    </div>
    <div className={`command-layout ${playback ? 'command-layout-playback' : ''}`}>
      {!playback && <aside className="command-queue"><div className="command-section-heading"><h2>事件队列</h2><b>{events.length}</b></div>
        <div className="command-queue-actions"><Button icon={<Plus size={15} />} disabled={busy || !principal} onClick={() => setCreateOpen(!createOpen)}>登记接警</Button>
          {demoEnabled && <Button disabled={busy || !principal} onClick={() => void create(true)}>新建教学轮次</Button>}</div>
        {createOpen && <div className="command-new-intake"><label>报警地点<Input value={newBay} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewBay(e.target.value)} maxLength={80} /></label>
          <label>接警文本<Input.TextArea value={newText} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewText(e.target.value)} rows={4} /></label>
          <Button type="primary" disabled={busy || !newBay.trim() || !newText.trim()} onClick={() => void create(false)}>保存新接警</Button></div>}
        {events.map((item) => <button key={item.id} type="button" className={item.id === control.eventId ? 'active' : ''}
          disabled={busy} onClick={() => pickEvent(item.id)}><strong>{item.title}</strong><span>{item.bay}</span><small>{item.id}</small><b>{item.status}</b></button>)}
        {!events.length && <p>{principal ? '暂无事件' : '正在连接事件服务'}</p>}
      </aside>}
      <div className="command-main">
        <CommandVoice key={`${principal?.openid || 'guest'}:${control.mode}`}
          eventId={control.eventId} snapshot={snapshot} events={events} stage={control.stage} playback={playback} online={online} />
        <CommandControls value={control} onChange={updateControl} disabled={busy} />
        {view ? <CommandStageView snapshot={view} stage={control.stage} reveal={surface === 'control' || playback ? control.reveal : 3}
          route={route} playback={playback} offline={!playback && !online} materialUrls={materialUrls} />
          : <div className="command-empty"><FileCheck2 size={44} /><h2>选择接警事件</h2><p>当前没有可展示的事件快照</p></div>}
        {!playback && snapshot && <CommandActions key={`${snapshot.event.id}:${principal?.openid}`} snapshot={snapshot}
          roles={principal?.roles || []} token={token} stage={control.stage} busy={busy} online={online} staff={staff}
          perform={perform} onPreview={async (id) => {
            const eventId = snapshot.event.id; const version = snapshot.command.version;
            try {
              const result = await commandRoute(eventId, id, token);
              if (current.current.id === eventId && current.current.version === version && current.current.token === token) setRoute(result.route);
            } catch (cause) { if (current.current.id === eventId) setError(errorText(cause)); }
          }} />}
        {!playback && snapshot?.event.timeline && <details className="command-audit"><summary>事件审计 · {snapshot.event.timeline.length} 条</summary>
          <ol>{snapshot.event.timeline.map((item) => <li key={item.id}><b>#{item.id} {item.action}</b><span>{item.operator}</span><time>{item.createdAt}</time></li>)}</ol></details>}
      </div>
    </div>
  </section>;
}

function CommandActions({ snapshot, stage, roles, token, busy, online, staff, perform, onPreview }: {
  snapshot: CommandResponse; stage: string; roles: string[]; token: string; busy: boolean; online: boolean;
  staff: Array<{ id: string; name: string }>;
  perform: (action: string, fields: Record<string, unknown>) => Promise<boolean>;
  onPreview: (staff: string) => Promise<void>;
}) {
  const { command, event } = snapshot;
  const [text, setText] = useState(command.intake.transcript);
  const [bay, setBay] = useState(command.intake.locationText);
  const [lat, setLat] = useState(String(command.intake.coordinates?.latitude ?? ''));
  const [lon, setLon] = useState(String(command.intake.coordinates?.longitude ?? ''));
  const [summary, setSummary] = useState(command.summary.text);
  const [category, setCategory] = useState(command.summary.category);
  const [danger, setDanger] = useState(command.summary.dangerFactors.join('；'));
  const [staffId, setStaffId] = useState(command.dispatch?.staffId || 'wang');
  const [query, setQuery] = useState(command.verification?.subjectName || '');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [discovered, setDiscovered] = useState(() => localDateTimeInput());
  const [handover, setHandover] = useState(command.handover?.summary || '');
  const [result, setResult] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<{ uploadId: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const allowed = (action: string) => !busy && !uploading && actionAllowed(event, roles, action, 'rehearsal', online);
  const nextStatus: Record<string, string> = { 已派单: '已接收', 已接收: '已到达', 已到达: '处理中', 处理中: '已完成' };
  const verification = command.verification;
  const dirtyIntake = text !== command.intake.transcript || bay !== command.intake.locationText
    || lat !== String(command.intake.coordinates?.latitude ?? '') || lon !== String(command.intake.coordinates?.longitude ?? '');
  const register = async () => {
    if (!allowed('evidence')) return;
    setUploading(true); setUploadError('');
    try {
      let uploaded = receipt;
      if (file && !uploaded) { uploaded = (await commandUpload(event.id, file, token)).evidence; setReceipt(uploaded); }
      const ok = await perform('evidence', { kind: file ? file.type.startsWith('video/') ? 'video' : 'image' : 'note',
        name: name || uploaded?.name || '现场记录', description: note, discoveredAt: new Date(discovered).toISOString(),
        ...(uploaded ? { uploadId: uploaded.uploadId } : {}) });
      if (ok) { setNote(''); setName(''); setFile(null); setReceipt(null); }
    } catch (cause) { setUploadError(errorText(cause)); }
    finally { setUploading(false); }
  };
  return <section className="command-actions"><header><h3>{stageNames[stages.indexOf(stage as typeof stages[number])]} · 业务操作</h3><span>版本 {command.version} · {event.status}</span></header>
    {nextStatus[event.status] && <div className="command-field-status">
      {event.status === '处理中' && <label>现场处置结果<Input.TextArea value={result} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setResult(e.target.value)} rows={2} /></label>}
      <Button icon={<Check size={16} />} disabled={!allowed('status') || (event.status === '处理中' && (!result.trim() || command.handover?.status !== 'accepted'))}
        onClick={() => void perform('status', { status: nextStatus[event.status], result })}>{event.status === '处理中' ? '提交结果并完成现场任务' : nextStatus[event.status] === '已接收' ? '接收任务' : nextStatus[event.status] === '已到达' ? '确认到场' : '开始处置'}</Button>
    </div>}
    {stage === 'b1' && <div className="command-form">
      <label className="command-form-wide">接警文本<Input.TextArea value={text} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)} rows={3} /></label>
      <label>报警地点<Input value={bay} onChange={(e: ChangeEvent<HTMLInputElement>) => setBay(e.target.value)} maxLength={80} /></label>
      <label>坐标（可留空）<div className="command-coordinate"><Input aria-label="纬度" value={lat} onChange={(e: ChangeEvent<HTMLInputElement>) => setLat(e.target.value)} placeholder="纬度" />
        <Input aria-label="经度" value={lon} onChange={(e: ChangeEvent<HTMLInputElement>) => setLon(e.target.value)} placeholder="经度" /></div></label>
      <Button disabled={!allowed('intake') || !text.trim() || !bay.trim()} onClick={() => void perform('intake', {
        transcript: text, locationText: bay, latitude: lat.trim() ? Number(lat) : null, longitude: lon.trim() ? Number(lon) : null,
      })}>保存接警修订</Button>
      <label className="command-form-wide">警情摘要<Input.TextArea value={summary} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setSummary(e.target.value)} rows={2} /></label>
      <label>警情类别<Input value={category} onChange={(e: ChangeEvent<HTMLInputElement>) => setCategory(e.target.value)} /></label>
      <label>危险因素<Input value={danger} onChange={(e: ChangeEvent<HTMLInputElement>) => setDanger(e.target.value)} /></label>
      <Button type="primary" icon={<ShieldCheck size={16} />} disabled={!allowed('summary/confirm') || dirtyIntake || !summary.trim() || !danger.trim()
        || command.summary.reviewStatus === 'confirmed'} onClick={() => void perform('summary/confirm', {
          summaryVersion: command.summary.version, text: summary, category, dangerFactors: [danger], riskTags: command.summary.riskTags,
        })}>确认警情摘要</Button>
    </div>}
    {stage === 'b2' && <div className="command-form">
      <label>处警负责人<Select aria-label="处警负责人" value={staffId} onChange={setStaffId} disabled={busy || Boolean(command.dispatch?.dispatchedAt)}
        options={staff.map((item) => ({ value: item.id, label: item.name }))} /></label>
      <div className="command-button-row"><Button disabled={!allowed('dispatch/confirm')} onClick={() => void onPreview(staffId)}>预览路线</Button>
        <Button disabled={!allowed('dispatch/confirm')} onClick={() => void perform('dispatch/confirm', {
          staffId, summaryVersion: command.summary.version, locationVersion: command.intake.locationVersion,
        })}>确认分级派警建议</Button>
        <Button type="primary" icon={<Send size={16} />} disabled={!allowed('dispatch') || command.dispatch?.staffId !== staffId}
          onClick={() => void perform('dispatch', { recommendationId: command.dispatch?.recommendationId })}>下达派警</Button></div>
    </div>}
    {stage === 'b3' && <div className="command-form">
      <label>教学档案编号或姓名<Input value={query} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} placeholder="例如：教学档案-03" /></label>
      <Button disabled={!allowed('verification') || !query.trim()} onClick={() => void perform('verification', { query })}>查询核验线索</Button>
      <label className="command-form-wide">人工核查说明<Input.TextArea value={reason} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)} rows={2} /></label>
      <div className="command-button-row">
        {(['confirmed', 'no_match', 'fallback'] as const).map((decision, index) => <Button key={decision}
          disabled={!allowed('verification/review') || verification?.resultStatus !== 'pending'
            || (decision === 'confirmed' && verification?.lookupStatus !== 'matched')
            || (decision === 'no_match' && verification?.lookupStatus !== 'no_match') || (decision === 'fallback' && !reason.trim())}
          onClick={() => void perform(`verification/${verification?.verificationId}/review`, { decision, reason })}>
          {['确认核验线索', '登记无匹配', '转人工核查'][index]}</Button>)}
      </div>
    </div>}
    {stage === 'b4' && <div className="command-form">
      <label>材料名称<Input value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} /></label>
      <label>发现时间（本地时区）<input type="datetime-local" value={discovered} onChange={(e) => setDiscovered(e.target.value)} /></label>
      <label className="command-form-wide">现场说明<Input.TextArea value={note} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)} rows={3} /></label>
      <label className="command-file"><Upload size={18} />选择图片或视频<input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
        disabled={!allowed('evidence')} onChange={(e) => { setFile(e.target.files?.[0] || null); setReceipt(null); e.target.value = ''; }} /></label>
      {file && <div>{file.name} {receipt ? '已上传，待登记' : '待上传'}<Button aria-label="删除待上传项" icon={<X size={14} />} disabled={uploading}
        onClick={() => { setFile(null); setReceipt(null); }} /></div>}
      <Button type="primary" loading={uploading} disabled={!allowed('evidence') || (!file && !note.trim()) || !discovered} onClick={() => void register()}>
        {receipt ? '登记已上传材料' : '登记现场材料'}</Button>
      {uploadError && <p role="alert">{uploadError}</p>}
      <div className="command-form-wide command-material-records">{command.evidenceIndex.map((item) =>
        <div key={item.evidenceId}><FileCheck2 size={16} /><b>{item.name}</b><span>{item.evidenceId}</span></div>)}</div>
    </div>}
    {(stage === 'handover' || stage === 'b4') && <div className="command-transfer">
      <label>移交摘要<Input.TextArea value={handover} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setHandover(e.target.value)} rows={2} /></label>
        <Button type="primary" icon={<ArrowUpRight size={16} />} disabled={!allowed('handover') || !handover.trim() || !command.evidenceIndex.length
          || !['confirmed', 'no_match', 'fallback'].includes(verification?.resultStatus || '')}
          onClick={() => void perform('handover', { summary: handover, evidenceIds: command.evidenceIndex.map((item) => item.evidenceId) })}>提交研判移交</Button>
      {command.handover && <div className="command-handover-receipt"><Tag>{command.handover.status}</Tag><span>{command.handover.handoverId} · 第 {command.handover.version} 版</span>
        {command.handover.rejectionReason && <p>退回原因：{command.handover.rejectionReason}</p>}</div>}
      <label>退回原因<Input.TextArea value={reason} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)} rows={2} /></label>
        <div className="command-button-row"><Button type="primary" disabled={!allowed('handover/review')} onClick={() =>
          void perform(`handover/${command.handover?.handoverId}/review`, { decision: 'accepted' })}>接收研判移交</Button>
        <Button danger disabled={!allowed('handover/review') || !reason.trim()} onClick={() =>
          void perform(`handover/${command.handover?.handoverId}/review`, { decision: 'rejected', reason })}>退回补正</Button></div>
    </div>}
  </section>;
}
