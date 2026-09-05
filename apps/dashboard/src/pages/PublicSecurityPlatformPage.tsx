import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Database,
  FileCheck2,
  GraduationCap,
  KeyRound,
  MapPinned,
  Network,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UsersRound,
  Workflow,
} from 'lucide-react';

type PlatformView = 'platform' | 'command' | 'case' | 'community' | 'mobile' | 'ai-center' | 'admin' | 'duty-plan';
type PlatformNavigate = (view: PlatformView) => void;

type PlatformOverview = {
  stats: {
    today_events?: number;
    pending_orders?: number;
    online_staff?: number;
    avg_response_minutes?: number | null;
    completion_rate?: number;
    urgent_events?: number;
    open_cases?: number;
    community_tasks?: number;
    training_records?: number;
  };
  events?: Array<{ id?: string; title?: string; area?: string; bay?: string; time?: string; status?: string; level?: string; owner?: string }>;
  dataCatalog?: {
    domainCount?: number;
    objectCount?: number;
    syncStatus?: string;
    domains?: Array<{ key?: string; label?: string; description?: string; objects?: string[]; status?: string }>;
  };
  ai_copilot?: {
    agents?: Array<{ name: string; status: string; currentTask: string; latency: string }>;
    mcp_connectors?: Array<{ name: string; status: string; scope: string; lastSync: string }>;
    skills?: Array<{ name: string; status: string; trigger: string; confidence: number }>;
  };
  aiCenter?: {
    model?: { name?: string; status?: string; providers?: string[] };
    capabilities?: Array<{ name?: string; scope?: string; status?: string }>;
    agents?: Array<{ name: string; status: string; currentTask: string; latency: string }>;
    skills?: Array<{ name: string; status: string; trigger: string; confidence: number }>;
    mcpConnectors?: Array<{ name: string; status: string; scope: string; lastSync: string }>;
  };
  governance?: Record<string, string>;
  eventChain?: Array<{ label?: string; count?: number; status?: string }>;
  businessSystems?: Array<{ key?: string; name?: string; shortName?: string; description?: string; capabilities?: string[]; status?: string; metric?: number }>;
};

type Props = {
  overview: PlatformOverview;
  apiOnline: boolean;
  refreshing: boolean;
  refresh: () => void | Promise<void>;
  navigate: PlatformNavigate;
};

const foundationCards = [
  { title: '统一数据对象', detail: '人员 · 组织 · 地点 · 车辆 · 警情 · 案件 · 训练', icon: Database, tone: 'blue' },
  { title: '数据资源中心', detail: '目录、接口、质量、血缘与实时数据服务', icon: Network, tone: 'cyan' },
  { title: '统一事件链', detail: '接警 → 派警 → 处置 → 回传 → 复盘', icon: Workflow, tone: 'purple' },
  { title: '平台治理与安全', detail: '身份、权限、审计、分级授权与内网部署', icon: ShieldCheck, tone: 'green' },
];

const defaultBusinessSystems: BusinessSystemCard[] = [
  { key: 'command', name: '接处警系统', description: '接警、问询、警情分类分级与派警处置', capabilities: ['语音转写', '警单生成', '风险识别'], icon: Radio, tone: 'blue' },
  { key: 'case', name: '执法办案系统', description: '法律助手、证据校验、文书和类案辅助', capabilities: ['取证清单', '证据规则', '文书审核'], icon: FileCheck2, tone: 'purple' },
  { key: 'community', name: '社区警务系统', description: '辖区画像、走访任务、风险研判与隐患闭环', capabilities: ['辖区画像', '走访闭环', '热力研判'], icon: MapPinned, tone: 'orange' },
  { key: 'duty-plan', name: '勤务训练系统', description: '课程编辑、AI教官、训练评估与一人一档', capabilities: ['MR课程', '实战模拟', '训练档案'], icon: GraduationCap, tone: 'red' },
  { key: 'mobile', name: '移动勤务系统', description: '移动问答、身份核验、伴随指引与现场回传', capabilities: ['移动智囊', '身份核验', 'AI眼镜'], icon: Smartphone, tone: 'green' },
];

