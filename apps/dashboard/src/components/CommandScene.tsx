import { ArrowRight, Camera, Check, ClipboardCheck, MapPin, Maximize2, Radio, RefreshCw, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { IntakeSource } from '../lib/intake-sheet';
import '../styles/command-scene.css';

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');
type CameraSource = { id: string; online?: boolean; feedUrl?: string; area?: string };
const cameraViews = [
  { id: 'robot-dog-01', title: '机械狗画面', code: 'ROBOT-DOG-01', preview: '/night-market-cam-02.png' },
  { id: 'cam-003', title: '监控画面', code: 'CCTV-03', preview: '/night-market-cam-03.png' },
];
type ScenePerson = { name: string; role: string; code: string; age: string; identity: string; address: string; history: string };
// Fictional case profiles only; these are not identity or criminal-record lookup results.
const peopleByEvent: Record<string, ScenePerson[]> = {
  'alarm-demo-001': [
    { name: '李某', role: '涉事人员', code: 'P-001', age: '32岁', identity: '******1994****001*', address: '示例市XX区XX街道甲小区*栋*室', history: '有滋扰纠纷记录，详情待核验' },
    { name: '周某', role: '涉事人员', code: 'P-002', age: '29岁', identity: '******1997****002*', address: '示例市XX区XX街道乙小区*栋*室', history: '暂未提供相关记录，待核验' },
  ],
  'alarm-demo-002': [
    { name: '张某', role: '纠纷当事人', code: 'P-003', age: '41岁', identity: '******1985****003*', address: '示例市XX区XX街道丙小区*栋*室', history: '暂未提供相关记录，待核验' },
    { name: '陈某', role: '纠纷当事人', code: 'P-004', age: '36岁', identity: '******1990****004*', address: '示例市XX区XX街道丁小区*栋*室', history: '暂未提供相关记录，待核验' },
  ],
  'alarm-demo-003': [{ name: '刘某', role: '报警人 / 涉事人员', code: 'P-005', age: '45岁', identity: '******1981****005*', address: '示例市XX区XX街道戊小区*栋*室', history: '暂未提供相关记录，待核验' }],
  'alarm-demo-004': [{ name: '吴某', role: '活动组织人', code: 'P-006', age: '38岁', identity: '******1988****006*', address: '示例市XX区XX街道己小区*栋*室', history: '暂未提供相关记录，待核验' }],
};

export function CommandScene({ event, draft, onNext }: {
  event: IntakeSource & { id: string };
  draft: Record<string, string>;
  onNext: () => void;
}) {
  const [cameras, setCameras] = useState<CameraSource[]>([]);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const people = peopleByEvent[event.id] ?? [{ name: draft.caller || '未提供', role: '报警人', code: 'unknown', age: '待核验', identity: '待核验', address: '待核验', history: '待核验' }];
  const person = people[selectedPerson] ?? people[0];
  const needsProtection = /寻衅滋事|纠纷/.test(draft.category);
  const recommendations = [
    { title: '警力配置', detail: `建议民警${draft.policeCount || '待定'}名、辅警${draft.assistantCount || '待定'}名；车辆：${draft.vehicle || '待配置'}。责任人员：${draft.officer || '待分派'}。` },
    { title: '装备携带', detail: `执法记录仪、对讲机、反光背心、急救包${needsProtection ? '；另备防护头盔、防护背心及盾牌。' : '，出发前检查电量和通信。'}` },
    { title: '支援保障', detail: needsProtection ? '建议邻近巡逻组备勤，保持通信畅通；如有人员受伤，协调医疗救助。增援由指挥席确认。' : '保持与指挥席联系，按现场情况申请增援；如有人员身体不适，协调医疗救助。' },
  ];

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    setLoading(true);
    setFailed({});
    async function load() {
      try {
        const response = await fetch(`${apiBase}/security-video/status`, { signal: controller.signal });
        if (!response.ok) throw new Error('Video status unavailable');
        const payload = await response.json() as { cameras?: CameraSource[] };
        if (active) setCameras(Array.isArray(payload.cameras) ? payload.cameras : []);
      } catch {
        if (active) setCameras([]);
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [retry]);

  useEffect(() => {
    if (expanded) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [expanded]);

  function renderFeed(view: typeof cameraViews[number]) {
    const source = cameras.find((item) => item.id === view.id);
    const connected = source?.online === true && !failed[view.id] && !loading;
    const feed = source?.feedUrl
      ? new URL(source.feedUrl, `${apiBase.replace(/\/api$/, '')}/`).href
      : `${apiBase}/security-video/feed?cam=${view.id}`;
    return <>
      <div className="scene-feed-frame">
        <img key={`${view.id}:${connected}:${retry}`} src={connected ? feed : view.preview}
          alt={connected ? `${view.title}视频流` : `${view.title}参考画面`}
          onError={(e) => {
            if (connected) setFailed((previous) => ({ ...previous, [view.id]: true }));
            else e.currentTarget.style.visibility = 'hidden';
          }} />
        <span className="scene-feed-code">{view.code}</span>
        <span className={'scene-feed-state ' + (connected ? 'connected' : '')}>
          {loading ? '连接中' : connected ? '视频已连接' : '未连接 · 参考画面'}
        </span>
      </div>
      <div className="scene-feed-caption"><span>{source?.area || '视频来源未关联现场位置'}</span></div>
    </>;
  }

  return <section className="command-scene" aria-label="现场处置">
    <header className="scene-heading">
      <div><h2 ref={titleRef} tabIndex={-1}><Radio size={20} />现场</h2>
        <p><MapPin size={14} />{draft.location}<span>{draft.number}</span></p></div>
    </header>
    <div className="scene-columns">
      {cameraViews.map((view) => <section className="scene-camera" key={view.id}>
        <div className="scene-section-heading"><h3><Camera size={17} />{view.title}</h3>
          <div className="scene-tools">
            <button type="button" className="ui-icon-button" title={`重连${view.title}`} aria-label={`重连${view.title}`} disabled={loading} onClick={() => setRetry((value) => value + 1)}><RefreshCw size={15} /></button>
            <button type="button" className="ui-icon-button" title={`放大${view.title}`} aria-label={`放大${view.title}`} onClick={() => setExpanded(view.id)}><Maximize2 size={15} /></button>
          </div>
        </div>
        {renderFeed(view)}
      </section>)}
      <aside className="scene-identity">
        <div className="scene-section-heading"><h3><UserRound size={17} />身份卡</h3><span className="ui-tag warning">待核验</span></div>
        <label className="scene-person-select"><span>关联人员</span>
          <select aria-label="选择关联人员" value={selectedPerson} onChange={(e) => setSelectedPerson(Number(e.target.value))}>
            {people.map((item, index) => <option key={item.code} value={index}>{item.name} · {item.role}</option>)}
          </select>
        </label>
        <dl className="scene-person-details">
          <div><dt>姓名</dt><dd className="scene-person-name">{person.name}</dd></div>
          <div><dt>年龄</dt><dd>{person.age}</dd></div>
          <div><dt>身份证号码</dt><dd>{person.identity}</dd></div>
          <div><dt>家庭住址</dt><dd>{person.address}</dd></div>
          <div><dt>前科劣迹</dt><dd>{person.history}</dd></div>
        </dl>
      </aside>
    </div>
    <section className="scene-recommendations">
      <div className="scene-section-heading"><h3><ClipboardCheck size={18} />处置建议</h3><span className="scene-note">人工复核</span></div>
      <div className="scene-recommendation-list">
        {recommendations.map((item, index) => <label className={'scene-recommendation' + (checks[item.title] ? ' reviewed' : '')} key={item.title}>
          <input type="checkbox" aria-label={`已阅${item.title}`} checked={Boolean(checks[item.title])}
            onChange={(e) => setChecks((previous) => ({ ...previous, [item.title]: e.target.checked }))} />
          <span className="scene-recommendation-number">{checks[item.title] ? <Check size={14} /> : `0${index + 1}`}</span>
          <span><strong>{item.title}</strong><span>{item.detail}</span></span>
        </label>)}
      </div>
    </section>
    <footer className="scene-next">
      <button type="button" className="domain-primary-button" onClick={onNext}>下一步<ArrowRight size={16} /></button>
    </footer>
    <dialog ref={dialogRef} className="scene-video-dialog" onCancel={() => setExpanded(null)} onClose={() => setExpanded(null)}>
      <div className="scene-section-heading"><h3>{cameraViews.find((item) => item.id === expanded)?.title}</h3>
        <button type="button" className="ui-icon-button" title="关闭画面" aria-label="关闭画面" onClick={() => setExpanded(null)}><X size={19} /></button></div>
      {expanded && renderFeed(cameraViews.find((item) => item.id === expanded)!)}
    </dialog>
  </section>;
}
