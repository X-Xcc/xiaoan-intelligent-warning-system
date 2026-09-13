import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Clock3, FileText, Headphones, MapPin, Pencil, Radio, RefreshCw, Save, ShieldAlert, UsersRound, Waypoints } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buildIntakeDraft, displayIntakeTime, type IntakeSource } from '../lib/intake-sheet';
import '../styles/intake-sheet.css';
import placeholderAudio from '../assets/intake-hello.wav?url';
import disorderCallAudio from '../assets/intake-disorder-call.wav?url';
import phoneStolenAudio from '../assets/alarm-phone-stolen.mp3?url';
import { CommandScene } from './CommandScene';
import { DemoDispatchMap } from './DemoDispatchMap';
import { demoDispatchData, selectRecommendedUnit } from '../lib/demo-dispatch-data';

type Incident = IntakeSource & { id: string };
type Draft = Record<string, string>;

export function CommandIntakeSheet({ events, refresh }: {
  events: Incident[];
  refresh?: () => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(events[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const audioRef = useRef<HTMLAudioElement>(null);
  const [stage, setStage] = useState<'intake' | 'scene' | 'dispatch'>('intake');
  const [feedback, setFeedback] = useState('');
  const [audioError, setAudioError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dispatchConfirmed, setDispatchConfirmed] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState(() => selectRecommendedUnit(demoDispatchData).id);
  const [selectedCommuteId, setSelectedCommuteId] = useState(() => demoDispatchData.commuteOptions.find((option) => option.recommended)?.id ?? demoDispatchData.commuteOptions[0].id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const event = events.find((item) => item.id === selectedId) ?? events[0];
  const id = event?.id ?? '';
  const audioSource = id === 'YS-DEMO-001'
    ? phoneStolenAudio
    : event?.sourceMode === 'live'
      ? undefined
      : id === 'alarm-demo-001'
        ? disorderCallAudio
        : placeholderAudio;
  const draft = drafts[id] ?? buildIntakeDraft(event ?? {});
  const peopleSummary = draft.caller && draft.people.includes(draft.caller)
    ? draft.people
    : [draft.caller && `报警人：${draft.caller}`, draft.people].filter(Boolean).join('；');

  useEffect(() => {
    if (stage === 'dispatch') headingRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (!events.some((item) => item.id === selectedId)) {
      setSelectedId(events[0]?.id ?? '');
      setStage('intake');
      setEditing(false);
      setDispatchConfirmed(false);
      setSelectedUnitId(selectRecommendedUnit(demoDispatchData).id);
      setSelectedCommuteId(demoDispatchData.commuteOptions.find((option) => option.recommended)?.id ?? demoDispatchData.commuteOptions[0].id);
      setFeedback('');
    }
  }, [events, selectedId]);

  function update(name: string, value: string) {
    setDrafts((previous) => ({ ...previous, [id]: { ...draft, [name]: value } }));
    setFeedback('');
  }

  function field(name: string, label: string, type = 'text', options?: string[]) {
    if (stage === 'intake' && !editing) {
      return <div className={type === 'textarea' ? 'intake-field intake-field-wide' : 'intake-field'} key={name}>
        <span>{label}</span><p className={'intake-value' + (!draft[name] ? ' missing' : '')}>{(type === 'datetime-local' ? draft[name]?.replace('T', ' ') : draft[name]) || '待核实'}</p>
      </div>;
    }
    return <label className={type === 'textarea' ? 'intake-field intake-field-wide' : 'intake-field'} key={name}>
      <span>{label}</span>
      {options ? <select name={name} value={draft[name]} onChange={(e) => update(name, e.target.value)}>
        <option value="">待填写</option>{options.map((option) => <option key={option}>{option}</option>)}
      </select> : type === 'textarea'
        ? <textarea name={name} rows={3} value={draft[name]} onChange={(e) => update(name, e.target.value)} />
        : <input name={name} type={type} min={type === 'number' ? 0 : undefined}
          step={type === 'datetime-local' ? 1 : undefined} value={draft[name]}
          onChange={(e) => update(name, e.target.value)} />}
    </label>;
  }

  function selectIncident(value: string) {
    setSelectedId(value);
    setStage('intake');
    setFeedback('');
    setAudioError('');
    setEditing(false);
    setExpanded(false);
    setDispatchConfirmed(false);
    setSelectedUnitId(selectRecommendedUnit(demoDispatchData).id);
    setSelectedCommuteId(demoDispatchData.commuteOptions.find((option) => option.recommended)?.id ?? demoDispatchData.commuteOptions[0].id);
  }

  if (!event) return <section className="intake-empty">暂无待处置警情
    {refresh && <button type="button" className="ui-icon-button" aria-label="刷新警情" title="刷新警情" onClick={() => void refresh()}><RefreshCw size={16} /></button>}
  </section>;
  if (stage === 'scene') return <CommandScene event={event} draft={draft}
    onNext={() => setStage('dispatch')} />;

  return <div className="intake-layout">
    <aside className="intake-queue" aria-label="待处置警情">
      <div className="intake-section-heading"><h2><Radio size={18} />待处置警情</h2>
      </div>
      <select aria-label="选择警情" value={id} onChange={(e) => selectIncident(e.target.value)}>
        {events.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.bay || item.id} · {item.status || '待分派'}</option>)}
      </select>
      {refresh && <button type="button" className="ui-icon-button" aria-label="刷新警情" title="刷新警情" onClick={() => void refresh()}><RefreshCw size={16} /></button>}
    </aside>
    <main className={'intake-main ' + (stage === 'intake' ? 'intake-overview' : 'intake-dispatch-view') + (editing ? ' is-editing' : '') + (expanded ? ' is-expanded' : '')}>
      {stage === 'dispatch' && <>
        <div className="dispatch-banner">
          <div><h2 ref={headingRef} tabIndex={-1}><Waypoints size={20} />警力调度</h2>
            <p>{draft.number} · {draft.location || '演示辖区 · B 区 07 号点位'} · {draft.risk || '待研判'}</p></div>
          <div className="dispatch-banner-meta"><span className="ui-tag warning">模拟演示</span><span className="ui-tag">本地调度台</span></div>
        </div>
        <p className="dispatch-demo-warning"><ShieldAlert size={15} />脱敏演示数据 · 不对应真实地理位置 · 未执行真实派警</p>
      </>}
      <section className="intake-facts">
      <div className="intake-section-heading"><h2><Radio size={18} />接警四要素</h2><span className="ui-tag success">{event.status || '待分派'}</span></div>
      <dl className="intake-elements" aria-label="警情四要素">
        <div><dt><Clock3 size={16} />时间</dt><dd>{displayIntakeTime(draft.occurredAt) || '待核实'}</dd></div>
        <div><dt><MapPin size={16} />地点</dt><dd>{draft.location || '待核实'}</dd></div>
        <div><dt><UsersRound size={16} />人物</dt><dd>{peopleSummary || '待核实'}</dd></div>
        <div className="intake-attention"><dt><FileText size={16} />注意事项</dt><dd>{draft.attention || '待核实'}</dd></div>
      </dl>
      </section>
      {stage === 'intake' ? <>
        <section className="intake-recording" aria-label="接警录音">
          <div className="intake-section-heading"><h3><Headphones size={18} />接警录音</h3>
          </div>
          {audioSource ? <div className="intake-audio-body"><span className="intake-recording-name">录音编号：{draft.number}-01</span>
            <audio ref={audioRef} key={id} aria-label={`接警录音 ${draft.number}`} controls preload="metadata" src={audioSource}
              onLoadedData={() => setAudioError('')}
              onPlaying={() => setAudioError('')}
              onError={() => setAudioError('录音加载失败，请重试。')} />
          </div> : <p className="intake-audio-empty">此警情未附接警录音</p>}
          {audioError && <p role="alert" className="intake-error">{audioError}<button type="button" className="domain-text-button"
            onClick={() => { setAudioError(''); audioRef.current?.load(); }}><RefreshCw size={14} />重试</button></p>}
        </section>
        <form id="intake-report" className="intake-paper" onSubmit={(e) => { e.preventDefault(); setStage('scene'); setFeedback(''); }}>
          <div className="intake-document-heading"><h2><FileText size={18} />公安机关接警单</h2>
            <button type="button" className="domain-text-button" onClick={() => setEditing(!editing)}>
              {editing ? <Check size={15} /> : <Pencil size={15} />}{editing ? '完成修改' : '修改'}
            </button>
          </div>
          <div className="intake-document-body" tabIndex={expanded || editing ? 0 : undefined} aria-label="接警单内容">
          {!expanded && <div className="intake-fields intake-brief">
            {field('unit', '接警单位')}{field('number', '接警编号')}
            {field('caller', '报警人')}{field('phone', '联系电话')}
            {field('receivedAt', '接警时间', 'datetime-local')}
            {field('category', '警情类型', 'text', ['寻衅滋事类', '刑事案件', '治安案件', '交通事故', '火灾事故', '求助类', '投诉类', '纠纷类', '其他'])}
            {editing && <>{field('occurredAt', '警情发生时间', 'datetime-local')}{field('location', '警情发生地点')}{field('people', '涉事人物')}</>}
            {field('details', '警情内容', 'textarea')}
          </div>}
          {expanded && <>
          <div className="intake-fields">
            {field('unit', '接警单位')}{field('number', '接警编号')}
            {field('receivedAt', '接警时间', 'datetime-local')}{field('receiver', '接警民警')}
            {field('dispatchedAt', '指挥中心派警时间', 'datetime-local')}
          </div>
          <fieldset><legend>一、报警人信息</legend><div className="intake-fields">
            {field('caller', '报警人姓名')}{field('gender', '性别', 'text', ['男', '女', '不详'])}
            {field('phone', '联系电话', 'tel')}{field('address', '住址 / 工作单位')}
            {field('method', '报警方式', 'text', ['小程序报警', '110电话报警', '现场报警', '短信报警', '其他'])}
          </div></fieldset>
          <fieldset><legend>二、警情基本信息</legend><div className="intake-fields">
            {field('occurredAt', '警情发生时间', 'datetime-local')}{field('location', '警情发生地点')}
            {field('category', '警情类型', 'text', ['寻衅滋事类', '刑事案件', '治安案件', '交通事故', '火灾事故', '求助类', '投诉类', '纠纷类', '其他'])}
            {field('people', '涉事人物')}{field('callers', '报警人数', 'number')}{field('involved', '涉案 / 相关人数', 'number')}
          </div></fieldset>
          <fieldset><legend>三、警情详情</legend><div className="intake-fields">
            {field('details', '报警内容、事件经过、现场情况、人员伤亡 / 财产损失、嫌疑人特征', 'textarea')}
          </div></fieldset>
          <fieldset><legend>四、处警处置信息</legend><div className="intake-fields">
            {field('officer', '处警民警')}{field('vehicle', '出警车辆 / 车牌号')}
            {field('policeCount', '处警民警人数', 'number')}{field('assistantCount', '处警辅警人数', 'number')}
            {field('departedAt', '出警时间', 'datetime-local')}
            {field('disposition', '处置情况', 'text', ['已赶赴现场', '现场处置中', '处置完毕', '移交相关部门', '其他'])}
            {field('result', '初步处置结果', 'textarea')}
          </div></fieldset>
          <fieldset><legend>五、备注</legend><div className="intake-fields">
            {field('notes', '备注', 'textarea')}{field('signature', '接警民警签字')}
            {field('reviewer', '审核人签字')}{field('filledAt', '填写日期', 'date')}
          </div></fieldset>
          </>}
          </div>
          <footer className="intake-actions">
            <button type="button" className="domain-text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{expanded ? '收起接警单' : '查看完整接警单'}
            </button>
          </footer>
        </form>
        <section className="intake-next" aria-label="接警下一步">
          <div><span className="intake-muted">当前分级</span><strong className={'intake-risk ' + (draft.risk === '高风险' ? 'danger' : draft.risk === '低风险' ? 'success' : 'warning')}><i />{draft.risk || '待研判'}</strong></div>
          <button className="domain-primary-button" type="submit" form="intake-report">下一步<ArrowRight size={16} /></button>
        </section>
      </> : <section className="dispatch-view" aria-label="脱敏警力调度">
        <div className="dispatch-layout">
          <DemoDispatchMap data={demoDispatchData} selectedUnitId={selectedUnitId} onSelectUnit={setSelectedUnitId} />
          <aside className="dispatch-panel">
            <section className="dispatch-panel-section">
              <div className="dispatch-panel-heading"><h3><ShieldAlert size={16} />最近可调度警力</h3><span>本地演示匹配</span></div>
              {(() => {
                const unit = demoDispatchData.units.find((item) => item.id === selectedUnitId) ?? selectRecommendedUnit(demoDispatchData);
                return <div className="dispatch-unit-summary"><div><strong>{unit.name}</strong><small>{unit.role}</small></div><span className={`ui-tag ${unit.status === '可调度' ? 'success' : 'warning'}`}>{unit.status}</span><p>{unit.distanceLabel} · {unit.etaLabel}</p></div>;
              })()}
            </section>
            <section className="dispatch-panel-section">
              <div className="dispatch-panel-heading"><h3><Waypoints size={16} />推荐通勤方式</h3><span>点击切换方案</span></div>
              <div className="commute-options">
                {demoDispatchData.commuteOptions.map((option) => <button type="button" key={option.id} className={`commute-option ${selectedCommuteId === option.id ? 'selected' : ''}`} aria-pressed={selectedCommuteId === option.id} onClick={() => setSelectedCommuteId(option.id)}>
                  <span><Waypoints size={14} /></span><span><strong>{option.label}{option.recommended ? ' · 推荐' : ''}</strong><small>{option.detail}</small></span><span>{option.distanceLabel}<br />{option.etaLabel}</span>
                </button>)}
              </div>
            </section>
            <section className="dispatch-panel-section">
              <div className="dispatch-recommendation"><strong>当前调度建议</strong>{demoDispatchData.units.find((item) => item.id === selectedUnitId)?.name ?? '快反组 01'} · {demoDispatchData.commuteOptions.find((option) => option.id === selectedCommuteId)?.label}，先抵达北侧入口，再步行进入 B 区。</div>
              <div className="dispatch-flow" aria-label="调度流程">
                {['警情确认', '警力匹配', '路线推荐', '派警确认'].map((label, index) => <div className={`dispatch-flow-step ${index < 3 || dispatchConfirmed ? 'active' : ''}`} key={label}><span>{index < 3 || dispatchConfirmed ? <Check size={13} /> : `0${index + 1}`}</span><b>{label}</b></div>)}
              </div>
            </section>
          </aside>
        </div>
        <form className="intake-dispatch" onSubmit={(e) => { e.preventDefault(); setFeedback('派警意见已保存至本次会话，尚未下发派警指令。'); }}>
          <div className="intake-section-heading"><h2><FileText size={18} />人工复核与派警意见</h2><span className="intake-event-number">{draft.number}</span></div>
          <div className="intake-fields">
            {field('category', '警情分类', 'text', ['寻衅滋事类', '刑事案件', '治安案件', '交通事故', '火灾事故', '求助类', '投诉类', '纠纷类', '其他'])}
            {field('risk', '风险等级', 'text', ['低风险', '中风险', '高风险'])}
            {field('dispatchUnit', '处警单位')}{field('officer', '处警民警')}
            {field('policeCount', '处警民警人数', 'number')}{field('assistantCount', '处警辅警人数', 'number')}
            {field('vehicle', '出警车辆 / 车牌号')}{field('dispatchedAt', '指挥中心派警时间', 'datetime-local')}
            {field('dispatchNote', '派警意见', 'textarea')}
          </div>
          <p className="intake-muted">派警指令须由指挥席人工确认，本页仅保存脱敏演示状态，不下发真实指令。</p>
          <footer className="intake-actions">
            <button type="button" className="domain-secondary-button" onClick={() => { setStage('scene'); setFeedback(''); }}><ArrowLeft size={16} />返回现场核查</button>
            <button type="button" className="domain-primary-button" onClick={() => { setDispatchConfirmed(true); setFeedback('已确认演示派警 · 仅更新本地演示状态，未下发真实指令。'); }} disabled={dispatchConfirmed}><Check size={16} />{dispatchConfirmed ? '已确认演示派警' : '确认演示派警'}</button>
            <button type="submit" className="domain-secondary-button"><Save size={16} />保存派警意见</button>
          </footer>
          <p role="status">{feedback}</p>
        </form>
      </section>}
    </main>
  </div>;
}
