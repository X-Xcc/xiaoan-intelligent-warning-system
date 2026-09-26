import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  Radio,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  UserRoundSearch,
  UsersRound,
  Video,
  X,
} from 'lucide-react';
import { Drawer, Empty } from 'antd';
import type { PlatformOverview, PlatformView } from './DashboardApp';
import { appBasePath, eventCategory, filterEvents, formatMetric, type EventFilter } from '../lib/presentation';

type Props = {
  overview: PlatformOverview;
  refreshing: boolean;
  refresh: () => void | Promise<void>;
  navigate: (view: PlatformView) => void;
};

type Event = NonNullable<PlatformOverview['events']>[number];

type Shortcut = {
  view: PlatformView;
  title: string;
  detail: string;
  icon: typeof Radio;
};

function eventKey(event: Event) {
  return event.id ?? JSON.stringify([event.title, event.time, event.area ?? event.bay]);
}

function organizationLabel(overview: PlatformOverview) {
  const organization = overview.organization?.name ?? '市公安局';
  const unit = overview.organization?.unit ?? '指挥中心 · 综合值守';
  return `${organization} · ${unit}`;
}

function MetricValue({ value, unit }: { value?: number | null; unit?: string }) {
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  return <strong className="overview-metric-value">
    {formatMetric(value)}
    {hasValue && unit ? <small>{unit}</small> : null}
  </strong>;
}

function ServiceValue({ value, unit }: { value?: number | null; unit?: string }) {
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  return <strong className="overview-service-value">
    {formatMetric(value)}
    {hasValue && unit ? <small>{unit}</small> : null}
  </strong>;
}

function RiskTag({ level }: { level?: string }) {
  const tone = /高|danger|紧急/.test(level ?? '') ? 'danger' : /中|warn/.test(level ?? '') ? 'warning' : 'neutral';
  return <span className={`ui-tag ${tone}`}>{level || '未分级'}</span>;
}

const businessEntries: Shortcut[] = [
  { view: 'command', title: '接处警', detail: '接报与协同处置', icon: Radio },
  { view: 'duty-situation', title: '勤务态势', detail: '态势与靶向训练', icon: GraduationCap },
  { view: 'contact-review', title: '视频筛查', detail: '视频检索与复核', icon: Search },
  { view: 'video', title: '视频联动', detail: '现场画面与设备', icon: Video },
  { view: 'identity-search', title: '身份检索', detail: '身份线索与轨迹', icon: UserRoundSearch },
];

const filters: Array<{ key: EventFilter; label: string }> = [
  { key: 'all', label: '全部警情' },
  { key: 'pending', label: '待确认' },
  { key: 'active', label: '处置中' },
  { key: 'complete', label: '已完成' },
];

