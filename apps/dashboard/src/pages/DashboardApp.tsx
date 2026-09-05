import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UsersRound,
  Workflow,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminConsolePage } from './AdminConsolePage';
import { PublicSecurityPlatformPage } from './PublicSecurityPlatformPage';
import {
  AICenterPage,
  CaseHandlingPage,
  CommandOperationsPage,
  CommunityPolicingPage,
  MobileDutyPage,
  TrainingOperationsPage,
} from './PoliceDomainPages';

export type PlatformView = 'platform' | 'command' | 'case' | 'community' | 'duty-plan' | 'mobile' | 'ai-center' | 'admin';

export type PlatformOverview = {
  project?: string;
  subtitle?: string;
  updatedAt?: string;
  organization?: { name?: string; unit?: string; role?: string };
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
  events?: Array<{
    id?: string;
    title?: string;
    area?: string;
    bay?: string;
    time?: string;
    status?: string;
    level?: string;
    owner?: string;
  }>;
  linkage?: { stats?: { activeRisks?: number; onlineDevices?: number; droneTasks?: number } };
  security_model?: { configured?: boolean; model?: { exists?: boolean; sizeMb?: number } };
  ai_copilot?: {
    agents?: Array<{ name: string; status: string; currentTask: string; latency: string }>;
    mcp_connectors?: Array<{ name: string; status: string; scope: string; lastSync: string }>;
    skills?: Array<{ name: string; status: string; trigger: string; confidence: number }>;
  };
  dataCatalog?: {
    domainCount?: number;
    objectCount?: number;
    syncStatus?: string;
    domains?: Array<{ key?: string; label?: string; description?: string; objects?: string[]; status?: string }>;
  };
  businessSystems?: Array<{
    key?: string;
    name?: string;
    shortName?: string;
    description?: string;
    capabilities?: string[];
    status?: string;
    metric?: number;
  }>;
  workspaces?: Record<string, Record<string, unknown>>;
  aiCenter?: {
    model?: { name?: string; status?: string; providers?: string[] };
    capabilities?: Array<{ name?: string; scope?: string; status?: string }>;
    recommendations?: Array<{ title?: string; detail?: string; priority?: string }>;
    agents?: Array<{ name: string; status: string; currentTask: string; latency: string }>;
    skills?: Array<{ name: string; status: string; trigger: string; confidence: number }>;
    mcpConnectors?: Array<{ name: string; status: string; scope: string; lastSync: string }>;
  };
  eventChain?: Array<{ label?: string; count?: number; status?: string }>;
  governance?: Record<string, string>;
};

const PRODUCT_NAME = '公安大数据与 AI 平台';
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');
const BUSINESS_ROUTE_ALIASES = {
  alarm: 'command',
  training: 'duty-plan',
} as const;

const systemNavItems: Array<{ view: PlatformView; label: string; shortLabel: string; icon: typeof Activity; section: '业务工作台' | '平台能力' }> = [
  { view: 'platform', label: '平台总览', shortLabel: '总览', icon: LayoutDashboard, section: '业务工作台' },
  { view: 'command', label: '接处警系统', shortLabel: '接处警', icon: Radio, section: '业务工作台' },
  { view: 'case', label: '执法办案系统', shortLabel: '执法办案', icon: FileCheck2, section: '业务工作台' },
  { view: 'community', label: '社区警务系统', shortLabel: '社区警务', icon: Building2, section: '业务工作台' },
  { view: 'duty-plan', label: '勤务训练系统', shortLabel: '勤务训练', icon: GraduationCap, section: '业务工作台' },
  { view: 'mobile', label: '移动勤务系统', shortLabel: '移动勤务', icon: Smartphone, section: '业务工作台' },
  { view: 'ai-center', label: 'AI能力中心', shortLabel: 'AI 中心', icon: BrainCircuit, section: '平台能力' },
  { view: 'admin', label: '平台治理中心', shortLabel: '平台治理', icon: ShieldCheck, section: '平台能力' },
];

