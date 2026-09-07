import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  ExternalLink,
  Gauge,
  LayoutDashboard,
  ListFilter,
  Menu,
  RefreshCw,
  MapPin,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PoliceJurisdictionAmapMap } from '../components/NanchangAmapMap';
import { appBasePath } from '../lib/presentation';

type View = 'entry' | 'command' | 'admin';
type Tone = 'danger' | 'warn' | 'safe' | 'info' | 'orange' | 'blue' | 'green';
type EventStatus = '已提交' | '已派单' | '已接收' | '已到达' | '处理中' | '已完成';
type SafetyEvent = {
  id: string;
  title: string;
  bay: string;
  level: string;
  source: string;
  status: EventStatus;
  owner: string;
  distance: string;
  time: string;
  updatedAt: string;
  description: string;
  result?: string | null;
  meta?: {
    alarmLocation?: GeoPoint;
    reporterLocation?: GeoPoint;
    assignment?: {
      staffId: string;
      staffName: string;
      role: string;
      reason?: string;
      assignedAt?: string;
    };
    route?: SafetyRoute;
  };
};
type GeoPoint = {
  latitude: number;
  longitude: number;
  name?: string;
  source?: string;
};
type SafetyRoute = {
  mode: string;
  modeLabel: string;
  etaLabel: string;
  distanceLabel: string;
  distanceMeters: number;
  origin: GeoPoint;
  destination: GeoPoint;
  points?: GeoPoint[];
};
type NightMarket = {
  id: string;
  name: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  tone: 'danger' | 'warn' | 'safe' | 'service';
  summary: string;
};
type PatrolStaff = {
  id: string;
  name: string;
  role: string;
  online: boolean;
  location?: GeoPoint;
  updatedAt?: string;
  modes?: string[];
};
type Overview = {
  project: string;
  subtitle: string;
  stats: {
    today_events: number;
    pending_orders: number;
    online_staff: number;
    avg_response_minutes: number;
    completion_rate: number;
    urgent_events: number;
  };
  events: SafetyEvent[];
  night_markets?: NightMarket[];
  patrol_staff?: PatrolStaff[];
  ai_copilot?: {
    agents?: Array<{ name: string; status: string; currentTask: string; latency: string }>;
    mcp_connectors?: Array<{ name: string; status: string; scope: string; lastSync: string }>;
    skills?: Array<{ name: string; status: string; trigger: string; confidence: number }>;
  };
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');
const statusFlow: EventStatus[] = ['已提交', '已派单', '已接收', '已到达', '处理中', '已完成'];

const fallbackMarkets: NightMarket[] = [
  { id: 'NC-NM-001', name: '绳金塔美食街', district: '西湖区', address: '金塔东街与绳金塔街周边', latitude: 28.6614924, longitude: 115.8972484, tone: 'danger', summary: '绳金塔民俗风情街区，夜间餐饮、游客和商户摊位密集。' },
  { id: 'NC-NM-002', name: '蛤蟆街夜市', district: '东湖区', address: '豫章后街、象山北路周边', latitude: 28.6889072, longitude: 115.8834701, tone: 'warn', summary: '老牌夜宵街区，人流、非机动车和餐饮排队集中。' },
  { id: 'NC-NM-003', name: '大士院老街', district: '东湖区', address: '半步街、大士院老街周边', latitude: 28.6890925, longitude: 115.8799397, tone: 'warn', summary: '传统小吃老街，适合纳入老城夜间巡防网格。' },
  { id: 'NC-NM-004', name: '万寿宫历史文化街区', district: '西湖区', address: '船山路、翠花街周边', latitude: 28.6771912, longitude: 115.8822981, tone: 'warn', summary: '核心文旅夜消费街区，节假日客流和演艺活动叠加。' },
  { id: 'NC-NM-005', name: '珠宝街', district: '西湖区', address: '珠宝街、嫁妆街周边', latitude: 28.6759581, longitude: 115.8854278, tone: 'warn', summary: '老城美食街区，与万寿宫、羊子街形成连片夜游动线。' },
  { id: 'NC-NM-006', name: '羊子街夜市', district: '西湖区', address: '羊子街、八一大道周边', latitude: 28.6772505, longitude: 115.8955663, tone: 'safe', summary: '老城夜宵与小吃点位，适合与珠宝街联动巡查。' },
  { id: 'NC-NM-007', name: '699文化创意园夜市', district: '青山湖区', address: '上海路699文化创意园', latitude: 28.6738, longitude: 115.9348, tone: 'safe', summary: '文创园区型夜间消费点，餐饮、演艺和青年客群集中。' },
  { id: 'NC-NM-008', name: '蓝海特色夜市街', district: '东湖区', address: '青山南路118号蓝海购物广场', latitude: 28.6956, longitude: 115.8892, tone: 'service', summary: '商场周边夜市街，适合关注停车、人流导入和商户求助。' },
  { id: 'NC-NM-009', name: '玉河湾夜市', district: '青云谱区', address: '解放西路玉河湾广场', latitude: 28.6455, longitude: 115.9182, tone: 'service', summary: '商圈广场型夜市，散场交通和周边道路秩序是重点。' },
  { id: 'NC-NM-010', name: 'IM乐盈广场夜市', district: '经开区', address: '桂苑大道486号IM乐盈广场', latitude: 28.7388, longitude: 115.8296, tone: 'service', summary: '高校与商圈叠加型夜间消费点，关注晚高峰聚集。' },
  { id: 'NC-NM-011', name: '安义古村夜市', district: '安义县', address: '安义古村群景区', latitude: 28.8506, longitude: 115.5548, tone: 'safe', summary: '景区型夜游夜市，适合文旅、停车和景区安保联动。' },
  { id: 'NC-NM-012', name: '洪都夜巷', district: '青云谱区', address: '新溪桥北二路周边', latitude: 28.642696, longitude: 115.9185393, tone: 'safe', summary: '青云谱夜间消费街区，适合纳入辖区夜巡线路。' },
  { id: 'NC-NM-013', name: '警民路夜市', district: '青云谱区', address: '警民路周边', latitude: 28.6193087, longitude: 115.8988405, tone: 'safe', summary: '社区型夜市街，重点关注烟火摊点和居民区边界秩序。' },
  { id: 'NC-NM-014', name: '怡园路鸿鹄美食街', district: '红谷滩区', address: '怡园路、凤凰中大道周边', latitude: 28.6818, longitude: 115.8549, tone: 'safe', summary: '红谷滩居住区与办公区交界夜宵点，适合晚间巡逻覆盖。' },
  { id: 'NC-NM-015', name: '瑶湖里夜市街区', district: '高新区', address: '瑶湖岱山三街周边', latitude: 28.6744836, longitude: 116.0110159, tone: 'safe', summary: '瑶湖片区夜间消费街，关注高校和居住区夜间人流。' },
  { id: 'NC-NM-016', name: '寻味艾溪里', district: '高新区', address: '创新二路16号周边', latitude: 28.6925, longitude: 115.9815, tone: 'safe', summary: '艾溪湖片区夜间消费点，适合与湖区商圈联勤。' },
  { id: 'NC-NM-017', name: '阳门里美食街', district: '高新区', address: '瑶湖西二路周边', latitude: 28.6978333, longitude: 116.027489, tone: 'safe', summary: '瑶湖东向美食街，适合夜间外卖骑手和摊点秩序治理。' },
  { id: 'NC-NM-018', name: '紫荆路步行街夜市', district: '经开区', address: '紫荆路商业步行街、菊圃路周边', latitude: 28.7363827, longitude: 115.8287984, tone: 'warn', summary: '高校片区知名夜市，夜间客流、摊位和交通压力集中。' },
  { id: 'NC-NM-019', name: '滨湖大道活力夜市街', district: '南昌县', address: '滨湖大道世纪名城北门周边', latitude: 28.556, longitude: 116.015, tone: 'safe', summary: '县区社区型夜市街，适合接入属地巡防与城管联动。' },
  { id: 'NC-NM-020', name: '福州路潮玩夜市', district: '东湖区', address: '福州路、八一大道周边', latitude: 28.6843758, longitude: 115.8984017, tone: 'safe', summary: '中心城区夜间潮玩消费点，适合与八一广场周边安保联动。' },
  { id: 'NC-NM-021', name: '赣江新天地夜间街区', district: '红谷滩区', address: '赣江南大道、摩天轮周边', latitude: 28.6358, longitude: 115.8504, tone: 'service', summary: '滨江文旅夜游街区，活动期间需关注车流、人流和亲水安全。' },
];

const systemNavItems = [
  { view: 'command' as View, label: '指挥前端' },
];

const fallback: Overview = {
  project: '夜市智防',
  subtitle: '夜市商圈数智安全指挥舱',
  stats: { today_events: 5, pending_orders: 4, online_staff: 18, avg_response_minutes: 2.1, completion_rate: 20, urgent_events: 2 },
  night_markets: fallbackMarkets,
  events: [
    { id: 'YS-260815-001', title: '烧烤摊前多人推搡', bay: '三号门夜食街', level: '中风险', source: 'AI视频预警', status: '已接收', owner: '李敏', distance: '180m', time: '21:08', updatedAt: '21:10', description: 'AI识别到摊位前多人聚集推搡，疑似酒后消费纠纷升级，请附近巡防组先期劝阻。' },
    { id: 'YS-260815-002', title: '商户一键求助：疑似街霸滋扰', bay: '主街烧烤区', level: '高风险', source: '夜市平安码', status: '已到达', owner: '王队', distance: '90m', time: '21:22', updatedAt: '21:25', description: '商户通过夜市平安码上报，两名醉酒人员拍打桌椅、威胁摊主，现场有围观聚集风险。' },
    { id: 'YS-260815-003', title: '粉色手机疑似扒窃', bay: '三号门夜食街', level: '低风险', source: '群众报警', status: '已完成', owner: '研判组', distance: '指挥室', time: '20:48', updatedAt: '21:06', description: '群众报警称手机在夜市三号门附近遗失，研判组通过轨迹比对锁定疑似扒窃人员。', result: '已完成视频轨迹复盘，嫌疑目标交由处置组跟进。' },
  ],
  ai_copilot: {
    agents: [
      { name: 'Dispatch Agent', status: 'active', currentTask: '扫描未闭环风险并推荐处置力量', latency: '188ms' },
      { name: 'Patrol Agent', status: 'active', currentTask: '同步巡防组与商户端状态流转', latency: '212ms' },
      { name: 'Audit Agent', status: 'idle', currentTask: '等待闭环事件生成复核记录', latency: '待触发' },
    ],
    mcp_connectors: [
      { name: '事件库 MCP', status: 'connected', scope: '事件库 / 审计日志', lastSync: '刚刚' },
      { name: '小程序 MCP', status: 'connected', scope: '求助 / 上报 / 巡防任务', lastSync: '刚刚' },
      { name: '指挥台 MCP', status: 'connected', scope: '预警 / 派单 / 闭环', lastSync: '刚刚' },
    ],
    skills: [
      { name: '风险研判 Skill', status: '运行中', trigger: '街霸滋扰、斗殴苗头自动置顶', confidence: 92 },
      { name: '派单建议 Skill', status: '运行中', trigger: '按网格、距离与警力负载推荐', confidence: 88 },
      { name: '复盘归档 Skill', status: '待确认', trigger: '闭环后生成审计摘要', confidence: 76 },
    ],
  },
};

const toneFor = (event: SafetyEvent): Tone => (event.level === '高风险' ? 'danger' : event.level === '中风险' ? 'warn' : event.status === '已完成' ? 'safe' : 'info');
const pathView = (): View => (window.location.pathname.startsWith(`${appBasePath}/command`) ? 'command' : window.location.pathname.startsWith(`${appBasePath}/admin`) ? 'admin' : 'entry');

export function NightMarketCommandPage({ onBack }: { onBack?: () => void }) {
  const [view, setView] = useState<View>('command');
  const [overview, setOverview] = useState<Overview>(fallback);
  const [apiOnline, setApiOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState('');

  const loadOverview = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE}/events/overview`);
      if (!response.ok) throw new Error();
      setOverview((await response.json()) as Overview);
      setApiOnline(true);
      setLastSyncedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    } catch {
      setApiOnline(false);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = '夜市智防 | 指挥态势';
    loadOverview();
    const timer = window.setInterval(loadOverview, 20000);
    const onPop = () => setView('command');
    window.addEventListener('popstate', onPop);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('popstate', onPop);
      document.title = previousTitle;
    };
  }, []);

  const navigate = (next: View) => {
    if (next === 'entry') {
      onBack?.();
      return;
    }
    const target = `${appBasePath}${next === 'command' ? '/night-market/command' : '/video'}`;
    window.history.pushState({}, '', target);
    if (next === 'command') setView(next);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  return (
    <main className="nightmarket-page">
      {view !== 'entry' && (
        <>
          <header className="topbar-wrap">
            <nav className="glass-nav" aria-label="工作系统">
              <button className="brand-lockup" onClick={() => onBack?.()} aria-label="返回项目入口">
                <ArrowLeft size={18} />
                <span className="brand-mark">
                  <ShieldCheck size={19} />
                </span>
                <span>
                  <strong>夜市智防</strong>
                  <small>返回项目入口</small>
                </span>
              </button>
              <div className="desktop-nav">
                {systemNavItems.map((item) => (
                  <button className={view === item.view ? 'active' : ''} key={item.view} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}>
                    指挥态势
                  </button>
                ))}
                <button onClick={() => navigate('admin')}>视频监控</button>
              </div>
              <div className="nav-actions">
                  <span className={`sync-chip ${apiOnline ? 'online' : 'offline'}`} role="status">
                    <CircleDot size={12} />
                    {apiOnline ? '事件服务在线' : lastSyncedAt ? '事件同步中断' : '本地演示模式'}
                  </span>
                <button className="icon-button mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} title={mobileOpen ? '关闭导航' : '打开导航'} aria-label={mobileOpen ? '关闭导航' : '打开导航'} aria-expanded={mobileOpen}>
                  {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
            </nav>
          </header>

          {mobileOpen && (
            <div className="mobile-nav-panel">
              {systemNavItems.map((item) => (
                <button className={view === item.view ? 'active' : ''} key={item.view} onClick={() => navigate(item.view)}>
                  指挥态势
                  <ArrowRight size={15} />
                </button>
              ))}
              <button onClick={() => navigate('admin')}>视频监控<ArrowRight size={15} /></button>
            </div>
          )}
        </>
      )}

      <div className="page-frame">
        {view === 'command' && <CommandPage overview={overview} apiOnline={apiOnline} lastSyncedAt={lastSyncedAt} refreshing={refreshing} refresh={loadOverview} notify={notify} />}
      </div>

      {toast && (
        <div className={`toast ${toast.includes('失败') ? 'error' : ''}`} role="status">
          {toast.includes('失败') ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {toast}
        </div>
      )}
    </main>
  );
}

function EntryPage({ apiOnline, navigate }: { apiOnline: boolean; navigate: (view: View) => void }) {
  return (
    <section className="entry-page">
      <div className="entry-hero">
        <div className="entry-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            夜市商圈安全治理项目门户
          </div>
          <h1>
            把夜市现场，
            <br />
            <em>变成可指挥的安全网络。</em>
          </h1>
          <p className="entry-lead">连接群众求助、商户上报、AI 视频预警、巡防派单与事件闭环，让每一次发现都有响应，每一次处置都有记录。</p>
          <div className="entry-actions">
            <button className="primary-button" onClick={() => navigate('command')}>
              进入指挥前端
              <span className="button-icon">
                <ArrowRight size={18} />
              </span>
            </button>
            <button className="secondary-button" onClick={() => navigate('admin')}>
              进入后端管理 <ExternalLink size={15} />
            </button>
          </div>
          <div className="entry-status-line">
            <span className={`status-dot ${apiOnline ? 'green' : 'orange'}`} />
            {apiOnline ? '事件库已连接，数据实时同步' : '当前使用本地演示数据，启动 FastAPI 后自动同步'}
          </div>
        </div>
        <div className="entry-visual">
          <div className="orb-halo" />
          <video autoPlay loop muted playsInline src="https://future.co/images/homepage/glassy-orb/orb-purple.webm" />
          <FloatCard className="float-card-top" icon={<Activity size={15} />} value="2.1 分钟" label="平均响应时间" tone="blue" />
          <FloatCard className="float-card-bottom" icon={<CheckCircle2 size={15} />} value="96%" label="事件闭环率" tone="green" />
          <div className="visual-orb-label">
            <Sparkles size={14} />
            Live safety intelligence
          </div>
        </div>
      </div>

      <div className="entry-modules">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Project portal / two work systems</span>
            <h2>选择进入的工作系统</h2>
          </div>
          <span className="section-note">小程序保持独立，负责微信端群众与巡防触达</span>
        </div>
        <div className="surface-grid">
          <SurfaceCard tone="blue" icon={<LayoutDashboard size={19} />} eyebrow="Command Frontend" title="指挥前端" copy="态势总览、事件工单、地图网格、派单和闭环流转。" action="进入指挥端" onClick={() => navigate('command')} />
          <SurfaceCard tone="green" icon={<Server size={19} />} eyebrow="Backend Console" title="后端管理" copy="事件库、API 健康、审计日志、智能模块和 MCP 连接。" action="进入后端" onClick={() => navigate('admin')} />
        </div>
      </div>
    </section>
  );
}

function FloatCard({
  className,
  icon,
  value,
  label,
  tone,
}: {
  className: string;
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div className={`visual-float-card ${className}`}>
      <span className={`mini-icon ${tone}`}>{icon}</span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

function SurfaceCard({
  icon,
  tone,
  eyebrow,
  title,
  copy,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  tone: string;
  eyebrow: string;
  title: string;
  copy: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <article className={`surface-card ${tone}`}>
      <span className="surface-icon">{icon}</span>
      <span className="surface-eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
      <button onClick={onClick}>
        {action}
        <ArrowRight size={15} />
      </button>
    </article>
  );
}

function CommandPage({
  overview,
  apiOnline,
  lastSyncedAt,
  refreshing,
  refresh,
  notify,
}: {
  overview: Overview;
  apiOnline: boolean;
  lastSyncedAt: string;
  refreshing: boolean;
  refresh: () => void;
  notify: (message: string) => void;
}) {
  const [filter, setFilter] = useState('全部');
  const [selectedId, setSelectedId] = useState(overview.events[0]?.id ?? '');
  const [updating, setUpdating] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState(overview.night_markets?.[0]?.id ?? fallbackMarkets[0].id);

  const filtered = useMemo(() => overview.events.filter((event) => filter === '全部' || event.status === filter), [overview.events, filter]);
  const selected = filtered.find((event) => event.id === selectedId) ?? filtered[0];
  const nightMarkets = overview.night_markets?.length ? overview.night_markets : fallbackMarkets;
  const selectedMarket = nightMarkets.find((market) => market.id === selectedMarketId) ?? nightMarkets[0];
  const mapIncidents = useMemo(() => nightMarkets.map((market) => ({
    id: market.id,
    incidentNo: market.id,
    title: market.name,
    jurisdiction: market.district,
    address: market.address,
    latitude: market.latitude,
    longitude: market.longitude,
  })), [nightMarkets]);
  const dispatchStaff = overview.patrol_staff?.length ? overview.patrol_staff.filter((staff) => staff.online).map((staff) => staff.name) : ['王队', '李敏', '陈安'];

  useEffect(() => {
    if (!overview.events.some((event) => event.id === selectedId)) setSelectedId(overview.events[0]?.id ?? '');
  }, [overview.events, selectedId]);

  useEffect(() => {
    if (!nightMarkets.some((market) => market.id === selectedMarketId)) setSelectedMarketId(nightMarkets[0]?.id ?? fallbackMarkets[0].id);
  }, [nightMarkets, selectedMarketId]);

  const openNavigation = (market = selectedMarket) => {
    if (!market) return;
    const to = `${market.longitude},${market.latitude},${market.name}`;
    const url = `https://uri.amap.com/navigation?to=${encodeURIComponent(to)}&mode=car&policy=1&src=night-market-zhifang&callnative=0`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const updateStatus = async (status: EventStatus) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const response = await fetch(`${API_BASE}/events/${selected.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, owner: selected.owner, operator: '指挥中心' }),
      });
      if (!response.ok) throw new Error();
      notify(`事件 ${selected.id} 已更新为 ${status}`);
      refresh();
    } catch {
      notify('状态更新失败，请确认 FastAPI 服务已启动');
    } finally {
      setUpdating(false);
    }
  };

  const assignTo = async (staff: string) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const response = await fetch(`${API_BASE}/events/${selected.id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff, operator: '指挥中心' }),
      });
      if (!response.ok) throw new Error();
      notify(`事件 ${selected.id} 已派给 ${staff}`);
      refresh();
    } catch {
      notify('派单失败，请确认 FastAPI 服务已启动');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <section className="workspace-page">
      <div className="workspace-heading">
        <div>
          <span className="section-kicker">指挥中心 / 南昌市</span>
          <h1>夜市指挥态势</h1>
          <p>{nightMarkets.length} 个夜市 · {overview.stats.online_staff} 名在线巡防人员 · {overview.stats.pending_orders} 起待处置事件</p>
        </div>
        <div className="heading-actions">
          <button className="quiet-button" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            刷新态势
          </button>
          <span className={`live-pill ${apiOnline ? 'success' : 'warning'}`}>
            <span />
            {apiOnline ? `已同步 ${lastSyncedAt}` : lastSyncedAt ? `缓存数据 · ${lastSyncedAt}` : '演示数据 · 待连接'}
          </span>
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={<AlertTriangle size={18} />} label="今日事件" value={overview.stats.today_events} detail={`${overview.stats.urgent_events} 个高风险`} tone="danger" />
        <Metric icon={<Clock3 size={18} />} label="待处置" value={overview.stats.pending_orders} detail="未闭环事件" tone="orange" />
        <Metric icon={<Users size={18} />} label="在线巡防" value={overview.stats.online_staff} detail={`${nightMarkets.length} 个夜市点位`} tone="blue" />
        <Metric icon={<ShieldCheck size={18} />} label="闭环率" value={`${overview.stats.completion_rate}%`} detail={`平均响应 ${overview.stats.avg_response_minutes} 分钟`} tone="green" />
      </div>

      <div className="command-grid">
        <section className="glass-panel queue-panel">
          <PanelTitle kicker="QUEUE" title="事件工单" icon={<ListFilter size={18} />} />
          <label className="queue-filter"><span>事件状态</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{['全部', ...statusFlow].map((item) => <option key={item} value={item}>{item}</option>)}</select><span>{filtered.length} 起</span></label>
          <div className="event-list">
            {filtered.map((event) => (
              <button className={`event-list-item ${selected?.id === event.id ? 'selected' : ''}`} key={event.id} aria-pressed={selected?.id === event.id} onClick={() => setSelectedId(event.id)}>
                <span className={`event-risk-bar ${toneFor(event)}`} />
                <span className="event-list-main">
                  <strong>{event.title}</strong>
                  <small>
                    {event.bay} · {event.source} · {event.time}
                  </small>
                </span>
                <StatusBadge status={event.status} tone={toneFor(event)} />
              </button>
            ))}
            {!filtered.length && <div className="empty-state">当前筛选下没有事件</div>}
          </div>
        </section>

        <section className="glass-panel map-panel">
          <PanelTitle kicker="MAP" title="夜市分布" icon={<span className="map-live"><MapPin size={14} />{nightMarkets.length} 个夜市</span>} />
          <label className="market-select"><span>当前夜市</span><select value={selectedMarket?.id} onChange={(event) => setSelectedMarketId(event.target.value)}>{nightMarkets.map((market) => <option key={market.id} value={market.id}>{market.district} · {market.name}</option>)}</select></label>
          <div className="map-stage">
            <PoliceJurisdictionAmapMap
              incidents={mapIncidents}
              selectedIncidentId={selectedMarket?.id ?? nightMarkets[0]?.id ?? ''}
            />
          </div>
          <div className="map-action-row">
            <button className="quiet-button" onClick={() => openNavigation(selectedMarket)} disabled={!selectedMarket}>
              <MapPin size={15} />导航到此夜市 <ExternalLink size={14} />
            </button>
            <div className="map-footnote">{selectedMarket?.district} · {selectedMarket?.address}</div>
          </div>
        </section>

        <section className="glass-panel detail-panel">
          {selected ? (
            <>
              <div className="detail-top">
                <StatusBadge status={selected.level} tone={toneFor(selected)} />
                <span className="mono-id">{selected.id}</span>
              </div>
              <h2>{selected.title}</h2>
              <p className="detail-subtitle">
                {selected.bay} · {selected.source}
              </p>
              <div className="detail-progress">
                <span style={{ width: `${Math.max(12, ((statusFlow.indexOf(selected.status) + 1) / statusFlow.length) * 100)}%` }} />
              </div>
              <p className="progress-label">
                {selected.status} · 负责人 {selected.owner} · {selected.updatedAt}
              </p>
              <div className="property-grid">
                <Property label="位置" value={selected.bay} />
                <Property label="距离" value={selected.distance} />
                <Property label="来源" value={selected.source} />
                <Property label="当前" value={selected.status} />
              </div>
              <div className="dispatch-card">
                <span>派单与路线</span>
                <strong>{selected.meta?.assignment?.staffName ?? selected.owner}</strong>
                <p>
                  {selected.meta?.assignment?.role ?? '等待指挥端派单'} · {selected.meta?.route ? `${selected.meta.route.modeLabel} ${selected.meta.route.distanceLabel} / ${selected.meta.route.etaLabel}` : '等待路线生成'}
                </p>
              </div>
              <h3 className="field-label">派给工作人员</h3>
              <div className="dispatch-actions">
                {dispatchStaff.map((staff) => (
                  <button className={selected.owner === staff ? 'active' : ''} key={staff} onClick={() => assignTo(staff)} disabled={updating}>
                    <Users size={14} />{staff}
                  </button>
                ))}
              </div>
              <div className="detail-description">{selected.description}</div>
              <h3 className="field-label">更新事件状态</h3>
              <div className="status-actions">
                <button onClick={() => updateStatus('已派单')} disabled={updating}>
                  <ArrowRight size={15} />派单
                </button>
                <button onClick={() => updateStatus('已到达')} disabled={updating}>
                  <MapPin size={15} />标记到达
                </button>
                <button className="primary-small" onClick={() => updateStatus('已完成')} disabled={updating}>
                  <CheckCircle2 size={15} />完成闭环
                </button>
              </div>
              <button className="nav-to-button" onClick={() => openNavigation(selectedMarket)}>
                打开高德导航 <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <div className="empty-state">选择一条事件查看详情</div>
          )}
        </section>
      </div>
    </section>
  );
}

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string | number; detail: string; tone: Tone }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span className="metric-icon">{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function PanelTitle({ kicker, title, icon }: { kicker: string; title: string; icon: React.ReactNode }) {
  return (
    <div className="panel-heading">
      <div>
        <span className="panel-kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      {icon}
    </div>
  );
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div className="property">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status, tone }: { status: string; tone: Tone }) {
  return <span className={`status-badge ${tone}`}>{status}</span>;
}

function AdminPage({ overview, apiOnline, refresh }: { overview: Overview; apiOnline: boolean; refresh: () => void }) {
  const endpoints = [
    ['GET', '/api/events/overview', '态势总览'],
    ['GET', '/api/events', '事件工单与时间线'],
    ['PATCH', '/api/events/{event_id}/status', '状态流转'],
    ['PATCH', '/api/events/{event_id}/assign', '数据库派单与路线'],
    ['POST', '/api/events/staff-location', '工作人员定位入库'],
    ['POST', '/api/events/help', '群众 / 商户求助'],
  ];
  const agents = overview.ai_copilot?.agents ?? [];
  const connectors = overview.ai_copilot?.mcp_connectors ?? [];
  const skills = overview.ai_copilot?.skills ?? [];

  return (
    <section className="workspace-page admin-page">
      <div className="workspace-heading">
        <div>
          <span className="section-kicker">Backend Console / System Control</span>
          <h1>夜市智防后端管理</h1>
          <p>服务健康、事件库、智能协同和审计状态集中查看。</p>
        </div>
        <div className="heading-actions">
          <button className="quiet-button" onClick={refresh}>
            <RefreshCw size={16} />
            重新探测
          </button>
          <span className={`live-pill ${apiOnline ? 'success' : 'warning'}`}>
            <span />
            {apiOnline ? 'API 服务正常' : '等待 API 服务'}
          </span>
        </div>
      </div>

      <div className="admin-summary">
        <div className="admin-summary-main">
          <span className="summary-icon">
            <Server size={20} />
          </span>
          <div>
            <span className="panel-kicker">SERVICE STATUS</span>
            <h2>{apiOnline ? 'FastAPI 服务在线' : '本地演示模式'}</h2>
            <p>
              {API_BASE} · CORS 已开启 · 自动同步间隔 20 秒
            </p>
          </div>
        </div>
        <div className="summary-stat">
          <strong>{overview.events.length}</strong>
          <span>事件库记录</span>
        </div>
        <div className="summary-stat">
          <strong>
            {connectors.filter((item) => item.status === 'connected').length}/{connectors.length || 3}
          </strong>
          <span>MCP 已连接</span>
        </div>
        <div className="summary-stat">
          <strong>SQLAlchemy</strong>
          <span>ORM 数据层</span>
        </div>
      </div>

      <div className="admin-grid">
        <section className="glass-panel api-panel">
          <PanelTitle kicker="API ROUTES" title="接口链路" icon={<Activity size={18} />} />
          <div className="api-list">
            {endpoints.map(([method, path, description]) => (
              <div className="api-row" key={path}>
                <span className={`method ${method.toLowerCase()}`}>{method}</span>
                <code>{path}</code>
                <span>{description}</span>
                <CheckCircle2 size={15} />
              </div>
            ))}
          </div>
        </section>
        <section className="glass-panel agent-panel">
          <PanelTitle kicker="AI COPILOT" title="智能协同" icon={<Bot size={18} />} />
          <div className="agent-list">
            {agents.map((agent) => (
              <div className="agent-row" key={agent.name}>
                <span className={`agent-status ${agent.status}`} />
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.currentTask}</span>
                </div>
                <code>{agent.latency}</code>
              </div>
            ))}
          </div>
          <div className="skill-list">
            {skills.map((skill) => (
              <div className="skill-row" key={skill.name}>
                <span>{skill.name}</span>
                <strong>{skill.confidence}%</strong>
                <small>{skill.trigger}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="glass-panel connector-panel">
          <PanelTitle kicker="MCP / CONNECTORS" title="连接器状态" icon={<Gauge size={18} />} />
          {connectors.map((item) => (
            <div className="connector-row" key={item.name}>
              <span className="connector-status">
                <span />
                connected
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>{item.scope}</small>
              </div>
              <time>{item.lastSync}</time>
            </div>
          ))}
        </section>
        <section className="glass-panel data-panel">
          <PanelTitle kicker="DATA / AUDIT" title="数据与审计" icon={<Database size={18} />} />
          <div className="data-rows">
            <Property label="主表" value="safety_events" />
            <Property label="审计表" value="event_audit_logs" />
            <Property label="开发库" value="SQLite" />
            <Property label="生产建议" value="PostgreSQL" />
            <Property label="事件状态" value="6 段流转" />
          </div>
          <div className="audit-note">
            <Clock3 size={15} />
            最新审计：指挥中心正在同步巡防组状态
          </div>
        </section>
      </div>
    </section>
  );
}
