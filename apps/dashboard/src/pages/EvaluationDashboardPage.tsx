import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Crosshair,
  Gauge,
  MapPin,
  RefreshCw,
  Send,
  ShieldCheck,
  Target,
  Timer,
  Video,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');

type MetricPayload = {
  updatedAt?: string;
  period: { key: string; label: string };
  dataStatus: string;
  dataNote: string;
  classification: { precision: number; recall: number; f1: number; sampleCount: number; labelSource: string };
  latency: { p50Ms: number; p95Ms: number };
  operations: {
    repeatRate: number;
    dispatchSuccessRate: number;
    arrivalMinutes: number;
    locationErrorMeters: number;
    droneSuccessRate: number;
    closureRate: number;
  };
  dailyFalseAlarms: Array<{ date: string; cameras: Array<{ camera: string; falseAlarms: number }> }>;
};

const demo: MetricPayload = {
  period: { key: '7d', label: '近 7 天' },
  dataStatus: '演示口径',
  dataNote: '当前库内尚无完整人工复核标签，指标以系统演示样本展示；接入复核标签后自动切换为实时统计。',
  classification: { precision: .924, recall: .887, f1: .905, sampleCount: 1248, labelSource: '人工复核样本 + 事件闭环标签' },
  latency: { p50Ms: 842, p95Ms: 1460 },
  operations: { repeatRate: .082, dispatchSuccessRate: .963, arrivalMinutes: 4.8, locationErrorMeters: 18.6, droneSuccessRate: .917, closureRate: .91 },
  dailyFalseAlarms: [],
};

function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function dateLabel(value: string) { return value.slice(5).replace('-', '/'); }

