import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Building2,
  Cable,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileCheck2,
  LayoutDashboard,
  Menu,
  Monitor,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  Video,
  MapPinned,
  Workflow,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from 'antd';
import { appBasePath, routePath, viewForPath, type PlatformView } from '../lib/presentation';
import { trainingEntryPath } from '../lib/training-navigation';
import { normalizeLiveOverview } from '../lib/platform-overview';
import { CommandOperationsPage as CommandWorkbench } from './CommandOperationsPage';
import { AdminConsolePage } from './AdminConsolePage';
import { DeviceBridgesPage } from './DeviceBridgesPage';
import { PublicSecurityPlatformPage } from './PublicSecurityPlatformPage';
import { VideoLinkagePage } from './VideoLinkagePage';
import { NightMarketCommandPage } from './NightMarketCommandPage';
import { OfficerTrainingPage } from './OfficerTrainingPage';
import { ContactReviewPage } from './ContactReviewPage';
import { DutySituationPage } from './DutySituationPage';
import { XiaoanVoiceControls, useXiaoanVoice } from '../components/XiaoanVoice';
import { XiaoanAssistant } from '../components/XiaoanAssistant';
import {
  AICenterPage,
  CaseHandlingPage,
  CommunityPolicingPage,
  CommandOperationsPage,
} from './PoliceDomainPages';

export type { PlatformView } from '../lib/presentation';

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

const PRODUCT_NAME = '小安智能预警系统';
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');

const systemNavItems: Array<{ view: PlatformView; label: string; shortLabel: string; icon: typeof Activity; section: '业务工作台' | '平台能力' }> = [
  { view: 'platform', label: '平台总览', shortLabel: '总览', icon: LayoutDashboard, section: '业务工作台' },
  { view: 'command', label: '接处警系统', shortLabel: '接处警', icon: Radio, section: '业务工作台' },
  { view: 'case', label: '执法办案系统', shortLabel: '执法办案', icon: FileCheck2, section: '业务工作台' },
  { view: 'community', label: '社区警务系统', shortLabel: '社区警务', icon: Building2, section: '业务工作台' },
  { view: 'duty-situation', label: 'A1 勤务态势大屏', shortLabel: '勤务态势', icon: Monitor, section: '业务工作台' },
  { view: 'contact-review', label: '接触记录检索', shortLabel: '接触检索', icon: Search, section: '业务工作台' },
  { view: 'video', label: '视频联动', shortLabel: '视频联动', icon: Video, section: '业务工作台' },
  { view: 'night-market-command', label: '夜市指挥', shortLabel: '夜市指挥', icon: MapPinned, section: '业务工作台' },
  { view: 'ai-center', label: 'AI能力中心', shortLabel: 'AI 中心', icon: BrainCircuit, section: '平台能力' },
  { view: 'admin', label: '平台治理中心', shortLabel: '平台治理', icon: ShieldCheck, section: '平台能力' },
  { view: 'device-bridges', label: '设备桥接管理', shortLabel: '设备桥接', icon: Cable, section: '平台能力' },
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
  return viewForPath(window.location.pathname);
}