const demoOverview: PlatformOverview = {
  project: PRODUCT_NAME,
  subtitle: '统一警务数据与智能应用底座',
  organization: { name: '市公安局', unit: '指挥中心 · 综合值守', role: '平台管理员' },
  stats: {
    today_events: 128,
    pending_orders: 12,
    online_staff: 86,
    avg_response_minutes: 3.6,
    completion_rate: 91,
    urgent_events: 4,
    open_cases: 37,
    community_tasks: 24,
    training_records: 318,
  },
  events: [
    { id: 'demo-001', title: '纠纷警情：现场有人受伤', area: '东湖分局 · 站前网格', bay: '东湖分局 · 站前网格', time: '09:42', status: '待人工确认', level: '高风险', owner: '指挥席 02' },
    { id: 'demo-002', title: '群众求助：家属失联', area: '西湖分局 · 朝阳洲网格', bay: '西湖分局 · 朝阳洲网格', time: '09:38', status: '已派警', level: '中风险', owner: '巡逻组 A' },
    { id: 'demo-003', title: '反诈劝阻：疑似转账风险', area: '青山湖分局 · 湖坊派出所', bay: '青山湖分局 · 湖坊派出所', time: '09:31', status: '处理中', level: '中风险', owner: '社区民警 17' },
    { id: 'demo-004', title: '邻里求助：噪声扰民', area: '红谷滩分局 · 凤凰洲网格', bay: '红谷滩分局 · 凤凰洲网格', time: '09:18', status: '已完成', level: '低风险', owner: '网格警务队' },
  ],
  businessSystems: [
    { key: 'command', name: '接处警系统', shortName: '接处警', description: '接警、询问、分类分级、派警和处置回传', capabilities: ['语音转写', '警单摘要', '分级派警', '警情画像'], status: '运行中', metric: 128 },
    { key: 'case', name: '执法办案系统', shortName: '执法办案', description: '法律依据、取证清单、卷宗审核和类案辅助', capabilities: ['法律助手', '证据校验', '文书生成', '串并分析'], status: '运行中', metric: 37 },
    { key: 'community', name: '社区警务系统', shortName: '社区警务', description: '网格画像、走访任务、隐患闭环和基层治理', capabilities: ['辖区画像', '走访任务', '隐患闭环', '热力研判'], status: '运行中', metric: 24 },
    { key: 'duty-plan', name: '勤务训练系统', shortName: '勤务训练', description: '课程编辑、实战模拟、动作识别和一人一档', capabilities: ['AI课程编辑', 'AI教官', '训练评估', '体能识别'], status: '运行中', metric: 318 },
    { key: 'mobile', name: '移动勤务系统', shortName: '移动勤务', description: '移动核验、现场指引、任务签收和移动审批', capabilities: ['身份核验', '伴随指引', '移动指令', 'AI眼镜'], status: '运行中', metric: 86 },
  ],
  dataCatalog: {
    domainCount: 6,
    objectCount: 21,
    syncStatus: '已同步',
    domains: [
      { key: 'org', label: '组织与警力', description: '机构、岗位、在岗状态', objects: ['机构', '民警', '岗位'], status: '健康' },
      { key: 'alarm', label: '警情与指令', description: '接报、分级、派警、处置回传', objects: ['警情', '指令', '处置结果'], status: '健康' },
      { key: 'case', label: '案件与证据', description: '案件、卷宗、证据链', objects: ['案件', '证据', '文书'], status: '健康' },
      { key: 'person', label: '人员与车辆', description: '身份核验、车辆和轨迹', objects: ['人员', '车辆', '轨迹'], status: '健康' },
      { key: 'community', label: '社区与地址', description: '网格、重点人地事物', objects: ['网格', '地址', '走访任务'], status: '关注' },
      { key: 'training', label: '训练与健康', description: '课程、成绩、训练档案', objects: ['课程', '成绩', '健康指标'], status: '健康' },
    ],
  },
  ai_copilot: {
    agents: [
      { name: '接处警协同 Agent', status: 'running', currentTask: '警情摘要与分级建议', latency: '240ms' },
      { name: '执法办案助手 Agent', status: 'active', currentTask: '法条与证据规则检索', latency: '310ms' },
      { name: '勤务训练教官 Agent', status: 'active', currentTask: '训练评分与短板画像', latency: '280ms' },
      { name: '移动勤务伴随 Agent', status: 'running', currentTask: '现场指引与身份核验提示', latency: '180ms' },
    ],
    skills: [
      { name: '警情结构化抽取', status: 'active', trigger: '接警语音进入', confidence: 96 },
      { name: '证据规则校验', status: 'active', trigger: '案件提交前', confidence: 92 },
      { name: '训练短板画像', status: 'active', trigger: '训练结束后', confidence: 88 },
    ],
    mcp_connectors: [
      { name: '公安主数据目录 MCP', status: '在线', scope: '组织 / 人员 / 地点 / 车辆', lastSync: '刚刚' },
      { name: '法律与类案知识库 MCP', status: '在线', scope: '法条 / 判例 / 制度', lastSync: '2 分钟前' },
      { name: '统一事件链 MCP', status: '在线', scope: '警情 / 案件 / 训练 / 移动', lastSync: '刚刚' },
    ],
  },
  aiCenter: {
    model: { name: '国产大模型（内网部署）', status: '运行中', providers: ['DeepSeek', 'Qwen3'] },
    recommendations: [
      { title: '优先确认高风险警情', detail: '1 条高风险警情等待指挥席确认分级和派警建议。', priority: '高' },
      { title: '补齐社区重点地址画像', detail: '站前网格有 3 条重复警情关联线索待走访核查。', priority: '中' },
    ],
  },
  eventChain: [
    { label: '接警', count: 128, status: '已接入' },
    { label: '分类分级', count: 128, status: '已接入' },
    { label: '派警', count: 12, status: '待处置' },
    { label: '移动签收', count: 8, status: '进行中' },
    { label: '案件办理', count: 37, status: '已接入' },
    { label: '社区闭环', count: 24, status: '待复核' },
    { label: '训练复盘', count: 318, status: '已接入' },
  ],
  governance: { identity: '统一身份与最小权限', audit: '关键操作 100% 留痕', humanReview: 'AI建议必须人工确认', security: '公安内网部署，数据分级授权' },
};