function MetricCard({ icon, label, value, note, tone = 'blue' }: { icon: ReactNode; label: string; value: string; note: string; tone?: string }) {
  return <article className={`evaluation-metric-card ${tone}`}>
    <div className="evaluation-metric-label"><span>{icon}</span><span>{label}</span></div>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>;
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <div className="evaluation-sparkline-empty">暂无每日误报标签</div>;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${34 - (value / max) * 28}`).join(' ');
  return <svg className="evaluation-sparkline" viewBox="0 0 100 36" role="img" aria-label="每日误报数趋势"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /><circle cx="100" cy={34 - ((values[values.length - 1] ?? 0) / max) * 28} r="2.3" fill="currentColor" /></svg>;
}

export function EvaluationDashboardPage({ onBack }: { onBack?: () => void }) {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [payload, setPayload] = useState<MetricPayload>(demo);
  const [loading, setLoading] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [camera, setCamera] = useState('全部摄像头');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/platform/evaluation?period=${period}`);
      if (!response.ok) throw new Error('evaluation request failed');
      const next = await response.json() as MetricPayload;
      setPayload(next);
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [period]);

  const cameras = useMemo(() => ['全部摄像头', ...Array.from(new Set(payload.dailyFalseAlarms.flatMap(item => item.cameras.map(cameraItem => cameraItem.camera))))], [payload.dailyFalseAlarms]);
  const dailyRows = useMemo(() => payload.dailyFalseAlarms.map(item => ({
    date: item.date,
    cameras: item.cameras.filter(cameraItem => camera === '全部摄像头' || cameraItem.camera === camera),
    total: item.cameras.filter(cameraItem => camera === '全部摄像头' || cameraItem.camera === camera).reduce((sum, cameraItem) => sum + cameraItem.falseAlarms, 0),
  })), [camera, payload.dailyFalseAlarms]);
  const sparkValues = dailyRows.map(item => item.total);
  const totalFalseAlarms = sparkValues.reduce((sum, value) => sum + value, 0);

  return <div className="evaluation-page">
    <header className="evaluation-heading">
      <div>
        <div className="evaluation-eyebrow"><BarChart3 size={15} />运行质量评估</div>
        <h1>评估看板</h1>
        <p>统一查看视觉识别、告警联动和处置闭环质量，指标与现有事件链保持一致。</p>
      </div>
      <div className="evaluation-heading-actions">
        {onBack && <button type="button" className="evaluation-text-button" onClick={onBack}>返回总览</button>}
        <label className="evaluation-select-label">统计周期<select value={period} onChange={event => setPeriod(event.target.value as '7d' | '30d')}><option value="7d">近 7 天</option><option value="30d">近 30 天</option></select></label>
        <button type="button" className="evaluation-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : undefined} />刷新</button>
      </div>
    </header>

    <div className={`evaluation-status ${payload.dataStatus === '实时统计' && apiOnline ? 'live' : 'demo'}`}><span className="evaluation-status-dot" /><strong>{payload.dataStatus}</strong><span>{payload.dataNote}</span><time>{payload.updatedAt ? `更新于 ${new Date(payload.updatedAt).toLocaleString('zh-CN', { hour12: false })}` : '等待同步'}</time></div>

    <section className="evaluation-section" aria-labelledby="evaluation-model-title">
      <div className="evaluation-section-heading"><div><span>01</span><div><h2 id="evaluation-model-title">模型识别质量</h2><p>{payload.classification.labelSource} · 样本 {payload.classification.sampleCount.toLocaleString()}</p></div></div><ShieldCheck size={18} /></div>
      <div className="evaluation-card-grid evaluation-card-grid-3">
        <MetricCard icon={<Target size={17} />} label="Precision" value={percent(payload.classification.precision)} note="预测为正例的准确程度" tone="blue" />
        <MetricCard icon={<Crosshair size={17} />} label="Recall" value={percent(payload.classification.recall)} note="真实风险的识别覆盖率" tone="green" />
        <MetricCard icon={<Gauge size={17} />} label="F1" value={percent(payload.classification.f1)} note="Precision 与 Recall 的综合值" tone="purple" />
      </div>
    </section>

    <section className="evaluation-section" aria-labelledby="evaluation-ops-title">
      <div className="evaluation-section-heading"><div><span>02</span><div><h2 id="evaluation-ops-title">链路运行质量</h2><p>从识别到派单、到场、定位、无人机和警情关闭的端到端结果。</p></div></div><Activity size={18} /></div>
      <div className="evaluation-card-grid evaluation-card-grid-4">
        <MetricCard icon={<Clock3 size={17} />} label="P50 识别延迟" value={`${payload.latency.p50Ms} ms`} note={`P95 ${payload.latency.p95Ms} ms`} tone="blue" />
        <MetricCard icon={<AlertTriangle size={17} />} label="报警重复率" value={percent(payload.operations.repeatRate)} note="重复报警 / 全部报警" tone="orange" />
        <MetricCard icon={<Send size={17} />} label="派单成功率" value={percent(payload.operations.dispatchSuccessRate)} note="成功生成有效派单" tone="green" />
        <MetricCard icon={<Timer size={17} />} label="到场时间" value={`${payload.operations.arrivalMinutes.toFixed(1)} 分钟`} note="从警情创建到到场 P50" tone="purple" />
        <MetricCard icon={<MapPin size={17} />} label="定位误差" value={`${payload.operations.locationErrorMeters.toFixed(1)} m`} note="事件定位平均误差" tone="orange" />
        <MetricCard icon={<Video size={17} />} label="无人机任务成功率" value={percent(payload.operations.droneSuccessRate)} note="完成并回传有效证据" tone="blue" />
        <MetricCard icon={<CheckCircle2 size={17} />} label="警情关闭率" value={percent(payload.operations.closureRate)} note="已完成 / 统计周期警情" tone="green" />
      </div>
    </section>

    <section className="evaluation-section evaluation-false-alarm-section" aria-labelledby="evaluation-camera-title">
      <div className="evaluation-section-heading"><div><span>03</span><div><h2 id="evaluation-camera-title">摄像头误报分析</h2><p>按天查看每路摄像头误报数，快速定位需要调阈值或补采样的点位。</p></div></div><Video size={18} /></div>
      <div className="evaluation-analysis-grid">
        <div className="evaluation-trend-card"><div className="evaluation-trend-top"><div><small>当前筛选累计误报</small><strong>{totalFalseAlarms}<span>次</span></strong></div><div className="evaluation-trend-badge"><span>每日趋势</span><Sparkline values={sparkValues} /></div></div><div className="evaluation-bar-list">{dailyRows.slice(-7).map(item => <div className="evaluation-bar-row" key={item.date}><span>{dateLabel(item.date)}</span><div><i style={{ width: `${Math.min(100, item.total * 10)}%` }} /></div><b>{item.total}</b></div>)}</div></div>
        <div className="evaluation-table-card"><div className="evaluation-table-toolbar"><strong>每日误报明细</strong><label>摄像头<select value={camera} onChange={event => setCamera(event.target.value)}>{cameras.map(item => <option key={item}>{item}</option>)}</select></label></div>{dailyRows.length ? <div className="evaluation-table-wrap"><table><thead><tr><th>日期</th><th>摄像头</th><th>误报数</th></tr></thead><tbody>{dailyRows.map(item => item.cameras.length ? item.cameras.map(cameraItem => <tr key={`${item.date}-${cameraItem.camera}`}><td>{item.date}</td><td>{cameraItem.camera}</td><td><strong>{cameraItem.falseAlarms}</strong></td></tr>) : <tr key={item.date}><td>{item.date}</td><td>{camera}</td><td><strong>0</strong></td></tr>)}</tbody></table></div> : <div className="evaluation-empty"><Video size={18} />暂无带摄像头标签的误报记录</div>}</div>
      </div>
    </section>
  </div>;
}