function ShellNav({ view, navigate, open, close, online }: { view: PlatformView; navigate: (next: PlatformView) => void; open: boolean; close: () => void; online: boolean }) {
  const sections = ['业务工作台', '平台能力'] as const;
  return <>
    <aside id="platform-control-sidebar" className={`platform-control-sidebar ${open ? 'open' : ''}`} aria-label="平台主导航">
      <button className="platform-control-brand" type="button" onClick={() => navigate('platform')}>
        <img className="platform-control-brand-mark" src={`${appBasePath}/public-security-mark.svg`} alt="" />
        <span><strong>小安智能预警系统</strong><small>智能预警工作台</small></span>
      </button>
      <button type="button" className="platform-control-nav-close ui-icon-button" aria-label="关闭导航" onClick={close}><X size={18} /></button>
      <div className="platform-control-context"><span>当前组织</span><strong>市公安局</strong><small>指挥中心 · 综合值守</small></div>
      {sections.map((section) => <div className="platform-control-nav-group" key={section}>
        <span className="platform-control-nav-label">{section}</span>
        <nav aria-label={section}>{systemNavItems.filter((item) => item.section === section).map((item) => { const Icon = item.icon; return <div className="platform-control-nav-entry" key={item.view}><button type="button" className={`platform-control-nav-item ${view === item.view ? 'active' : ''}`} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}><span className="platform-control-nav-icon"><Icon size={15} /></span><span>{item.label}</span>{view === item.view ? <span className="platform-control-nav-live" /> : <ChevronRight size={13} />}</button></div>; })}</nav>
      </div>)}
      <div className={`platform-control-sidebar-foot ${online ? 'online' : 'offline'}`}><span className="platform-control-health-dot" /><span>{online ? '数据连接正常' : '数据连接未就绪'}</span><ShieldCheck size={14} /></div>
    </aside>
    {open && <button className="platform-control-scrim" type="button" aria-label="关闭导航" onClick={close} />}
  </>;
}