function pathView(): PlatformView {
  const pathname = window.location.pathname;
  if (pathname === '/' || pathname.startsWith('/platform')) return 'platform';
  if (pathname.startsWith('/command')) return 'command';
  if (pathname.startsWith('/case')) return 'case';
  if (pathname.startsWith('/community')) return 'community';
  if (pathname.startsWith('/duty-plan')) return 'duty-plan';
  if (pathname.startsWith('/mobile')) return 'mobile';
  if (pathname.startsWith('/ai-center')) return 'ai-center';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'platform';
}

function mergeBusinessSystems(runtimeSystems?: PlatformOverview['businessSystems']): PlatformOverview['businessSystems'] {
  if (!runtimeSystems?.length) return demoOverview.businessSystems;

  return demoOverview.businessSystems?.map((fallback) => {
    const runtime = runtimeSystems.find((item) => {
      const route = BUSINESS_ROUTE_ALIASES[item.key as keyof typeof BUSINESS_ROUTE_ALIASES] ?? item.key;
      return route === fallback.key;
    });

    return {
      ...fallback,
      key: fallback.key,
      name: runtime?.name ?? fallback.name,
      description: runtime?.description ?? fallback.description,
      status: runtime?.status ?? fallback.status,
      metric: runtime?.metric ?? fallback.metric,
      capabilities: runtime?.capabilities?.length ? runtime.capabilities : fallback.capabilities,
    };
  });
}

