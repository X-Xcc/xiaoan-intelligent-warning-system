import { useId } from 'react';
import { Camera, Clock3, EyeOff, Image as ImageIcon, MapPinned, ShieldCheck } from 'lucide-react';
import { appBasePath } from '../lib/presentation';
import {
  collisionEvidencePoints,
  collisionOverlapRate,
  collisionRoutes,
  collisionTimeline,
  type CollisionEvidencePoint,
  type CollisionRoute,
} from '../lib/contact-collision';
import '../styles/contact-collision.css';

function routePoints(route: CollisionRoute) {
  return route.points.map((point) => `${point.x},${point.y}`).join(' ');
}

function EvidenceCard({ point }: { point: CollisionEvidencePoint }) {
  const cardWidth = 154;
  const cardHeight = 114;
  const cardX = Math.max(12, Math.min(point.x - cardWidth / 2, 900 - cardWidth - 12));
  const cardY = point.y < 245 ? 18 : 30;
  return (
    <g className="cr-collision-evidence">
      <line x1={point.x} y1={cardY + cardHeight} x2={point.x} y2={point.y - 9} />
      <circle cx={point.x} cy={point.y} r="8" />
      <rect x={cardX} y={cardY} width={cardWidth} height={cardHeight} rx="6" />
      <image href={`${appBasePath}${point.imagePath}`} x={cardX + 8} y={cardY + 8} width="138" height="70" preserveAspectRatio="xMidYMid slice" />
      <text x={cardX + 8} y={cardY + 94}>{point.label}</text>
    </g>
  );
}

