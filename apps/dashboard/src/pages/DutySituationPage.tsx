import {
  ArrowLeft, ChartNoAxesColumnIncreasing,
  Clock3, Database, MapPin, Maximize2, Minimize2, Pause, Play,
  RefreshCw, RotateCcw, Sparkles, Volume2, VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getTrainingReadiness, type TrainingReadiness } from '../lib/training-api';
import { readSituationView, type SituationPhase } from '../lib/training-navigation';
import { useXiaoanVoice } from '../components/XiaoanVoice';
import { DutyCompositionChart } from '../components/DutyCompositionChart';

type Situation = NonNullable<TrainingReadiness['dutySituation']>;
type Source = 'sample' | 'api' | 'stale';

const HOURS = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00'];
const TASK_IDS = ['TRAIN-READINESS-001', 'TRAIN-READINESS-002', 'TRAIN-READINESS-003'];
const COLORS = ['#2f817a', '#86b0ce', '#d1dce3', '#eca69f'];
const CATEGORY_COLORS: Record<string, string> = {
  '滋事纠纷': COLORS[0], '手机扒窃': COLORS[1], '其他': COLORS[2], '可疑物品': COLORS[3],
};
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
  if (CATEGORY_COLORS[item.label]) return CATEGORY_COLORS[item.label];
  return /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : COLORS[index % COLORS.length];
}

function dataModeLabel(mode: string | undefined) {
  return /^desensitized[-_]sample$/i.test(mode ?? '') ? '脱敏样例' : mode || '未提供数据模式';
}

function timestampLabel(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value || '未提供快照时间';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(parsed);
}

export function DutySituationPage({ onBack }: { onBack: () => void; onTraining: (taskId?: string) => void }) {
  const rootRef = useRef<HTMLElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const restoredScrollRef = useRef(false);
  const { enabled: sound, setEnabled: setSound, speak, stop: stopVoice, error: voiceError } = useXiaoanVoice();
  const generationRef = useRef(0);
  const [snapshot, setSnapshot] = useState<TrainingReadiness | null>(null);
  const [savedView] = useState(readSituationView);
  const phaseClock = useRef({ key: `1:${savedView.phase}`, remaining: savedView.remainingMs, startedAt: 0 });
  const [settled, setSettled] = useState(false);
  const [source, setSource] = useState<Source>('sample');
  const [refreshing, setRefreshing] = useState(false);
  const [loadNotice, setLoadNotice] = useState('正在读取勤务快照');
  const [feedback, setFeedback] = useState('');
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

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      requestRef.current?.abort();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

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
  const hourly = HOURS.map((hour) => situation.timeTrend.find((item) => item.time === hour)!);
  const maxHourly = Math.max(1, ...hourly.map((item) => item.value));
  const totalHourly = hourly.reduce((total, item) => total + item.value, 0);
  const peakHourly = hourly.filter((item) => /^(20|21|22|23):/.test(item.time)).reduce((total, item) => total + item.value, 0);
  const peakShare = totalHourly ? Math.round(peakHourly / totalHourly * 100) : 0;
  const sourceNotice = source === 'sample'
    ? `${loadNotice} · 截图规格样例，非实时警情`
    : source === 'stale' ? '刷新失败 · 保留上次快照，数据尚未更新'
      : dataModeLabel(snapshot?.dataMode) === '脱敏样例' ? '脱敏样例，非实时警情；训练阈值仅供演示。'
        : snapshot?.notice || '接口快照，数据口径以来源标识为准';
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
            onClick={() => { generationRef.current += 1; stopVoice(); setPhase('idle'); setPaused(false); void refresh(); }}>
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
          <div className="duty-pie-wrap">
            <DutyCompositionChart run={run} items={situation.composition.map((item, index) => ({ ...item, color: categoryColor(item, index) }))} />
          </div>
        </section>

        <section className="duty-trend-panel" aria-labelledby="duty-trend-heading">
          <div className="duty-section-heading"><span className="duty-section-index">02</span><h2 id="duty-trend-heading">警情时段分布</h2><span>强度</span></div>
          <div className="duty-trend-metrics">
            <div className="duty-peak-heading"><Clock3 size={18} aria-hidden="true" /><div><span>高发时段</span><strong>20:00-23:00</strong></div></div>
            <div className="duty-trend-summary"><ChartNoAxesColumnIncreasing size={18} aria-hidden="true" />
              <div><span>高发时段强度占比</span><strong>{peakShare}<small>%</small></strong></div>
            </div>
          </div>
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
        </section>
      </div>

    </main>
  );
}