function mergeOverview(payload: PlatformOverview): PlatformOverview {
  return {
    ...demoOverview,
    ...payload,
    stats: { ...demoOverview.stats, ...(payload.stats ?? {}) },
    events: payload.events?.length ? payload.events : demoOverview.events,
    businessSystems: mergeBusinessSystems(payload.businessSystems),
    dataCatalog: { ...demoOverview.dataCatalog, ...(payload.dataCatalog ?? {}), domains: payload.dataCatalog?.domains?.length ? payload.dataCatalog.domains : demoOverview.dataCatalog?.domains },
    ai_copilot: { ...demoOverview.ai_copilot, ...(payload.ai_copilot ?? {}), agents: payload.ai_copilot?.agents?.length ? payload.ai_copilot.agents : demoOverview.ai_copilot?.agents, skills: payload.ai_copilot?.skills?.length ? payload.ai_copilot.skills : demoOverview.ai_copilot?.skills, mcp_connectors: payload.ai_copilot?.mcp_connectors?.length ? payload.ai_copilot.mcp_connectors : demoOverview.ai_copilot?.mcp_connectors },
    aiCenter: { ...demoOverview.aiCenter, ...(payload.aiCenter ?? {}) },
    eventChain: payload.eventChain?.length ? payload.eventChain : demoOverview.eventChain,
    governance: { ...demoOverview.governance, ...(payload.governance ?? {}) },
  };
}

function ShellNav({ view, navigate, open, close }: { view: PlatformView; navigate: (next: PlatformView) => void; open: boolean; close: () => void }) {
  const sections = ['业务工作台', '平台能力'] as const;
  return <>
    <aside id="platform-control-sidebar" className={`platform-control-sidebar ${open ? 'open' : ''}`} aria-label="平台主导航">
      <button className="platform-control-brand" type="button" onClick={() => navigate('platform')}>
        <span className="platform-control-brand-mark"><ShieldCheck size={19} /></span>
        <span><strong>{PRODUCT_NAME}</strong><small>统一警务工作台</small></span>
      </button>
      <div className="platform-control-context"><span>当前组织</span><strong>市公安局</strong><small>指挥中心 · 综合值守</small></div>
      {sections.map((section) => <div className="platform-control-nav-group" key={section}>
        <span className="platform-control-nav-label">{section}</span>
        <nav aria-label={section}>{systemNavItems.filter((item) => item.section === section).map((item) => { const Icon = item.icon; return <button key={item.view} type="button" className={`platform-control-nav-item ${view === item.view ? 'active' : ''}`} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}><span className="platform-control-nav-icon"><Icon size={15} /></span><span>{item.label}</span>{view === item.view ? <span className="platform-control-nav-live" /> : <ChevronRight size={13} />}</button>; })}</nav>
      </div>)}
      <div className="platform-control-sidebar-foot"><span className="platform-control-health-dot" /><span>公安内网 · 数据同步正常</span></div>
    </aside>
    {open && <button className="platform-control-scrim" type="button" aria-label="关闭导航" onClick={close} />}
  </>;
}