export function PublicSecurityPlatformPage({ overview, refreshing, refresh, navigate }: Props) {
  const [filter, setFilter] = useState<EventFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const selectedEvent = overview.events?.find((event) => eventKey(event) === selectedEventKey);
  const events = useMemo(() => filterEvents(overview.events, filter, query), [overview.events, filter, query]);
  const agents = overview.aiCenter?.agents ?? overview.ai_copilot?.agents;
  const connectors = overview.aiCenter?.mcpConnectors ?? overview.ai_copilot?.mcp_connectors;
  const onlineDevices = overview.linkage?.stats?.onlineDevices;
  const completion = overview.stats.completion_rate;
  const projectName = overview.project ?? '小安智能预警系统';
  const metrics = [
    { label: '今日接入警情', value: overview.stats.today_events, unit: '起', note: '统一事件中心', icon: Radio, tone: 'blue' },
    { label: '待确认任务', value: overview.stats.pending_orders, unit: '项', note: `${formatMetric(overview.stats.urgent_events)} 条紧急警情`, icon: Clock3, tone: 'amber' },
    { label: '在线警力', value: overview.stats.online_staff, unit: '人', note: '组织与移动端状态', icon: UsersRound, tone: 'green' },
    { label: '业务闭环率', value: completion, unit: '%', note: '当前运行快照', icon: CheckCircle2, tone: 'teal' },
  ];
  const serviceRows = [
    {
      label: '在线设备',
      detail: '视频设备',
      value: onlineDevices,
      unit: '台',
      icon: Camera,
    },
    {
      label: 'AI 助手',
      detail: '已登记助手',
      value: agents?.length,
      unit: '个',
      icon: BrainCircuit,
    },
    {
      label: '数据连接',
      detail: '已登记 MCP 连接',
      value: connectors?.length,
      unit: '个',
      icon: ServerCog,
    },
  ];

  return <section className="overview-page" aria-label="公安大数据与 AI 平台首页">
    <header className="overview-heading ui-page-heading">
      <div>
        <div className="ui-eyebrow">{organizationLabel(overview)}</div>
        <h1>{projectName}</h1>
        <p>今日警务运行与待办事项</p>
      </div>
      <div className="overview-heading-actions">
        <span className="overview-date-control"><Clock3 size={15} />统计周期：今日</span>
        <button type="button" className="ui-icon-button overview-refresh" aria-label="刷新主页数据" aria-busy={refreshing} title="刷新主页数据" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'spin' : undefined} />
        </button>
        <button type="button" className="ui-button primary" onClick={() => navigate('command')}><Radio size={16} />进入接处警<ArrowRight size={16} /></button>
      </div>
    </header>

    <section className="overview-metrics" aria-label="平台运行指标">
      {metrics.map(({ label, value, unit, note, icon: Icon, tone }) => <article className="overview-metric" key={label}>
        <div className="overview-metric-label"><span>{label}</span><span className={`ui-tone-icon ${tone}`}><Icon size={17} /></span></div>
        <MetricValue value={value} unit={unit} />
        <p className={label === '待确认任务' ? 'overview-metric-note urgent' : 'overview-metric-note'}>{note}</p>
      </article>)}
    </section>

    <section className="overview-entries" aria-labelledby="business-heading">
      <div className="ui-section-heading"><h2 id="business-heading">业务工作台</h2><span>常用业务入口</span></div>
      <div className="overview-entry-grid" aria-label="业务工作台快捷入口">
        {businessEntries.map(({ view, title, detail, icon: Icon }) => <button type="button" className="overview-entry" key={view} aria-label={`打开${title}`} onClick={() => navigate(view)}>
          <span className="overview-entry-icon"><Icon size={18} /></span>
          <span><strong>{title}</strong><small>{detail}</small></span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>)}
      </div>
    </section>

    <div className="overview-work-grid">
      <section className="overview-events" aria-labelledby="events-heading">
        <div className="ui-section-heading overview-section-heading">
          <div><h2 id="events-heading">当前警情</h2><span className="ui-count">{overview.events?.length ?? 0}</span></div>
          <button type="button" className="ui-text-button" onClick={() => navigate('command')}>前往处置<ArrowRight size={15} /></button>
        </div>
        <div className="overview-event-tools">
          <div className="overview-filter-tabs" role="group" aria-label="警情状态">
            {filters.map(({ key, label }) => <button type="button" aria-pressed={filter === key} aria-controls="event-results" className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <label className="ui-search overview-event-search"><Search size={16} /><input aria-label="搜索警情" placeholder="搜索警情、地点或负责人" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label>
        </div>
        <div id="event-results" role="region" aria-label="警情筛选结果" className="overview-event-results">
          {events.length ? <div className="ui-table-scroll overview-event-scroll" tabIndex={0} role="region" aria-label="当前警情列表">
            <table className="overview-event-table"><thead><tr><th>警情信息</th><th>风险等级</th><th>处置状态</th><th>接入时间</th><th><span className="sr-only">操作</span></th></tr></thead>
              <tbody>{events.map((event, index) => {
                const urgent = /高|danger|紧急/.test(event.level ?? '') && eventCategory(event.status) === 'pending';
                return <tr className={urgent ? 'overview-event-urgent' : undefined} key={event.id ?? index}>
                  <td><button type="button" className="overview-event-title" onClick={() => setSelectedEventKey(eventKey(event))}>{event.title || '未命名警情'}</button><small>{event.area ?? event.bay ?? '地点待补充'}<span>·</span>{event.owner ?? '待分配'}</small></td>
                  <td><RiskTag level={event.level} /></td>
                  <td><span className={`overview-event-status ${eventCategory(event.status)}`}><i />{event.status ?? '待同步'}</span></td>
                  <td className="overview-event-time">{event.time || '—'}</td>
                  <td><button type="button" className="ui-text-button overview-event-view" aria-label={`查看${event.title || '警情'}`} onClick={() => setSelectedEventKey(eventKey(event))}>查看<ChevronRight size={14} /></button></td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <div className="overview-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? '没有匹配的警情' : '当前分类暂无警情'} />{query && <button className="ui-text-button" type="button" onClick={() => setQuery('')}>清空搜索</button>}</div>}
        </div>
        <div className="overview-table-footer" role="status"><span>共 {events.length} 条记录</span></div>
      </section>

      <aside className="overview-side" aria-label="值守动态">
        <section className="overview-media-section" aria-labelledby="media-heading">
          <div className="overview-media-heading"><div><h2 id="media-heading">夜市监控</h2><span>示例画面</span></div><button type="button" className="ui-text-button" onClick={() => navigate('video')}><Video size={15} />视频联动</button></div>
          <button type="button" className="overview-monitor-link" onClick={() => navigate('video')} aria-label="打开夜市视频联动">
            <img src={`${appBasePath}/night-market-cam-02.png`} alt="夜市监控示例画面" loading="lazy" />
            <span className="overview-monitor-overlay"><span><Camera size={14} />示例画面</span><span>夜市监控</span></span>
          </button>
        </section>

        <section className="overview-services" aria-labelledby="services-heading">
          <div className="ui-section-heading"><h2 id="services-heading">平台资源</h2></div>
          <div className="overview-service-list">
            {serviceRows.map(({ label, detail, value, unit, icon: Icon }) => <div className="overview-service" key={label}>
              <span className="overview-service-icon"><Icon size={15} /></span>
              <span className="overview-service-copy"><strong>{label}</strong><small>{detail}</small></span>
              <ServiceValue value={value} unit={unit} />
            </div>)}
          </div>
        </section>
        <p className="overview-safety-note"><ShieldCheck size={15} /><span>高风险建议待人工确认，系统建议仅作为辅助研判依据。</span></p>
      </aside>
    </div>

    <section className="overview-flow-section" aria-labelledby="flow-heading">
      <div className="ui-section-heading"><h2 id="flow-heading">业务流转</h2><span>当前各环节业务量</span></div>
      {(overview.eventChain ?? []).length ? <ol className="overview-flow">{overview.eventChain?.map((step, index) => <li key={step.label ?? index}>
        <span className="overview-flow-label">{step.label ?? '业务环节'}</span><strong>{formatMetric(step.count)}</strong><small>{step.status ?? '待同步'}</small>
      </li>)}</ol> : <div className="overview-flow-empty">暂无业务流转记录</div>}
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
