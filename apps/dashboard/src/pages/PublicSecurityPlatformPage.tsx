import { useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BrainCircuit, CheckCircle2, Clock3, Database, FileCheck2,
  GraduationCap, MapPinned, Radio, Search, ShieldCheck, UsersRound, Video, X,
} from 'lucide-react';
import { Drawer, Empty } from 'antd';
import type { PlatformOverview, PlatformView } from './DashboardApp';
import { eventCategory, filterEvents, formatMetric, type EventFilter } from '../lib/presentation';

type Props = {
  overview: PlatformOverview;
  apiOnline: boolean;
  refreshing: boolean;
  refresh: () => void | Promise<void>;
  navigate: (view: PlatformView) => void;
};
type Event = NonNullable<PlatformOverview['events']>[number];

function eventKey(event: Event) {
  return event.id ?? JSON.stringify([event.title, event.time, event.area ?? event.bay]);
}

const businessEntries: Array<{ view: PlatformView; title: string; detail: string; icon: typeof Radio; tone: string }> = [
  { view: 'command', title: '接处警', detail: '接报与协同处置', icon: Radio, tone: 'blue' },
  { view: 'case', title: '执法办案', detail: '案件与证据核验', icon: FileCheck2, tone: 'purple' },
  { view: 'community', title: '社区警务', detail: '走访与隐患闭环', icon: MapPinned, tone: 'green' },
  { view: 'duty-situation', title: '勤务态势', detail: '态势与靶向训练', icon: GraduationCap, tone: 'amber' },
];
const filters: Array<{ key: EventFilter; label: string }> = [
  { key: 'all', label: '全部警情' }, { key: 'pending', label: '待确认' },
  { key: 'active', label: '处置中' }, { key: 'complete', label: '已完成' },
];

function RiskTag({ level }: { level?: string }) {
  const tone = /高|danger|紧急/.test(level ?? '') ? 'danger' : /中|warn/.test(level ?? '') ? 'warning' : 'neutral';
  return <span className={`ui-tag ${tone}`}>{level || '未分级'}</span>;
}

