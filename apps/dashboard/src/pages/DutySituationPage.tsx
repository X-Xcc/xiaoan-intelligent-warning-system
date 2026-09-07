import {
  ArrowLeft, ArrowRight, ArrowUpRight, ChartNoAxesColumnIncreasing,
  Clock3, Database, MapPin, Maximize2, Minimize2, Pause, Play,
  RefreshCw, RotateCcw, ShieldAlert, Sparkles, Target, Volume2, VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { getTrainingReadiness, getTrainingTasks, type TrainingReadiness, type TrainingTask } from '../lib/training-api';
import { readSituationView, rememberSituationView, type SituationPhase } from '../lib/training-navigation';
import { useXiaoanVoice } from '../components/XiaoanVoice';

type Situation = NonNullable<TrainingReadiness['dutySituation']>;
type Source = 'sample' | 'api' | 'stale';

const HOURS = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00'];
const TASK_IDS = ['TRAIN-READINESS-001', 'TRAIN-READINESS-002', 'TRAIN-READINESS-003'];
const COLORS = ['#edbf69', '#5cd5d0', '#79cca4', '#ff727c'];
const SAMPLE: Situation = {
  title: 'A1 勤务态势大屏',
  location: '南昌 · 绳金塔夜市',
  period: '18:00 - 次日 01:00',
  composition: [
    { label: '滋事纠纷', value: 41, color: COLORS[0] },
    { label: '手机扒窃', value: 28, color: COLORS[1] },
    { label: '其他', value: 27, color: COLORS[2] },
    { label: '可疑物品', value: 4, color: COLORS[3] },
  ],
  timeTrend: HOURS.map((time, index) => ({ time, value: [8, 15, 33, 42, 38, 31, 16, 7][index] })),
  zones: [
    { id: 'A', name: 'A 入口区', level: '中风险', share: 23, x: 29, y: 78, description: '入口及主街交汇，人流导入集中，关注通道秩序。' },
    { id: 'B', name: 'B 烧烤区', level: '高风险', share: 56, x: 56, y: 61, description: 'B区烧烤摊聚集区，餐饮摊位密集，滋事纠纷重点关注区域。' },
    { id: 'C', name: 'C 文创区', level: '低风险', share: 21, x: 45, y: 29, description: '文创摊位与步行通道，保持巡防覆盖和疏散通道畅通。' },
  ],
  recommendations: [
    { taskId: TASK_IDS[0], subject: '单警装备训练', basis: '滋事纠纷 41% · 先期控制与装备熟练度', standard: '单警装备30秒取用完毕' },
    { taskId: TASK_IDS[1], subject: '弱光执法战术训练', basis: '20:00-23:00 高发时段 · 弱光队形转换', standard: '弱光队形转换不超过10秒' },
    { taskId: TASK_IDS[2], subject: '防爆先期处置', basis: '可疑物品 4% · 低频高风险', standard: '30米警戒圈60秒内设定' },
  ],
};

function validSituation(value: Situation | undefined): value is Situation {
  const finite = (number: unknown): number is number => typeof number === 'number' && Number.isFinite(number) && number >= 0;
  return Boolean(value && typeof value.location === 'string' && typeof value.period === 'string'
    && Array.isArray(value.composition) && value.composition.length > 0
    && value.composition.every((item) => item && typeof item.label === 'string' && finite(item.value) && item.value <= 100)
    && Math.abs(value.composition.reduce((sum, item) => sum + item.value, 0) - 100) < 0.1
    && Array.isArray(value.timeTrend) && value.timeTrend.every((item) => item && finite(item.value))
    && HOURS.every((hour) => value.timeTrend.some((item) => item.time === hour))
    && Array.isArray(value.zones) && value.zones.length > 0
    && value.zones.every((zone) => zone && typeof zone.id === 'string' && typeof zone.name === 'string'
      && typeof zone.level === 'string' && typeof zone.description === 'string'
      && finite(zone.share) && zone.share <= 100 && finite(zone.x) && zone.x <= 100 && finite(zone.y) && zone.y <= 100)
    && Array.isArray(value.recommendations)
    && TASK_IDS.every((id) => value.recommendations.some((item) => item && item.taskId === id
      && typeof item.subject === 'string' && typeof item.basis === 'string' && typeof item.standard === 'string')));
}

function categoryColor(item: Situation['composition'][number], index: number) {
  if (item.label === '可疑物品') return COLORS[3];
  return /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : COLORS[index % COLORS.length];
}

function zoneTone(zone: Situation['zones'][number]) {
  if (/高|hot|high/i.test(zone.level) || /^B(?:区)?$/i.test(zone.id) || /烧烤/.test(zone.name)) return 'danger';
  return /中|medium|warn/i.test(zone.level) ? 'warning' : 'safe';
}

function zoneName(zone: Situation['zones'][number]) {
  return zone.name.startsWith(zone.id) ? zone.name : `${zone.id} ${zone.name}`;
}

function riskLabel(level: string) {
  const labels: Record<string, string> = { high: '高风险', medium: '中风险', low: '低风险' };
  return labels[level.trim().toLowerCase()] ?? level;
}

function dataModeLabel(mode: string | undefined) {
  return /^desensitized[-_]sample$/i.test(mode ?? '') ? '脱敏样例' : mode || '未提供数据模式';
}

function conciseBasis(basis: string) {
  return basis.replace(/^脱敏样例(?:演示)?[：:]\s*/, '')
    .replace(/[；;]\s*演示阈值[，,].*$/, '').trim();
}

function timestampLabel(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value || '未提供快照时间';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(parsed);
}

export function DutySituationPage({ onBack, onTraining }: { onBack: () => void; onTraining: (taskId?: string) => void }) {
  const rootRef = useRef<HTMLElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const taskRequestRef = useRef<AbortController | null>(null);
  const restoredScrollRef = useRef(false);
  const { enabled: sound, setEnabled: setSound, speak, stop: stopVoice, error: voiceError } = useXiaoanVoice();
  const generationRef = useRef(0);
  const svgId = useId().replace(/:/g, '');
  const [snapshot, setSnapshot] = useState<TrainingReadiness | null>(null);
  const [savedView] = useState(readSituationView);
  const phaseClock = useRef({ key: `1:${savedView.phase}`, remaining: savedView.remainingMs, startedAt: 0 });
  const [tasks, setTasks] = useState<TrainingTask[]>([]);
  const [tasksOnline, setTasksOnline] = useState(false);
  const [settled, setSettled] = useState(false);
  const [source, setSource] = useState<Source>('sample');
  const [refreshing, setRefreshing] = useState(false);
  const [loadNotice, setLoadNotice] = useState('正在读取勤务快照');
  const [feedback, setFeedback] = useState('');
  const [selectedId, setSelectedId] = useState(savedView.selectedId);
  const [phase, setPhase] = useState<SituationPhase>(savedView.phase);
  const [run, setRun] = useState(savedView.phase === 'idle' ? 0 : 1);
  const [paused, setPaused] = useState(savedView.paused);
  const [fullscreen, setFullscreen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    setFeedback('');
    try {
      const next = await getTrainingReadiness(controller.signal);
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (!validSituation(next?.dutySituation)) throw new Error('勤务快照数据不完整');
      setSnapshot(next);
      setSource('api');
      setLoadNotice('');
    } catch {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setSource((previous) => previous === 'sample' ? 'sample' : 'stale');
      setLoadNotice('接口不可用或勤务快照不完整');
    } finally {
      if (!controller.signal.aborted && requestRef.current === controller) {
        setRefreshing(false);
        setSettled(true);
      }
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    taskRequestRef.current?.abort();
    const controller = new AbortController();
    taskRequestRef.current = controller;
    try {
      const result = await getTrainingTasks(controller.signal);
      if (controller.signal.aborted) return;
      setTasks(result.items);
      setTasksOnline(true);
    } catch {
      if (!controller.signal.aborted) setTasksOnline(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshTasks();
    const onFocus = () => { void refresh(); void refreshTasks(); };
    window.addEventListener('focus', onFocus);
    return () => {
      requestRef.current?.abort();
      taskRequestRef.current?.abort();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, refreshTasks]);

  useLayoutEffect(() => {
    if (!settled || restoredScrollRef.current || (!savedView.scrollY && !savedView.panels.some(Boolean))) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedView.scrollY, behavior: 'instant' });
      rootRef.current?.querySelectorAll<HTMLElement>('.duty-main-grid > section').forEach((panel, index) => {
        panel.scrollTop = savedView.panels[index] ?? 0;
      });
      restoredScrollRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [settled, savedView]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'A1 勤务态势大屏';
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotion = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    const onFullscreen = () => setFullscreen(document.fullscreenElement === rootRef.current);
    media?.addEventListener('change', onMotion);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.title = previousTitle;
      media?.removeEventListener('change', onMotion);
      document.removeEventListener('fullscreenchange', onFullscreen);
      generationRef.current += 1;
      stopVoice();
    };
  }, []);

  useEffect(() => {
    if (phase === 'idle' || phase === 'ticker') return;
    if (reducedMotion) {
      setPhase('ticker');
      return;
    }
    if (paused) return;
    const key = `${run}:${phase}`;
    const duration = phase === 'lead' ? 500 : 1000;
    const remaining = phaseClock.current.key === key ? phaseClock.current.remaining : duration;
    const started = Date.now();
    phaseClock.current = { key, remaining, startedAt: started };
    const timer = window.setTimeout(() => {
      setPhase(phase === 'lead' ? 'donut' : phase === 'donut' ? 'hotspot' : 'ticker');
    }, remaining);
    return () => {
      window.clearTimeout(timer);
      phaseClock.current = { key, remaining: Math.max(0, remaining - (Date.now() - started)), startedAt: 0 };
    };
  }, [phase, paused, run, reducedMotion]);

  const situation = snapshot?.dutySituation ?? SAMPLE;
  const selectedZone = situation.zones.find((zone) => zone.id === selectedId)
    ?? situation.zones.find((zone) => /烧烤/.test(zone.name) || /^B(?:区)?$/i.test(zone.id))
    ?? situation.zones[0];
  const zoneCallouts = situation.zones.map((zone, index) => ({
    zone, labelX: index % 2 ? 78 : 22,
    labelY: (Math.floor(index / 2) + 0.5) / Math.ceil(situation.zones.length / 2) * 100,
  }));
  const hourly = HOURS.map((hour) => situation.timeTrend.find((item) => item.time === hour)!);
  const maxHourly = Math.max(1, ...hourly.map((item) => item.value));
  const largestCategory = situation.composition.reduce((largest, item) => item.value > largest.value ? item : largest);
  const suspicious = situation.composition.find((item) => item.label === '可疑物品');
  const totalHourly = hourly.reduce((total, item) => total + item.value, 0);
  const peakHourly = hourly.filter((item) => /^(20|21|22|23):/.test(item.time)).reduce((total, item) => total + item.value, 0);
  const peakShare = totalHourly ? Math.round(peakHourly / totalHourly * 100) : 0;
  const sourceNotice = source === 'sample'
    ? `${loadNotice} · 截图规格样例，非实时警情`
    : source === 'stale' ? '刷新失败 · 保留上次快照，数据尚未更新'
      : dataModeLabel(snapshot?.dataMode) === '脱敏样例' ? '脱敏样例，非实时警情；训练阈值仅供演示。'
        : snapshot?.notice || '接口快照，数据口径以来源标识为准';
  const recommendations = TASK_IDS.map((id) => situation.recommendations.find((item) => item.taskId === id)!);
  const generationBusy = phase === 'lead' || phase === 'donut' || phase === 'hotspot';

  const openTraining = (taskId?: string) => {
    rememberSituationView({
      selectedId: selectedZone.id,
      scrollY: Math.max(window.scrollY, rootRef.current?.scrollTop ?? 0),
      phase, paused, sound,
      remainingMs: phaseClock.current.key === `${run}:${phase}`
        ? Math.max(0, phaseClock.current.remaining - (paused || !phaseClock.current.startedAt ? 0 : Date.now() - phaseClock.current.startedAt))
        : phase === 'lead' ? 500 : 1000,
      panels: Array.from(rootRef.current?.querySelectorAll<HTMLElement>('.duty-main-grid > section') ?? []).map((panel) => panel.scrollTop),
    });
    onTraining(taskId);
  };

  const generate = async () => {
    const generation = ++generationRef.current;
    stopVoice();
    setPhase('idle');
    setRun((previous) => previous + 1);
    setPaused(false);
    setFeedback('画像已生成');
    await speak('portrait-ready', `a1:${Date.now()}:${generation}`);
    if (generationRef.current !== generation) return;
    setPhase(reducedMotion ? 'ticker' : 'lead');
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === rootRef.current && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (rootRef.current?.requestFullscreen) {
        await rootRef.current.requestFullscreen();
      } else {
        setFeedback('当前环境不支持全屏，已保持窗口内大屏。');
      }
    } catch {
      setFeedback('无法进入或退出全屏，浏览器拒绝了请求；已保持窗口内大屏。');
    }
  };

  let donutOffset = 0;

  return (
    <main ref={rootRef} className="duty-situation duty-situation-page" data-source={source} data-phase={phase}
      data-paused={paused} data-reduced-motion={reducedMotion} aria-labelledby="duty-situation-title">
      <header className="duty-topbar">
        <div className="duty-identity">
          <button type="button" className="duty-icon-button" aria-label="返回平台总览" title="返回平台总览" onClick={onBack}><ArrowLeft size={20} /></button>
          <div>
            <div className="duty-eyebrow">勤务研判 / 训练靶向</div>
            <h1 id="duty-situation-title">A1 勤务态势大屏</h1>
          </div>
        </div>
        <div className="duty-location">
          <MapPin size={19} aria-hidden="true" />
          <div><strong>{situation.location}</strong><span>{situation.period}</span></div>
        </div>
        <div className="duty-actions">
          <label className="duty-sound" title="语音播报">
            {sound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
            <input type="checkbox" aria-label="语音播报" checked={sound} onChange={(event) => {
              setSound(event.target.checked);
            }} />
            <span className="duty-toggle-track" aria-hidden="true" />
          </label>
          <button type="button" className="duty-generate-button" aria-label="生成画像" title="生成画像" onClick={generate}>
            <Sparkles size={17} aria-hidden="true" />生成画像
          </button>
          <button type="button" className="duty-icon-button" aria-label="重播画像" title="重播画像" disabled={run === 0} onClick={generate}>
            <RotateCcw size={18} />
          </button>
          <button type="button" className="duty-icon-button" aria-label={paused ? '继续动画' : '暂停动画'}
            title={paused ? '继续动画' : '暂停动画'} disabled={phase === 'idle' || reducedMotion}
            aria-pressed={paused} onClick={() => setPaused((previous) => !previous)}>
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button type="button" className="duty-icon-button" aria-label="刷新态势" title="刷新态势" disabled={refreshing}
            onClick={() => { generationRef.current += 1; stopVoice(); setPhase('idle'); setPaused(false); void refresh(); void refreshTasks(); }}>
            <RefreshCw size={18} />
          </button>
          <button type="button" className="duty-icon-button" aria-label={fullscreen ? '退出全屏' : '进入全屏'}
            title={fullscreen ? '退出全屏' : '进入全屏'} onClick={() => void toggleFullscreen()}>
            {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
        <div className="duty-metadata" aria-label="数据来源与时间">
          <span className={`duty-source-label ${source === 'api' ? '' : 'is-warning'}`}><Database size={14} aria-hidden="true" />
            {source === 'sample' ? '截图规格样例' : `来源：训练备勤接口 · ${dataModeLabel(snapshot?.dataMode)}`}
          </span>
          <span>规则：{source === 'sample' ? 'A1 截图规格' : snapshot?.ruleVersion || '未提供'}</span>
          <span className="duty-snapshot-time"><Clock3 size={14} aria-hidden="true" />
            {source === 'sample' ? '样例时间：未提供' : <time dateTime={snapshot?.updatedAt}>{timestampLabel(snapshot?.updatedAt ?? '')} (北京时间)</time>}
          </span>
          <span className="duty-connection">{refreshing ? '正在读取' : source === 'api' ? '接口已连接' : '接口未同步'}</span>
        </div>
        <div className="duty-statusline">
          <p className={source === 'api' ? '' : 'is-warning'} title={snapshot?.notice || sourceNotice}>{sourceNotice}</p>
          <p role="status" aria-live="polite">{voiceError || feedback}</p>
        </div>
      </header>

      <div className="duty-main-grid">
        <section className="duty-composition-panel" aria-labelledby="duty-composition-heading">
          <div className="duty-section-heading"><span className="duty-section-index">01</span><h2 id="duty-composition-heading">警情类型构成</h2><span>占比 %</span></div>
          <div className="duty-donut-wrap">
            <svg className="duty-donut" viewBox="0 0 260 260" role="img"
              aria-label={`警情类型构成：${situation.composition.map((item) => `${item.label} ${item.value}%`).join('，')}`}>
              <circle className="duty-donut-track" cx="130" cy="130" r="96" fill="none" strokeWidth="25" />
              <g key={run} className="duty-donut-segments">
                {situation.composition.map((item, index) => {
                  const offset = donutOffset;
                  donutOffset += item.value;
                  return <circle key={item.label} cx="130" cy="130" r="96" fill="none" pathLength="100" strokeWidth={item.label === '可疑物品' ? 33 : 25}
                    stroke={categoryColor(item, index)} strokeDasharray={`${Math.max(0, item.value - 0.8)} ${100 - Math.max(0, item.value - 0.8)}`}
                    strokeDashoffset={-offset} transform="rotate(-90 130 130)" />;
                })}
              </g>
            </svg>
            <div className="duty-donut-center" aria-hidden="true"><span>首要警情</span>
              <strong>{largestCategory.value}<small>%</small></strong><b>{largestCategory.label}</b>
            </div>
          </div>
          <ul className="duty-composition-list">
            {situation.composition.map((item, index) => (
              <li key={item.label} data-category={item.label} data-value={item.value}
                className={item.label === '可疑物品' ? 'is-danger' : ''} style={{ '--category-color': categoryColor(item, index) } as CSSProperties}>
                <i aria-hidden="true" /><span>{item.label}</span><strong>{item.value}%</strong>
                <div className="duty-category-meter" aria-hidden="true"><span style={{ width: `${item.value}%` }} /></div>
              </li>
            ))}
          </ul>
          {suspicious && <div className="duty-risk-note"><ShieldAlert size={21} aria-hidden="true" />
            <div><strong>低频不等于低风险</strong><p>可疑物品 {suspicious.value}% · 纳入先期处置训练</p></div>
          </div>}
        </section>

        <section className="duty-map-panel" aria-labelledby="duty-map-heading">
          <div className="duty-section-heading"><span className="duty-section-index">02</span><h2 id="duty-map-heading">重点区域热力</h2><span>风险分布</span></div>
          <div className="duty-map-surface">
            <div className="duty-map-topline"><span><MapPin size={14} aria-hidden="true" />{situation.location}</span><span>北 ↑</span></div>
            <div className="duty-map-canvas"><div className="duty-map-frame">
            <svg className="duty-map" viewBox="0 0 654 539" role="img" aria-label="夜市风险区域地图，含人流方向示意">
              <defs>
                <clipPath id={`${svgId}-map-crop`}><rect width="654" height="539" /></clipPath>
                <marker id={`${svgId}-flow-arrow`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#126b68" />
                </marker>
              </defs>
              {/* The existing bitmap is a 1440x1000 screenshot; this viewport isolates its map. */}
              <g clipPath={`url(#${svgId}-map-crop)`}>
                <image className="duty-map-bitmap" href="/night-market-shengjinta-map.png" x="-371" y="-461" width="1440" height="1000" />
                <g className="duty-map-flow" aria-label="人流方向示意">
                  <path d="M100 479 L188 434 L238 405" markerEnd={`url(#${svgId}-flow-arrow)`} />
                  <path d="M246 394 L280 362 L323 352" markerEnd={`url(#${svgId}-flow-arrow)`} />
                  <path d="M297 144 L300 209 L333 253" markerEnd={`url(#${svgId}-flow-arrow)`} />
                </g>
                {zoneCallouts.map(({ zone, labelX, labelY }) => {
                  const x = Math.max(85, Math.min(569, zone.x * 6.54));
                  const y = Math.max(72, Math.min(467, zone.y * 5.39));
                  const tone = zoneTone(zone);
                  return (
                    <g key={zone.id} className={`duty-map-zone is-${tone}${selectedZone.id === zone.id ? ' is-selected' : ''}`}>
                      <path key={`${run}-fill`} className="duty-zone-fill"
                        d={`M${x - 74},${y - 36} L${x + 24},${y - 62} L${x + 80},${y - 8} L${x + 58},${y + 52} L${x - 43},${y + 65} L${x - 82},${y + 18} Z`} />
                      <line data-zone-leader={zone.id} className="duty-zone-leader" x1={x} y1={y} x2={labelX * 6.54} y2={labelY * 5.39} />
                    </g>
                  );
                })}
              </g>
            </svg>
            {zoneCallouts.map(({ zone, labelX, labelY }) => (
              <button type="button" key={zone.id} data-zone-id={zone.id}
                className={`duty-zone-button is-${zoneTone(zone)}${selectedZone.id === zone.id ? ' is-selected' : ''}`}
                style={{ left: `${labelX}%`, top: `${labelY}%` }}
                aria-label={`${zoneName(zone)}，${riskLabel(zone.level)}，占比${zone.share}%`} aria-pressed={selectedZone.id === zone.id}
                title={`${zoneName(zone)} · ${riskLabel(zone.level)} · ${zone.description}`} onClick={() => setSelectedId(zone.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(zone.id); }
                }}>
                {zoneName(zone)}
              </button>
            ))}
            </div></div>
            <div className="duty-map-legend"><span><i className="is-safe" />一般</span><span><i className="is-warning" />关注</span><span><i className="is-danger" />高风险</span><span><ArrowRight size={16} />人流示意</span></div>
          </div>
          <div className={`duty-zone-summary is-${zoneTone(selectedZone)}`} aria-label="选区摘要">
            <div className="duty-zone-summary-heading"><span><Target size={18} aria-hidden="true" /><strong>{zoneName(selectedZone)}</strong></span><b>{riskLabel(selectedZone.level)}</b></div>
            <p>{selectedZone.description}</p>
            <div className="duty-zone-summary-footer"><span>区域警情占比 <strong>{selectedZone.share}%</strong></span><span>重点时段 20:00-23:00</span></div>
          </div>
        </section>

        <section className="duty-trend-panel" aria-labelledby="duty-trend-heading">
          <div className="duty-section-heading"><span className="duty-section-index">03</span><h2 id="duty-trend-heading">警情时段分布</h2><span>强度</span></div>
          <div className="duty-peak-heading"><Clock3 size={20} aria-hidden="true" /><div><span>高发时段</span><strong>20:00-23:00</strong></div></div>
          <div className="duty-hour-chart" role="group" aria-label="18:00至次日01:00逐小时警情分布">
            <div className="duty-chart-grid" aria-hidden="true"><span /><span /><span /><span /></div>
            {hourly.map((hour) => {
              const peak = /^(20|21|22|23):/.test(hour.time);
              return <div key={hour.time} className={`duty-hour-column${peak ? ' is-peak' : ''}`} data-hour={hour.time} data-value={hour.value}
                data-peak={peak} title={`${hour.time} · 强度 ${hour.value}${peak ? ' · 高发时段' : ''}`}
                aria-label={`${hour.time}，强度 ${hour.value}${peak ? '，高发时段' : ''}`}>
                <div className="duty-bar-space"><div className="duty-hour-bar" style={{ height: `${hour.value / maxHourly * 100}%` }}><span>{hour.value}</span></div></div>
                <span className="duty-hour-label">{hour.time}</span>
              </div>;
            })}
          </div>
          <div className="duty-chart-legend"><i /><span>20:00-23:00 高发时段</span><span>次日 00:00 起</span></div>
          <div className="duty-trend-summary"><ChartNoAxesColumnIncreasing size={23} aria-hidden="true" />
            <div><span>高发时段强度占比</span><strong>{peakShare}<small>%</small></strong></div>
          </div>
          <div className="duty-trend-note"><span>训练重点</span><strong>弱光识别 · 快速反应</strong><p>夜间高发时段与重点区域共同纳入训练靶向依据。</p></div>
        </section>
      </div>

      <footer className="duty-training-ticker" aria-label="靶向训练科目">
        <div className="duty-ticker-heading">
          <div><Target size={19} aria-hidden="true" /><h2>靶向训练</h2><span>03 项</span></div>
          <button type="button" aria-label="民警单警训练" title="民警单警训练" onClick={() => openTraining()}>民警单警训练<ArrowUpRight size={16} aria-hidden="true" /></button>
        </div>
        <div className="duty-ticker-viewport">
          <div className="duty-ticker-track">
            {[false, true].map((copy) => (
              <div className={`duty-ticker-group${copy ? ' duty-ticker-copy' : ''}`} key={String(copy)} aria-hidden={copy || undefined}>
                {recommendations.map((task, index) => (
                  <button type="button" className="duty-course" key={task.taskId}
                    data-task-id={copy ? undefined : task.taskId} tabIndex={copy ? -1 : 0}
                    title={`${task.subject} · ${task.standard}`} onClick={() => openTraining(task.taskId)}>
                    <span className="duty-course-number">0{index + 1}</span>
                    <span className="duty-course-content"><strong>{task.subject}<ArrowUpRight size={15} aria-hidden="true" /></strong><span title={task.basis}>{conciseBasis(task.basis)}</span>
                      <span className="duty-course-footer"><b>{task.standard}</b><em className="duty-course-status">
                        {tasks.find((item) => item.taskId === task.taskId)?.status ?? (tasksOnline ? '未分配' : '状态未同步')}{!tasksOnline && tasks.some((item) => item.taskId === task.taskId) ? ' · 未同步' : ''}
                      </em></span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <span className="duty-generation-state">{generationBusy ? '画像生成中' : phase === 'ticker' ? paused ? '动画已暂停' : '画像已生成' : '勤务训练依据'}</span>
      </footer>
    </main>
  );
}
