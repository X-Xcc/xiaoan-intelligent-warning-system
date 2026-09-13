import { Compass, Route, ShieldAlert } from 'lucide-react';
import type { DemoDispatchData, DemoDispatchRoute } from '../lib/demo-dispatch-data';
import mapArtwork from '../assets/demo-dispatch-map-v2.svg';
import '../styles/command-dispatch.css';

export function DemoDispatchMap({ data }: { data: DemoDispatchData }) {
  const toRoutePoints = (points: Array<{ x: number; y: number }>) =>
    points.map((point) => `${point.x},${point.y}`).join(' ');
  const routeOptions: DemoDispatchRoute[] = data.routeOptions.length > 0
    ? data.routeOptions
    : [{ id: 'demo-route-fallback', label: '系统推荐', points: data.routePoints, status: 'recommended' }];

  return <section className="demo-map-panel" aria-label="脱敏演示警力分布图">
    <div className="demo-map-canvas">
      <img className="demo-map-art" src={mapArtwork} alt="" aria-hidden="true" />
      <div className="demo-map-map-meta">5公里态势范围</div>
      <div className="demo-map-north" aria-label="北向"><Compass size={18} /><b>北</b></div>
      <svg className="demo-map-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="多路线可达示意">
        {routeOptions.map((routeOption) => (
          <polyline
            className={routeOption.id === data.recommendedRouteId ? 'demo-map-recommended-route' : 'demo-map-candidate-route'}
            key={routeOption.id}
            points={toRoutePoints(routeOption.points)}
          />
        ))}
        {routeOptions.filter((routeOption) => routeOption.congestionSegment).map((routeOption) => (
          <polyline
            className="demo-map-congestion"
            key={`${routeOption.id}-congestion`}
            points={toRoutePoints(routeOption.congestionSegment ?? [])}
          />
        ))}
      </svg>
      <div className="demo-map-route-callout demo-map-start">
        <span><Route size={15} /></span><b>最近警力 · 警力点 01</b>
      </div>
      <div className="demo-map-route-callout demo-map-route-label">系统推荐</div>
      <div className="demo-map-congestion-label" style={{ left: `${data.congestion.x}%`, top: `${data.congestion.y}%` }}>
        <span />前方拥堵
      </div>
      <div className="demo-map-marker demo-map-incident demo-map-end" style={{ left: `${data.incident.x}%`, top: `${data.incident.y}%` }}>
        <span><ShieldAlert size={16} /></span><b>报警处</b>
      </div>
      {data.units.map((unit) => <div
        className={`demo-map-marker demo-map-unit${unit.x > 68 ? ' demo-map-marker--left-label' : ''}`}
        key={unit.id}
        style={{ left: `${unit.x}%`, top: `${unit.y}%` }}
        aria-label={unit.name}
      >
        <span /><b>{unit.name}</b>
      </div>)}
      <div className="demo-map-scale"><span />1 公里</div>
    </div>
    <footer className="demo-map-footer">
      <span><i className="demo-legend-dot incident" />报警处</span>
      <span><i className="demo-legend-dot available" />附近警力</span>
      <span className="demo-map-route-key"><Route size={13} />候选路线</span>
      <span className="demo-map-recommended-key"><i />系统推荐</span>
      <span className="demo-map-congestion-key"><i />拥堵路段</span>
      <span className="demo-map-disclaimer">脱敏演示 · 不对应真实地理位置</span>
    </footer>
  </section>;
}