export function DashboardApp() {
  const [view, setView] = useState<PlatformView>(pathView);
  const [overview, setOverview] = useState<PlatformOverview>(demoOverview);
  const [apiOnline, setApiOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('正在读取平台运行态');
  const [clock, setClock] = useState(() => new Date());

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE}/platform/overview`);
      if (!response.ok) throw new Error(`平台接口返回 ${response.status}`);
      const payload = (await response.json()) as PlatformOverview;
      setOverview(mergeOverview(payload));
      setApiOnline(true);
      setStatusMessage('平台运行态已更新，内网数据在线');
    } catch {
      setApiOnline(false);
      setOverview((current) => mergeOverview(current));
      setStatusMessage('平台接口暂不可用，当前展示样板运行态');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    const interval = window.setInterval(() => void loadOverview(), 30000);
    const clockInterval = window.setInterval(() => setClock(new Date()), 1000);
    const onPopState = () => setView(pathView());
    window.addEventListener('popstate', onPopState);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(clockInterval);
      window.removeEventListener('popstate', onPopState);
    };
  }, [loadOverview]);

  const navigate = useCallback((next: PlatformView) => {
    const target = next === 'platform' ? '/platform' : `/${next}`;
    if (window.location.pathname !== target) window.history.pushState({}, '', target);
    setView(next);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const currentNav = useMemo(() => systemNavItems.find((item) => item.view === view) ?? systemNavItems[0], [view]);
  const formattedDate = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(clock);
  const formattedTime = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(clock);

  const page = view === 'platform'
    ? <PublicSecurityPlatformPage overview={overview} apiOnline={apiOnline} refreshing={refreshing} refresh={loadOverview} navigate={navigate} />
    : view === 'command'
      ? <CommandOperationsPage overview={overview} apiOnline={apiOnline} navigate={navigate} refresh={loadOverview} />
      : view === 'case'
        ? <CaseHandlingPage overview={overview} apiOnline={apiOnline} navigate={navigate} />
        : view === 'community'
          ? <CommunityPolicingPage overview={overview} apiOnline={apiOnline} navigate={navigate} />
          : view === 'duty-plan'
            ? <TrainingOperationsPage overview={overview} apiOnline={apiOnline} navigate={navigate} refresh={loadOverview} />
            : view === 'mobile'
              ? <MobileDutyPage overview={overview} apiOnline={apiOnline} navigate={navigate} />
              : view === 'ai-center'
                ? <AICenterPage overview={overview} apiOnline={apiOnline} navigate={navigate} />
                : <AdminConsolePage apiOnline={apiOnline} refresh={loadOverview} navigate={navigate} />;

  return <main className="platform-control-shell">
    <ShellNav view={view} navigate={navigate} open={mobileNavOpen} close={() => setMobileNavOpen(false)} />
    <div className="platform-control-main">
      <header className="platform-control-topbar">
        <div className="platform-control-topbar-left">
              <button className="platform-control-menu-button" type="button" aria-label={mobileNavOpen ? '关闭导航' : '打开导航'} aria-expanded={mobileNavOpen} aria-controls="platform-control-sidebar" onClick={() => setMobileNavOpen((value) => !value)}>{mobileNavOpen ? <X size={18} /> : <Menu size={18} />}</button>
          <div className="platform-control-breadcrumb"><span>{PRODUCT_NAME}</span><ChevronRight size={14} /><strong>{currentNav.label}</strong></div>
        </div>
        <div className="platform-control-topbar-right">
          <span className="platform-control-org"><Building2 size={14} />市公安局 · 指挥中心</span>
          <span className="platform-control-clock"><Clock3 size={14} />{formattedDate} {formattedTime}</span>
              <span className={`platform-control-sync ${apiOnline ? 'online' : 'demo'}`} aria-live="polite"><span />{apiOnline ? '内网数据在线' : '样板运行态'}</span>
          <button className="platform-control-refresh" type="button" onClick={() => void loadOverview()} disabled={refreshing} aria-label="刷新平台运行态"><RefreshCw size={15} className={refreshing ? 'spin' : undefined} /></button>
        </div>
          </header>
          <p className="platform-control-status-message" aria-live="polite">{statusMessage}</p>
      <div className="platform-control-content">{page}</div>
      <footer className="platform-control-footer"><span><ShieldCheck size={13} />AI 输出带依据、置信度、人工确认与审计编号</span><span><Database size={13} />统一事件链 · 主数据目录 · 最小权限</span><span><Activity size={13} />运行态更新时间 {formattedTime}</span></footer>
    </div>
  </main>;
}