function CollisionDrawing() {
  const titleId = useId();
  return (
    <svg className="cr-collision-drawing" viewBox="0 0 930 620" role="img" aria-labelledby={titleId}>
      <title id={titleId}>虚拟夜市四人轨迹碰撞图</title>
      <defs>
        <filter id="collision-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#243a43" floodOpacity=".16" />
        </filter>
        <pattern id="collision-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dbe5e0" strokeWidth="1" opacity=".56" />
        </pattern>
      </defs>
      <rect width="930" height="620" fill="#f8fbf9" />
      <rect x="16" y="16" width="898" height="588" rx="8" fill="url(#collision-grid)" stroke="#4d756b" strokeWidth="2" />
      <g className="cr-collision-zone">
        <rect x="52" y="92" width="190" height="116" rx="8" fill="#e6f1e9" stroke="#bfd7c6" />
        <text x="147" y="154">餐饮摊位区</text>
        <rect x="328" y="112" width="216" height="126" rx="8" fill="#f5ecd9" stroke="#ddc895" />
        <text x="436" y="180">中心广场</text>
        <rect x="660" y="90" width="192" height="120" rx="8" fill="#e6eef3" stroke="#bfd0dc" />
        <text x="756" y="157">舞台区</text>
        <rect x="74" y="438" width="212" height="108" rx="8" fill="#e6f1e9" stroke="#bfd7c6" />
        <text x="180" y="500">南侧摊位</text>
        <rect x="654" y="438" width="202" height="108" rx="8" fill="#ede8f2" stroke="#d0c4dc" />
        <text x="755" y="500">南侧出入口</text>
      </g>
      <g className="cr-collision-roads">
        <path d="M18 320 H912" />
        <path d="M18 416 H912" />
        <path d="M286 18 V602" />
        <path d="M574 18 V602" />
        <text x="92" y="307">主通道 A</text>
        <text x="726" y="404">主通道 B</text>
        <text x="304" y="582" transform="rotate(-90 304 582)">中心巷道</text>
      </g>
      <g className="cr-collision-overlap">
        <path d="M370 294 C420 316 469 330 532 322 C590 315 638 298 694 287" />
        <path d="M475 358 C540 330 605 315 674 317 C706 318 730 309 760 291" />
        <path d="M437 280 C498 293 548 308 607 301 C640 297 665 285 696 271" />
      </g>
      <g className="cr-collision-routes">
        {collisionRoutes.map((route) => (
          <polyline
            key={route.person}
            points={routePoints(route)}
            fill="none"
            stroke={route.color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
      <g className="cr-collision-nodes">
        {collisionRoutes.flatMap((route) => route.points.map((point) => (
          <g key={`${route.person}-${point.label}`} className="cr-collision-node" style={{ color: route.color }}>
            <circle cx={point.x} cy={point.y} r="12" />
            <text x={point.x} y={point.y + 4}>{point.label}</text>
          </g>
        )))}
      </g>
      <g filter="url(#collision-shadow)">
        {collisionEvidencePoints.map((point) => <EvidenceCard key={point.label} point={point} />)}
      </g>
    </svg>
  );
}

export function ContactCollisionMap() {
  return (
    <section className="cr-collision" aria-label="虚拟夜市四人轨迹碰撞">
      <header className="cr-collision-header">
        <div className="cr-collision-title">
          <div className="cr-collision-kicker"><MapPinned size={15} />虚拟夜市 · 路线关系分析</div>
          <h2>四人轨迹碰撞图</h2>
          <p>纯虚构平面示意 · 路线依据演示时序推定 · 不使用真实地图</p>
        </div>
        <div className="cr-collision-rate" aria-label={`赵六与受害人轨迹重合率 ${collisionOverlapRate}%`}>
          <span>赵六 × 受害人</span>
          <strong>{collisionOverlapRate}%</strong>
          <small>轨迹重合率</small>
        </div>
      </header>
      <div className="cr-collision-layout">
        <div className="cr-collision-map-panel">
          <div className="cr-collision-map-topline">
            <span><ShieldCheck size={14} />AI 合成路线 · 仅用于页面演示</span>
            <span>分析窗口 20:10:55—20:16:20</span>
          </div>
          <div className="cr-collision-map-wrap">
            <CollisionDrawing />
          </div>
          <div className="cr-collision-legend" aria-label="轨迹图例">
            {collisionRoutes.map((route) => <span key={route.person}><i style={{ backgroundColor: route.color }} />{route.person}<small>{route.state}</small></span>)}
            <span><i className="is-overlap" />共享 / 重合段</span>
          </div>
          <div className="cr-collision-evidence-strip">
            {collisionEvidencePoints.map((point) => <div key={point.label}><ImageIcon size={14} /><span><strong>{point.label}</strong><small>{point.note}</small></span></div>)}
          </div>
        </div>
        <aside className="cr-collision-sidebar" aria-label="轨迹对象和时间序列">
          <section>
            <div className="cr-collision-section-title"><span><Camera size={15} />对象状态</span><small>4 个对象</small></div>
            <div className="cr-collision-objects">
              {collisionRoutes.map((route) => (
                <div className="cr-collision-object" key={route.person}>
                  <i style={{ backgroundColor: route.color }} />
                  <div><strong>{route.person}</strong><small>{route.detail}</small></div>
                  {route.person === '张三' || route.person === '李四'
                    ? <span className="is-muted"><EyeOff size={13} />无路线</span>
                    : <span className="is-ready">可追踪</span>}
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className="cr-collision-section-title"><span><Clock3 size={15} />碰撞时序</span><small>按时间正序</small></div>
            <div className="cr-collision-timeline">
              {collisionTimeline.map((item) => <div className="cr-collision-timeline-item" key={`${item.time}-${item.label}`}>
                <span className={`timeline-dot ${item.tone}`} />
                <time>{item.time}</time>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
              </div>)}
            </div>
          </section>
        </aside>
      </div>
      <footer className="cr-collision-footer">说明：张三、李四因脸部信息被遮挡，仅保留可确认的接触时序点，不生成连续移动路线。图中位置、线路、图片和重合率均为虚拟演示数据。</footer>
    </section>
  );
}

export default ContactCollisionMap;
