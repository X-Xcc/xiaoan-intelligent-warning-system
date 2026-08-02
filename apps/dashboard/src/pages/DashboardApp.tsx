import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Cpu,
  Database,
  FileCheck2,
  Gauge,
  HardDrive,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  MapPin,
  Megaphone,
  MonitorCheck,
  PackageCheck,
  Radio,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  Video,
  Wrench,
  Zap,
} from 'lucide-react';

type Severity = '紧急' | '高' | '中' | '低';
type Status = '待派单' | '处理中' | '待复核' | '已闭环';
type Incident = {
  id: string;
  severity: Severity;
  title: string;
  area: string;
  source: string;
  status: Status;
  owner: string;
  sla: string;
  time: string;
};
type ModuleKey = 'events' | 'staff' | 'devices' | 'assets' | 'plans' | 'system';

type ManagementRow = {
  name: string;
  owner: string;
  status: string;
  metric: string;
  tag: string;
};

const initialIncidents: Incident[] = [
  { id: 'JT-20260801-091', severity: '紧急', title: '游客长按一键求助', area: '三号湾区', source: '小程序 SOS', status: '待派单', owner: '未分配', sla: '03:00', time: '15:28' },
  { id: 'JT-20260801-088', severity: '高', title: '禁泳区越界识别', area: '二号湾区', source: 'AI 摄像头', status: '处理中', owner: '王队', sla: '06:42', time: '15:16' },
  { id: 'JT-20260801-076', severity: '中', title: '救生圈箱门异常开启', area: '五号湾区', source: '物联传感器', status: '待复核', owner: '李敏', sla: '11:20', time: '14:52' },
  { id: 'JT-20260801-063', severity: '低', title: '夜间照明回路波动', area: '六号湾区', source: '巡检上报', status: '已闭环', owner: '陈安', sla: '完成', time: '14:18' },
];

const modules: Array<{ key: ModuleKey; label: string; count: number; icon: typeof LayoutDashboard }> = [
  { key: 'events', label: '事件工单', count: 128, icon: ClipboardCheck },
  { key: 'staff', label: '人员排班', count: 36, icon: Users },
  { key: 'devices', label: '设备台账', count: 214, icon: Video },
  { key: 'assets', label: '物资仓储', count: 89, icon: PackageCheck },
  { key: 'plans', label: '预案审批', count: 17, icon: FileCheck2 },
  { key: 'system', label: '系统配置', count: 42, icon: Settings },
];

const managementData: Record<ModuleKey, ManagementRow[]> = {
  events: [
    { name: '禁泳区智能告警策略', owner: '安全运营组', status: '启用中', metric: '误报率 4.2%', tag: 'AI 规则' },
    { name: '游客求助派单流程', owner: '指挥中心', status: '启用中', metric: '平均 2.4 分钟', tag: '自动派单' },
    { name: '险情复核抽检任务', owner: '质控专员', status: '待优化', metric: '抽检 32 单', tag: '闭环质检' },
  ],
  staff: [
    { name: '周末高峰巡防班', owner: '王队', status: '已发布', metric: '12 人在线', tag: '三班两倒' },
    { name: '救生员资质复核', owner: '人事安全', status: '进行中', metric: '28/36 完成', tag: '证照管理' },
    { name: '临时支援人员池', owner: '应急办', status: '可调度', metric: '9 人待命', tag: '应急资源' },
  ],
  devices: [
    { name: 'AI 摄像头集群', owner: '物联运维', status: '在线', metric: '198/214 在线', tag: '边缘识别' },
    { name: '水位雷达监测', owner: '水务接口', status: '在线', metric: '延迟 28ms', tag: '实时监测' },
    { name: '广播音柱联动', owner: '安防运维', status: '部分离线', metric: '2 台待修', tag: '应急广播' },
  ],
  assets: [
    { name: '救生圈与救援绳', owner: '物资管理员', status: '充足', metric: '89 套', tag: '救援物资' },
    { name: '移动围栏库存', owner: '后勤保障', status: '需补货', metric: '低于阈值 12%', tag: '临控物资' },
    { name: '应急照明电池', owner: '工程班组', status: '巡检中', metric: '寿命 82%', tag: '保障设备' },
  ],
  plans: [
    { name: '暴雨涨水临时封控预案', owner: '应急办', status: '审批中', metric: '2 人待审', tag: '防汛' },
    { name: '暑期夜游高峰保障方案', owner: '运营中心', status: '已生效', metric: '覆盖 7 湾区', tag: '客流保障' },
    { name: '跨部门联合演练计划', owner: '公安联动', status: '待提交', metric: '草稿版本', tag: '联合处置' },
  ],
  system: [
    { name: '数据大屏 API 网关', owner: '平台运维', status: '健康', metric: 'P95 188ms', tag: '接口治理' },
    { name: '账号与权限矩阵', owner: '系统管理员', status: '需复核', metric: '5 个高权账号', tag: '权限安全' },
    { name: '日志留存与审计', owner: '安全审计', status: '合规', metric: '保留 180 天', tag: '审计追踪' },
  ],
};

