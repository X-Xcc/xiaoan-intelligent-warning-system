import { Route, ShieldAlert } from 'lucide-react';
import type { DemoDispatchData } from '../lib/demo-dispatch-data';
import '../styles/command-dispatch.css';

export function DemoDispatchMap({ data }: { data: DemoDispatchData }) {
  const route = data.routePoints.map((point) => `${point.x},${point.y}`).join(' ');

  return <section className="demo-map-panel" aria-label="脱敏演示警力分布图">
    <div className="demo-map-canvas">
      <div className="demo-map-grid" aria-hidden="true" />
      <div className="demo-map-road demo-map-road-a" aria-hidden="true" />
      <div className="demo-map-road demo-map-road-b" aria-hidden="true" />
      <div className="demo-map-road demo-map-road-c" aria-hidden="true" />
      <svg className="demo-map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="最近警力路线">
        <polyline points={route} />
      </svg>
      <div className="demo-map-marker demo-map-incident" style={{ left: `${data.incident.x}%`, top: `${data.incident.y}%` }}>
        <span><ShieldAlert size={16} /></span><b>报警处</b>
      </div>
      {data.units.map((unit) => <div
        className="demo-map-marker demo-map-unit"
        key={unit.id}
        style={{ left: `${unit.x}%`, top: `${unit.y}%` }}
        aria-label={unit.name}
      >
        <span /><b>{unit.name}</b>
      </div>)}
    </div>
    <footer className="demo-map-footer">
      <span><i className="demo-legend-dot incident" />报警处</span>
      <span><i className="demo-legend-dot available" />附近警力</span>
      <span className="demo-map-route-key"><Route size={13} />最近警力路线</span>
      <span className="demo-map-disclaimer">脱敏演示 · 不对应真实地理位置</span>
    </footer>
  </section>;
}