function number(value?: number | null) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '—';
}

function statusLabel(value?: string) {
  return value || '待接入';
}

type BusinessSystemCard = {
  key: Exclude<PlatformView, 'platform' | 'ai-center' | 'admin'>;
  name: string;
  description: string;
  capabilities: string[];
  icon: typeof Radio;
  tone: string;
  status?: string;
  metric?: number;
};

export function PublicSecurityPlatformPage({ overview, apiOnline, refreshing, refresh, navigate }: Props) {
  const systems = defaultBusinessSystems.map((fallback) => {
    // 容忍未归一化的快照，路由键始终以页面配置为准。
    const runtime = overview.businessSystems?.find((item) => {
      const runtimeKey = item.key === 'alarm' ? 'command' : item.key === 'training' ? 'duty-plan' : item.key;
      return runtimeKey === fallback.key || item.shortName === fallback.name.replace('系统', '');
    });
    return {
      ...fallback,
      name: runtime?.name ?? fallback.name,
      description: runtime?.description ?? fallback.description,
      status: runtime?.status ?? fallback.status,
      metric: runtime?.metric ?? fallback.metric,
      capabilities: runtime?.capabilities?.length ? runtime.capabilities : fallback.capabilities,
    };
  });
  const domains: Array<{ key?: string; label?: string; description?: string; objects?: string[] }> = overview.dataCatalog?.domains?.length
    ? overview.dataCatalog.domains
    : foundationCards.map((item) => ({ key: item.title, label: item.title, description: item.detail, objects: [] }));
  const agents = overview.aiCenter?.agents ?? overview.ai_copilot?.agents ?? [];
  const skills = overview.aiCenter?.skills ?? overview.ai_copilot?.skills ?? [];
  const connectors = overview.aiCenter?.mcpConnectors ?? overview.ai_copilot?.mcp_connectors ?? [];
  const chain = overview.eventChain?.length ? overview.eventChain : [
    { label: '接警', count: overview.stats.today_events, status: '已接入' },
    { label: '分类分级', count: overview.stats.today_events, status: '已接入' },
    { label: '派警', count: overview.stats.pending_orders, status: '待处置' },
    { label: '移动签收', count: overview.stats.online_staff, status: '进行中' },
    { label: '案件办理', count: overview.stats.open_cases, status: '待业务上报' },
    { label: '社区闭环', count: overview.stats.community_tasks, status: '待复核' },
    { label: '训练复盘', count: overview.stats.training_records, status: '待业务上报' },
  ];

  return (
    <section className="data-platform-page" aria-label="公安大数据与 AI 平台首页">
      <header className="data-platform-hero" aria-labelledby="data-platform-title">
        <div className="data-platform-hero-copy">
          <div className="data-platform-eyebrow"><span className="data-platform-live-dot" />公安大数据与 AI 平台 · 统一智能底座</div>
          <h1 id="data-platform-title">公安大数据与 AI 平台</h1>
          <p>以公安主数据为核心，以国产大模型、Agent、Skill、MCP 为智能中枢，连接五大业务系统，形成“感知—决策—执行—复盘”的警务闭环。</p>
          <div className="data-platform-hero-actions">
            <button className="data-platform-primary-button" type="button" onClick={() => navigate('command')}><Radio size={16} />进入接处警系统</button>
            <button className="data-platform-secondary-button" type="button" onClick={() => void refresh()} disabled={refreshing} aria-busy={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : undefined} />{refreshing ? '同步中' : '刷新平台状态'}</button>
          </div>
          <div className="data-platform-hero-meta"><span><ShieldCheck size={14} />公安内网私有化部署</span><span><Activity size={14} />{apiOnline ? '平台数据在线' : '等待业务数据接入'}</span><span><KeyRound size={14} />最小权限与全量审计</span></div>
        </div>
        <div className="data-platform-layer-map" aria-label="平台分层架构">
          <div className="data-platform-layer-label">PLATFORM ARCHITECTURE</div>
          <div className="data-platform-layer layer-top"><BrainCircuit size={18} /><strong>AI 智能中枢</strong><small>模型服务 · Agent · Skill · MCP</small></div>
          <div className="data-platform-layer-connectors"><span /><span /><span /><span /><span /></div>
          <div className="data-platform-layer layer-middle"><Database size={17} /><strong>数据资源中心</strong><small>主数据目录 · 知识库 · 事件总线</small></div>
          <div className="data-platform-layer layer-bottom"><span>接处警</span><span>执法办案</span><span>社区警务</span><span>勤务训练</span><span>移动勤务</span></div>
          <div className="data-platform-layer-foot"><span className="data-platform-status-dot" />统一身份 · 流程 · 消息 · 审计 · 运维</div>
        </div>
      </header>

      <section className="data-platform-kpi-grid" aria-label="平台运行指标">
        <div><span>今日接入警情</span><strong>{number(overview.stats.today_events)}</strong><small>统一事件中心</small></div>
        <div><span>主数据域</span><strong>{number(overview.dataCatalog?.domainCount)}</strong><small>{number(overview.dataCatalog?.objectCount)} 个统一数据对象</small></div>
        <div><span>在线警力</span><strong>{number(overview.stats.online_staff)}</strong><small>组织与移动端状态</small></div>
        <div><span>待确认任务</span><strong>{number(overview.stats.pending_orders)}</strong><small>高风险结果人工确认</small></div>
        <div><span>业务闭环率</span><strong>{overview.stats.completion_rate ?? '—'}<em>%</em></strong><small>接警到复盘持续沉淀</small></div>
      </section>

      <section className="data-platform-section" aria-label="数据资源中心">
        <div className="data-platform-section-heading"><div><span>01 · DATA FOUNDATION</span><h2>数据资源中心</h2></div><p>统一数据对象是五大业务系统共享、关联和追溯的共同语言。</p></div>
        <div className="data-platform-foundation-grid">
          <div className="data-platform-foundation-cards">
            {foundationCards.map((card) => { const Icon = card.icon; return <article className={`data-platform-foundation-card ${card.tone}`} key={card.title}><span><Icon size={18} /></span><div><h3>{card.title}</h3><p>{card.detail}</p></div><ChevronRight size={16} /></article>; })}
          </div>
          <div className="data-platform-object-panel" aria-label="统一数据对象">
            <div className="data-platform-panel-head"><div><span>UNIFIED DATA OBJECTS</span><h3>统一数据对象</h3></div><b>{overview.dataCatalog?.syncStatus ?? '待同步'}</b></div>
            <div className="data-platform-object-list">{domains.slice(0, 6).map((domain, index) => <div key={domain.key ?? domain.label ?? index}><span className="data-platform-object-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{domain.label ?? '业务数据域'}</strong><small>{domain.description ?? '公安业务对象与关联关系'}</small></div><b>{domain.objects?.length ?? 0} 对象</b></div>)}</div>
            <button className="data-platform-link-button" type="button" onClick={() => navigate('admin')}>查看数据目录与治理 <ArrowRight size={14} /></button>
          </div>
        </div>
      </section>

      <section className="data-platform-section" aria-label="AI 智能中枢">
        <div className="data-platform-section-heading"><div><span>02 · INTELLIGENCE FABRIC</span><h2>AI 智能中枢</h2></div><p>国产大模型在内网提供可控推理，Agent、Skill 与 MCP 按业务节点组合调用。</p></div>
        <div className="data-platform-ai-grid">
          <div className="data-platform-ai-core"><div className="data-platform-ai-model"><span><BrainCircuit size={21} /></span><div><strong>{overview.aiCenter?.model?.name ?? '国产大模型（内网部署）'}</strong><small>{overview.aiCenter?.model?.providers?.join(' · ') ?? 'DeepSeek · Qwen3'} · 统一推理服务</small></div><b>{overview.aiCenter?.model?.status ?? '可用'}</b></div><div className="data-platform-ai-capabilities"><span>文本理解与生成</span><span>语音转写与结构化</span><span>视觉与动作识别</span><span>知识库与类案检索</span></div><div className="data-platform-ai-contract"><CheckCircle2 size={16} /><div><strong>AI 结果责任链</strong><small>结果 · 置信度 · 依据/数据时间 · 人工确认 · 回退操作 · 审计编号</small></div></div></div>
          <div className="data-platform-runtime-panel"><div className="data-platform-panel-head"><div><span>AI RUNTIME</span><h3>智能服务运行态</h3></div><button type="button" onClick={() => navigate('ai-center')}>进入 AI 中心 <ArrowRight size={13} /></button></div><div className="data-platform-runtime-list"><div><span>Agent</span><strong>{agents.length || '—'}</strong><small>按业务角色协同</small></div><div><span>Skill</span><strong>{skills.length || '—'}</strong><small>按场景触发能力</small></div><div><span>MCP</span><strong>{connectors.length || '—'}</strong><small>受控连接数据与工具</small></div></div></div>
        </div>
      </section>

      <section className="data-platform-section" aria-label="五大业务系统">
        <div className="data-platform-section-heading"><div><span>03 · BUSINESS SYSTEMS</span><h2>五大业务系统</h2></div><p>每个系统承载独立业务流程，通过统一数据对象与 AI 中枢互联。</p></div>
        <div className="data-platform-business-grid">{systems.map((system) => { const Icon = system.icon; return <button className={`data-platform-business-card ${system.tone}`} type="button" key={system.key} onClick={() => navigate(system.key as Parameters<PlatformNavigate>[0])} aria-label={`进入${system.name}`}><div className="data-platform-business-card-head"><span><Icon size={20} /></span><b>{statusLabel(system.status)}</b></div><h3>{system.name}</h3><p>{system.description}</p><div className="data-platform-business-tags">{system.capabilities?.map((capability) => <em key={capability}>{capability}</em>)}</div><div className="data-platform-business-foot"><strong>{number(system.metric)}</strong><small>当前业务量</small><ArrowRight size={15} /></div></button>; })}</div>
      </section>

      <section className="data-platform-flow-section" aria-label="统一事件链">
        <div className="data-platform-section-heading"><div><span>04 · CLOSED LOOP</span><h2>统一事件链</h2></div><p>同一条事件链贯穿接警、处置、办案、社区治理与训练复盘。</p></div>
        <div className="data-platform-flow" aria-label="统一事件链流程">{chain.map((step, index) => <div className="data-platform-flow-step" key={step.label ?? index}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.label}</strong><b>{number(step.count)}</b><small>{step.status}</small>{index < chain.length - 1 && <ArrowRight className="data-platform-flow-arrow" size={15} />}</div>)}</div>
      </section>

      <section className="data-platform-governance" aria-label="平台治理与安全">
        <div><span className="data-platform-governance-icon"><ShieldCheck size={21} /></span><div><span>05 · PLATFORM GOVERNANCE</span><h2>平台治理与安全</h2><p>统一身份、数据权限、流程审计和 AI 安全策略，为公安内网部署提供可控边界。</p></div></div>
        <div className="data-platform-governance-items"><span><UsersRound size={15} />{overview.governance?.identity ?? '统一身份与最小权限'}</span><span><CheckCircle2 size={15} />{overview.governance?.audit ?? '关键操作全量留痕'}</span><span><KeyRound size={15} />{overview.governance?.humanReview ?? '高风险 AI 建议人工确认'}</span><span><Database size={15} />{overview.governance?.security ?? '公安内网部署，数据分级授权'}</span></div>
      </section>
    </section>
  );
}