const commandQueue = [
  { title: '三号湾区 SOS 待确认', detail: '建议派发最近救生员李敏，预计 2 分钟到达', tone: 'danger' },
  { title: '广播联动已触发', detail: '二号湾区自动播放禁泳提示 3 次', tone: 'info' },
  { title: '巡防路线重排', detail: '根据客流热区，将 A 组前置到三号湾区', tone: 'success' },
];

const auditLogs = [
  '15:30 管理员 xx 登录后台控制台',
  '15:27 指挥中心发布临时管控通知',
  '15:22 设备运维关闭摄像头 C-019 误报单',
  '15:18 系统自动同步水位数据成功',
];

const bayHealth = [88, 73, 96, 81, 64, 92, 77];

export function DashboardApp() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === '/admin' ? <AdminConsole /> : <CommandCenter />;
}

function CommandCenter() {
  const stats = [
    { label: '今日险情', value: '18', unit: '起', trend: '+12%', icon: AlertTriangle },
    { label: '待处置任务', value: '3', unit: '单', trend: '高风险优先', icon: Radio },
    { label: '在线巡防', value: '12', unit: '人', trend: '3组在线', icon: Users },
    { label: '平均响应', value: '2.6', unit: '分钟', trend: '较昨日 -0.4', icon: Clock3 },
    { label: '处置完成率', value: '92', unit: '%', trend: '稳定', icon: ShieldCheck },
    { label: '当前客流', value: '较高', unit: '', trend: '重点关注', icon: Activity },
  ];

  const alerts = [
    { level: '高风险', title: '儿童单独涉水', bay: '3号湾区', source: '游客求助', status: '待派单' },
    { level: '中风险', title: '救生设施损坏', bay: '5号湾区', source: '安全上报', status: '待确认' },
    { level: '高风险', title: '禁泳区闯入', bay: '2号湾区', source: 'AI预警', status: '已派单' },
  ];

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/jiangtan-zhifang-logo.svg" alt="江滩智防" />
          <div>
            <h1>江滩智防</h1>
            <p>两滩七湾安全指挥舱</p>
          </div>
        </div>
        <div className="system-status">
          <span className="live-dot" /> 系统运行中
          <span>15:30</span>
          <span>晴 35℃</span>
          <span>水位正常</span>
          <span className="risk-chip">当前风险：中</span>
          <a className="command-admin-link" href="/admin"><Settings size={16} />进入管理端<ArrowRight size={15} /></a>
        </div>
      </header>

      <section className="dashboard-grid">
        <aside className="panel stats-panel">
          <h2>实时态势</h2>
          <div className="stat-list">
            {stats.map((item) => {
              const Icon = item.icon;
              return (
                <article className="stat-card" key={item.label}>
                  <Icon size={20} />
                  <div>
                    <p>{item.label}</p>
                    <strong>{item.value}<span>{item.unit}</span></strong>
                    <small>{item.trend}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>

        <section className="map-stage">
          <ConceptMap />
        </section>

        <aside className="panel alert-panel">
          <div className="panel-heading">
            <h2>实时险情</h2>
            <button type="button">演示模式</button>
          </div>
          <div className="alert-list">
            {alerts.map((alert) => (
              <article className={`alert-card ${alert.level === '高风险' ? 'danger' : 'warning'}`} key={`${alert.bay}-${alert.title}`}>
                <div>
                  <span>{alert.level}</span>
                  <strong>{alert.title}</strong>
                </div>
                <p>{alert.bay} · {alert.source}</p>
                <small>状态：{alert.status}</small>
              </article>
            ))}
          </div>
          <h2 className="subheading">待处置任务</h2>
          <article className="work-card">
            <strong>任务 #WO20260731001</strong>
            <p>王队 · 已接收 · 响应 1分20秒</p>
          </article>
        </aside>
      </section>

      <footer className="chart-row">
        <div className="chart-card">风险趋势折线图</div>
        <div className="chart-card">风险类型占比</div>
        <div className="chart-card">湾区风险排行</div>
      </footer>
    </main>
  );
}

function ConceptMap() {
  const bays = [
    { id: 1, x: 17, y: 68, status: 'normal' },
    { id: 2, x: 30, y: 49, status: 'danger' },
    { id: 3, x: 45, y: 38, status: 'danger' },
    { id: 4, x: 58, y: 46, status: 'normal' },
    { id: 5, x: 70, y: 60, status: 'warning' },
    { id: 6, x: 82, y: 51, status: 'handled' },
    { id: 7, x: 91, y: 35, status: 'normal' },
  ];

  return (
    <div className="concept-map">
      <div className="map-title">概念化两滩七湾态势图</div>
      <svg viewBox="0 0 100 100" role="img" aria-label="两滩七湾概念地图">
        <path className="river-glow" d="M7 73 C 22 52, 30 42, 45 39 S 68 56, 93 31" />
        <path className="river-line" d="M7 73 C 22 52, 30 42, 45 39 S 68 56, 93 31" />
        {bays.map((bay) => (
          <g key={bay.id}>
            <circle className={`bay-pulse ${bay.status}`} cx={bay.x} cy={bay.y} r="5" />
            <circle className={`bay-dot ${bay.status}`} cx={bay.x} cy={bay.y} r="2.3" />
            <text x={bay.x + 2.8} y={bay.y - 3}>{bay.id}号湾区</text>
          </g>
        ))}
        <circle className="staff-dot" cx="41" cy="51" r="1.8" />
        <circle className="staff-dot" cx="64" cy="52" r="1.8" />
      </svg>
    </div>
  );
}
function AdminConsole() {
  const [activeModule, setActiveModule] = useState<ModuleKey>('events');
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [priority, setPriority] = useState<'全部' | Severity>('全部');

  const visibleIncidents = priority === '全部' ? incidents : incidents.filter((item) => item.severity === priority);

  const overview = useMemo(() => {
    const open = incidents.filter((item) => item.status !== '已闭环').length;
    const urgent = incidents.filter((item) => item.severity === '紧急' || item.severity === '高').length;
    const closed = incidents.filter((item) => item.status === '已闭环').length;
    return [
      { label: '今日工单', value: '142', note: `未闭环 ${open} 单`, icon: ClipboardCheck, tone: 'blue' },
      { label: '高危预警', value: String(urgent), note: '优先级自动置顶', icon: AlertTriangle, tone: 'red' },
      { label: '在线设备', value: '198', note: '92.5% 在线率', icon: MonitorCheck, tone: 'green' },
      { label: '闭环率', value: `${Math.round((closed / incidents.length) * 100)}%`, note: '目标 95%', icon: ShieldCheck, tone: 'purple' },
    ];
  }, [incidents]);

  const createSos = () => {
    const next: Incident = {
      id: `JT-${Date.now()}`,
      severity: '紧急',
      title: '新增游客一键求助',
      area: '三号湾区',
      source: '小程序 SOS',
      status: '待派单',
      owner: '未分配',
      sla: '03:00',
      time: '刚刚',
    };
    setIncidents((current) => [next, ...current]);
    setActiveModule('events');
    setPriority('全部');
  };

  const dispatchFirst = () => {
    setIncidents((current) => current.map((item, index) => index === 0 ? { ...item, status: '处理中', owner: '李敏', sla: '02:18' } : item));
  };

  const closeFirst = () => {
    setIncidents((current) => current.map((item, index) => index === 0 ? { ...item, status: '已闭环', owner: item.owner === '未分配' ? '李敏' : item.owner, sla: '完成' } : item));
  };

  const resetDemo = () => {
    setIncidents(initialIncidents);
    setActiveModule('events');
    setPriority('全部');
  };

  const activeRows = managementData[activeModule];
  const activeLabel = modules.find((item) => item.key === activeModule)?.label ?? '事件工单';

  return (
    <main className="admin-shell">
      <aside className="sidebar" aria-label="后台导航">
        <div className="brand-block">
          <img src="/jiangtan-zhifang-logo.svg" alt="江滩智防" />
          <div>
            <strong>江滩智防</strong>
            <span>Enterprise Admin</span>
          </div>
        </div>

        <nav className="nav-section">
          <p>业务中心</p>
          <button className="nav-item is-active" type="button"><LayoutDashboard size={18} />总览驾驶舱</button>
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <button className={`nav-item ${activeModule === item.key ? 'is-selected' : ''}`} key={item.key} type="button" onClick={() => setActiveModule(item.key)}>
                <Icon size={18} />
                <span>{item.label}</span>
                <small>{item.count}</small>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-status">
          <div><Database size={17} /> 数据中台</div>
          <strong>99.98%</strong>
          <span>服务可用性 · 最近 30 天</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">两滩七湾安全治理后台</p>
            <h1>运营管理控制台</h1>
          </div>
          <div className="top-actions">
            <label className="search-box">
              <Search size={17} />
              <input placeholder="搜索工单、设备、人员、预案" />
            </label>
            <button className="icon-button" type="button" aria-label="通知"><Bell size={18} /><i /></button>
            <button className="user-menu" type="button"><UserCog size={18} />xx 管理员<ChevronDown size={15} /></button>
          </div>
        </header>

        <section className="hero-band">
          <div className="operation-summary">
            <div>
              <p className="eyebrow">实时运营态势</p>
              <h2>一套后台统一管理事件、人员、设备、物资和预案</h2>
            </div>
            <div className="summary-actions">
              <button className="primary-button" type="button" onClick={createSos}><Zap size={16} />模拟 SOS</button>
              <button type="button" onClick={dispatchFirst}><Radio size={16} />一键派单</button>
              <button type="button" onClick={closeFirst}><CheckCircle2 size={16} />闭环首单</button>
              <button type="button" onClick={resetDemo}><RotateCcw size={16} />重置</button>
            </div>
          </div>
          <div className="kpi-grid">
            {overview.map((item) => {
              const Icon = item.icon;
              return (
                <article className={`kpi-card ${item.tone}`} key={item.label}>
                  <Icon size={20} />
                  <p>{item.label}</p>
                  <strong>{item.value}</strong>
                  <span>{item.note}</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="content-grid">
          <div className="main-column">
            <section className="module-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Management</p>
                  <h2>{activeLabel}</h2>
                </div>
                <div className="segmented">
                  {(['全部', '紧急', '高', '中', '低'] as const).map((item) => (
                    <button className={priority === item ? 'selected' : ''} type="button" key={item} onClick={() => setPriority(item)}>{item}</button>
                  ))}
                </div>
              </div>

              <div className="module-tabs">
                {modules.map((item) => {
                  const Icon = item.icon;
                  return <button className={activeModule === item.key ? 'selected' : ''} type="button" key={item.key} onClick={() => setActiveModule(item.key)}><Icon size={16} />{item.label}</button>;
                })}
              </div>

              {activeModule === 'events' ? <IncidentTable incidents={visibleIncidents} /> : <ManagementTable rows={activeRows} />}
            </section>

            <section className="module-panel bay-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">GIS & IoT</p>
                  <h2>湾区健康度与设备联动</h2>
                </div>
                <span className="sync-pill"><Activity size={15} />5 秒前同步</span>
              </div>
              <div className="bay-grid">
                {bayHealth.map((value, index) => (
                  <article className="bay-tile" key={index}>
                    <div><MapPin size={16} />{index + 1}号湾区</div>
                    <strong>{value}</strong>
                    <span style={{ width: `${value}%` }} />
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="right-column">
            <section className="module-panel command-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Command</p>
                  <h2>指挥协同</h2>
                </div>
                <LifeBuoy size={20} />
              </div>
              {commandQueue.map((item) => <article className={`command-card ${item.tone}`} key={item.title}><strong>{item.title}</strong><p>{item.detail}</p></article>)}
            </section>

            <section className="module-panel ops-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Ops</p>
                  <h2>系统运行</h2>
                </div>
                <Gauge size={20} />
              </div>
              <div className="ops-list">
                <MetricLine icon={Cpu} label="AI 边缘算力" value="71%" />
                <MetricLine icon={HardDrive} label="日志存储" value="62%" />
                <MetricLine icon={Smartphone} label="小程序接口" value="128ms" />
                <MetricLine icon={LockKeyhole} label="权限风险" value="5 项" />
              </div>
            </section>

            <section className="module-panel audit-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Audit</p>
                  <h2>审计动态</h2>
                </div>
                <Megaphone size={20} />
              </div>
              <ol>
                {auditLogs.map((log) => <li key={log}>{log}</li>)}
              </ol>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function IncidentTable({ incidents }: { incidents: Incident[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>工单编号</th>
            <th>事件</th>
            <th>位置</th>
            <th>来源</th>
            <th>负责人</th>
            <th>SLA</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((item) => (
            <tr key={item.id}>
              <td><span className="mono">{item.id}</span><small>{item.time}</small></td>
              <td><b>{item.title}</b><em className={`severity ${severityClass(item.severity)}`}>{item.severity}</em></td>
              <td>{item.area}</td>
              <td>{item.source}</td>
              <td>{item.owner}</td>
              <td>{item.sla}</td>
              <td><span className={`status ${statusClass(item.status)}`}>{item.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManagementTable({ rows }: { rows: ManagementRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>管理对象</th>
            <th>责任部门</th>
            <th>状态</th>
            <th>核心指标</th>
            <th>标签</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.name}>
              <td><b>{item.name}</b></td>
              <td>{item.owner}</td>
              <td><span className="status processing">{item.status}</span></td>
              <td>{item.metric}</td>
              <td><em className="tag">{item.tag}</em></td>
              <td><button className="table-action" type="button"><Wrench size={14} />管理</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricLine({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return <div className="metric-line"><span><Icon size={16} />{label}</span><strong>{value}</strong></div>;
}

function severityClass(severity: Severity) {
  return severity === '紧急' ? 'critical' : severity === '高' ? 'high' : severity === '中' ? 'middle' : 'low';
}

function statusClass(status: Status) {
  return status === '已闭环' ? 'done' : status === '处理中' ? 'processing' : status === '待复核' ? 'review' : 'pending';
}