export function PublicSecurityPlatformPage({ overview, apiOnline, navigate }: Props) {
  const [filter, setFilter] = useState<EventFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const selectedEvent = overview.events?.find((event) => eventKey(event) === selectedEventKey);
  const events = useMemo(() => filterEvents(overview.events, filter, query), [overview.events, filter, query]);
  const agents = overview.aiCenter?.agents ?? overview.ai_copilot?.agents ?? [];
  const connectors = overview.aiCenter?.mcpConnectors ?? overview.ai_copilot?.mcp_connectors ?? [];
  const completion = overview.stats.completion_rate;
  const metrics = [
    { label: '今日接入警情', value: formatMetric(overview.stats.today_events), note: '统一事件中心', icon: Radio, tone: 'blue' },
    { label: '待确认任务', value: formatMetric(overview.stats.pending_orders), note: `${formatMetric(overview.stats.urgent_events)} 条紧急警情`, icon: Clock3, tone: 'amber' },
    { label: '在线警力', value: formatMetric(overview.stats.online_staff), note: '组织与移动端状态', icon: UsersRound, tone: 'green' },
    { label: '业务闭环率', value: formatMetric(completion), unit: typeof completion === 'number' ? '%' : '', note: '当前运行快照', icon: CheckCircle2, tone: 'purple' },
  ];

  return <section className="overview-page" aria-label="公安大数据与 AI 平台首页">
    <header className="ui-page-heading">
      <div><div className="ui-eyebrow">市公安局 · 综合值守</div><h1>平台总览</h1><p>今日警务运行与待办事项</p></div>
      <button type="button" className="ui-button primary" onClick={() => navigate('command')}><Radio size={16} />进入接处警<ArrowRight size={16} /></button>
    </header>
    <section className="overview-metrics" aria-label="平台运行指标">
      {metrics.map(({ label, value, unit, note, icon: Icon, tone }) => <article className="overview-metric" key={label}>
        <div className="overview-metric-label"><span>{label}</span><span className={`ui-tone-icon ${tone}`}><Icon size={17} /></span></div>
        <strong>{value}<small>{unit}</small></strong><p>{note}</p>
      </article>)}
    </section>
    <section className="overview-entries" aria-labelledby="business-heading">
      <div className="ui-section-heading"><h2 id="business-heading">业务工作台</h2><span>业务系统</span></div>
      <div className="overview-entry-grid">{businessEntries.map(({ view, title, detail, icon: Icon, tone }) => <button type="button" className="overview-entry" key={view} onClick={() => navigate(view)}>
        <span className={`ui-tone-icon ${tone}`}><Icon size={21} /></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight size={16} />
      </button>)}</div>
    </section>
    <div className="overview-work-grid">
      <section className="overview-events" aria-labelledby="events-heading">
        <div className="ui-section-heading"><div><h2 id="events-heading">当前警情</h2><span className="ui-count">{overview.events?.length ?? 0}</span></div><button type="button" className="ui-text-button" onClick={() => navigate('command')}>前往处置<ArrowRight size={15} /></button></div>
        <div className="overview-event-tools">
          <div className="overview-filter-tabs" role="group" aria-label="警情状态">{filters.map(({ key, label }) => <button type="button" aria-pressed={filter === key} aria-controls="event-results" className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div>
          <label className="ui-search"><Search size={16} /><input aria-label="搜索警情" placeholder="搜索警情、地点或负责人" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label>
        </div>
        <div id="event-results" role="region" aria-label="警情筛选结果" className="overview-event-results">
          {events.length ? <div className="ui-table-scroll" tabIndex={0} role="region" aria-label="当前警情列表">
            <table className="overview-event-table"><thead><tr><th>警情信息</th><th>风险等级</th><th>状态</th><th>时间</th><th><span className="sr-only">操作</span></th></tr></thead>
              <tbody>{events.map((event, index) => <tr key={event.id ?? index}>
                <td><button type="button" className="overview-event-title" onClick={() => setSelectedEventKey(eventKey(event))}>{event.title || '未命名警情'}</button><small>{event.area ?? event.bay ?? '地点待补充'}<span>·</span>{event.owner ?? '待分配'}</small></td>
                <td><RiskTag level={event.level} /></td>
                <td><span className={`overview-event-status ${eventCategory(event.status)}`}><i />{event.status ?? '待同步'}</span></td>
                <td className="overview-event-time">{event.time || '—'}</td>
                <td><button type="button" className="ui-text-button" aria-label={`查看${event.title || '警情'}`} onClick={() => setSelectedEventKey(eventKey(event))}>查看<ArrowUpRight size={14} /></button></td>
              </tr>)}</tbody>
            </table>
          </div> : <div className="overview-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? '没有匹配的警情' : '当前分类暂无警情'} />{query && <button className="ui-text-button" type="button" onClick={() => setQuery('')}>清空搜索</button>}</div>}
        </div>
        <div className="overview-table-footer"><span>共 {events.length} 条{apiOnline ? '当前记录' : '快照记录'}</span><span>{apiOnline ? '业务数据已连接' : '非实时数据'}</span></div>
      </section>
      <aside className="overview-side">
        <section className="overview-services" aria-labelledby="services-heading">
          <div className="ui-section-heading"><h2 id="services-heading">平台运行</h2><span className={`ui-tag ${apiOnline ? 'success' : 'warning'}`}>{apiOnline ? '已连接' : '未连接'}</span></div>
          <button className="overview-service" type="button" onClick={() => navigate('ai-center')}><span className="ui-tone-icon blue"><BrainCircuit size={19} /></span><span><strong>AI 能力中心</strong><small>{agents.length} 个智能体 · {connectors.length} 个连接器</small></span><ArrowUpRight size={15} /></button>
          <button className="overview-service" type="button" onClick={() => navigate('admin')}><span className="ui-tone-icon green"><Database size={19} /></span><span><strong>数据资源</strong><small>{formatMetric(overview.dataCatalog?.domainCount)} 个数据域 · {formatMetric(overview.dataCatalog?.objectCount)} 个对象</small></span><ArrowUpRight size={15} /></button>
          <button className="overview-service" type="button" onClick={() => navigate('admin')}><span className="ui-tone-icon purple"><ShieldCheck size={19} /></span><span><strong>治理与审计</strong><small>访问权限 · 操作记录</small></span><ArrowUpRight size={15} /></button>
          <div className="overview-safety-note"><ShieldCheck size={15} /><span>高风险建议待人工确认</span></div>
        </section>
        <button type="button" className="overview-monitor-link" onClick={() => navigate('video')} aria-label="打开视频联动">
          <img src="/night-market-cam-02.png" alt="夜市监控场景" loading="lazy" />
          <span className="overview-monitor-caption"><span><Video size={17} /><strong>视频联动</strong></span><ArrowUpRight size={18} /></span>
        </button>
      </aside>
    </div>
    <section className="overview-flow-section" aria-labelledby="flow-heading">
      <div className="ui-section-heading"><h2 id="flow-heading">业务流转</h2><span>当前各环节业务量</span></div>
      <ol className="overview-flow">{(overview.eventChain ?? []).map((step, index) => <li key={step.label ?? index}>
        <span className="overview-flow-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{step.label ?? '业务环节'}</strong><span>{step.status ?? '待同步'}</span></div><b>{formatMetric(step.count)}</b>
      </li>)}</ol>
    </section>
    <Drawer title="警情详情" open={selectedEventKey !== null} onClose={() => setSelectedEventKey(null)} size={480} styles={{ wrapper: { maxWidth: '100vw' } }}>
      {selectedEvent && <div className="overview-event-detail">
        <RiskTag level={selectedEvent.level} /><h2>{selectedEvent.title ?? '未命名警情'}</h2>
        <dl>{[['警情编号', selectedEvent.id], ['发生地点', selectedEvent.area ?? selectedEvent.bay], ['处置状态', selectedEvent.status], ['负责人', selectedEvent.owner], ['接入时间', selectedEvent.time]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '待补充'}</dd></div>)}</dl>
        <p className="overview-detail-note">风险等级与处置建议须经人工核验。</p>
        <button type="button" className="ui-button primary" onClick={() => { setSelectedEventKey(null); navigate('command'); }}><Radio size={16} />打开接处警工作台<ArrowRight size={16} /></button>
      </div>}
      {selectedEventKey !== null && !selectedEvent && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该警情已不在当前列表中，请刷新后查询。" />}
    </Drawer>
  </section>;
}