export function DashboardApp() {
  const { stop: stopVoice } = useXiaoanVoice();
  const [view, setView] = useState<PlatformView>(pathView);
  useEffect(() => { stopVoice(); }, [view, stopVoice]);
  const [overview, setOverview] = useState<PlatformOverview>(demoOverview);
  const [apiOnline, setApiOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(true);
  const [statusMessage, setStatusMessage] = useState('正在读取平台运行态');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const menuRef = useRef<HTMLButtonElement>(null);
  const hasLiveData = useRef(false);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE}/platform/overview`);
      if (!response.ok) throw new Error(`平台接口返回 ${response.status}`);
      const payload = (await response.json()) as PlatformOverview;
      setOverview(normalizeLiveOverview(payload));
      setApiOnline(true);
      hasLiveData.current = true;
      setLastSync(new Date());
      setStatusMessage('平台运行态已更新，内网数据在线');
    } catch {
      setApiOnline(false);
      setStatusMessage(hasLiveData.current ? '连接中断，当前显示上次同步数据' : '未连接业务服务，当前为演示数据');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    const interval = window.setInterval(() => void loadOverview(), 30000);
    const clockInterval = window.setInterval(() => setClock(new Date()), 1000);
    const onPopState = () => { setView(pathView()); setMobileNavOpen(false); };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(clockInterval);
      window.removeEventListener('popstate', onPopState);
    };
  }, [loadOverview]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 961px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileNavOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const sidebar = document.getElementById('platform-control-sidebar');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []).filter((element) => element.getClientRects().length);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        menuRef.current?.focus();
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [mobileNavOpen]);

  const navigate = useCallback((next: PlatformView) => {
    const target = next === 'duty-plan' ? trainingEntryPath() : routePath(next);
    if (window.location.pathname !== target) window.history.pushState({}, '', target);
    setView(next);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);


  const navView = view === 'command-workbench' ? 'command' : view;
  const currentNav = useMemo(() => systemNavItems.find((item) => item.view === navView) ?? systemNavItems[0], [navView]);
  const formattedDate = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(clock);
  const formattedTime = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(clock);

  if (view === 'command-workbench' && new URLSearchParams(window.location.search).get('surface') === 'display') return <CommandWorkbench />;
  if (view === 'video') return <VideoLinkagePage onBack={() => navigate('platform')} />;
  if (view === 'night-market-command') return <NightMarketCommandPage onBack={() => navigate('video')} />;
  if (view === 'duty-plan') return <OfficerTrainingPage onSituation={() => navigate('duty-situation')} />;
  if (view === 'duty-situation') return <DutySituationPage onBack={() => navigate('platform')} onTraining={(taskId) => {
    window.history.pushState({}, '', trainingEntryPath(taskId));
    setView('duty-plan');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }} />;
  const page = view === 'contact-review'
    ? <ContactReviewPage onBack={() => navigate('platform')} />
    : view === 'platform'
    ? <PublicSecurityPlatformPage overview={overview} apiOnline={apiOnline} refreshing={refreshing} refresh={loadOverview} navigate={navigate} />
    : view === 'command-workbench'
      ? <CommandWorkbench onBack={() => navigate('command')} />
    : view === 'command'
      ? <CommandOperationsPage overview={overview} apiOnline={apiOnline} navigate={navigate} refresh={loadOverview} />
      : view === 'case'
        ? <CaseHandlingPage overview={overview} apiOnline={apiOnline} navigate={navigate} />
        : view === 'community'
          ? <CommunityPolicingPage overview={overview} apiOnline={apiOnline} navigate={navigate} />
          : view === 'device-bridges'
            ? <DeviceBridgesPage />
          : view === 'ai-center'
                ? <AICenterPage overview={overview} apiOnline={apiOnline} navigate={navigate} />
                : <AdminConsolePage apiOnline={apiOnline} refresh={loadOverview} navigate={navigate} />;

  return <main className="platform-control-shell">
    <a className="skip-link" href="#workspace-content">跳转到工作区</a>
    <ShellNav view={navView} navigate={navigate} open={mobileNavOpen} close={() => { setMobileNavOpen(false); menuRef.current?.focus(); }} online={apiOnline} />
    <div className="platform-control-main">
      <header className="platform-control-topbar">
        <div className="platform-control-topbar-left">
              <button ref={menuRef} className="platform-control-menu-button ui-icon-button" type="button" aria-label={mobileNavOpen ? '关闭导航' : '打开导航'} aria-expanded={mobileNavOpen} aria-controls="platform-control-sidebar" onClick={() => setMobileNavOpen((value) => !value)}>{mobileNavOpen ? <X size={18} /> : <Menu size={18} />}</button>
          <div className="platform-control-breadcrumb"><span>工作空间</span><ChevronRight size={14} /><strong>{currentNav.label}</strong></div>
        </div>
        <div className="platform-control-topbar-right">
          <Tooltip title={assistantVisible ? '隐藏小安助手' : '显示小安助手'}><button type="button" className="ui-icon-button xiaoan-shell-entry" aria-label={assistantVisible ? '隐藏小安助手' : '显示小安助手'} aria-pressed={assistantVisible} onClick={() => setAssistantVisible(value => !value)}><ShieldCheck size={17} /></button></Tooltip>
          <XiaoanVoiceControls />
          <span className="platform-control-clock"><Clock3 size={14} />{formattedDate} {formattedTime}</span>
              {view !== 'device-bridges' && <span className={`platform-control-sync ${apiOnline ? 'online' : 'demo'}`} aria-live="polite"><span />{apiOnline ? '内网数据在线' : hasLiveData.current ? '离线快照' : '演示数据'}</span>}
          <Tooltip title="刷新平台数据"><button className="platform-control-refresh ui-icon-button" type="button" onClick={() => void loadOverview()} disabled={refreshing} aria-label="刷新平台运行态"><RefreshCw size={16} className={refreshing ? 'spin' : undefined} /></button></Tooltip>
          <span className="platform-control-user" title="市公安局 · 指挥中心"><span>值</span><b>值班席</b></span>
        </div>
          </header>
          {!apiOnline && view !== 'device-bridges' && <p className="platform-control-status-message" role="status"><AlertTriangle size={15} />{statusMessage}</p>}
      <div id="workspace-content" tabIndex={-1} className="platform-control-content">{page}</div>
      <footer className="platform-control-footer"><span><ShieldCheck size={14} />高风险 AI 建议需人工确认</span><span><Database size={14} />操作留痕 · 分级授权</span><span>最近同步 {lastSync ? lastSync.toLocaleTimeString('zh-CN', { hour12: false }) : '尚未连接'}</span></footer>
    </div>
    <XiaoanAssistant visible={assistantVisible} onVisibilityChange={setAssistantVisible} />
  </main>;
}
