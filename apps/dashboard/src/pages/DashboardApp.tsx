import { Activity, AlertTriangle, Clock3, Radio, ShieldCheck, Users } from 'lucide-react';

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

export function DashboardApp() {
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
            <button>演示模式</button>
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
