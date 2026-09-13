import { LocateFixed, Minus, Plus, Route, ShieldAlert, Signal, ZoomIn } from 'lucide-react';
import type { DemoDispatchData } from '../lib/demo-dispatch-data';
import '../styles/command-dispatch.css';

export function DemoDispatchMap({
  data,
  selectedUnitId,
  onSelectUnit,
}: {
  data: DemoDispatchData;
  selectedUnitId: string;
  onSelectUnit: (unitId: string) => void;
}) {
  const route = data.routePoints.map((point) => `${point.x},${point.y}`).join(' ');

  return <section className="demo-map-panel" aria-label="脱敏演示警力分布图">
    <header className="demo-map-header">
      <div>
        <span className="demo-map-kicker">TACTICAL GRID / LOCAL DEMO</span>
        <h3><Route size={17} />警力分布与推荐路线</h3>
      </div>
      <span className="demo-map-status"><Signal size={14} />本地数据</span>
    </header>
    <div className="demo-map-canvas">
      <div className="demo-map-grid" aria-hidden="true" />
      <div className="demo-map-road demo-map-road-a" aria-hidden="true" />
      <div className="demo-map-road demo-map-road-b" aria-hidden="true" />
      <div className="demo-map-road demo-map-road-c" aria-hidden="true" />
      <div className="demo-map-zone demo-map-zone-north">演示辖区 · 北侧网格</div>
      <div className="demo-map-zone demo-map-zone-east">A 区</div>
      <div className="demo-map-zone demo-map-zone-west">B 区</div>
      <div className="demo-map-road-label demo-map-label-main">主街巡防线</div>
      <div className="demo-map-road-label demo-map-label-entry">北侧入口</div>
      <svg className="demo-map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="最近警力推荐路线">
        <polyline points={route} />
      </svg>
      <div className="demo-map-marker demo-map-incident" style={{ left: `${data.incident.x}%`, top: `${data.incident.y}%` }} title={data.incident.label}>
        <span><ShieldAlert size={16} /></span><b>警情</b>
      </div>
      {data.units.map((unit) => {
        const point = data.points.find((item) => item.id === unit.pointId);
        if (!point) return null;
        const selected = unit.id === selectedUnitId;
        return <button
          type="button"
          key={unit.id}
          className={`demo-map-marker demo-map-unit ${unit.status === '可调度' ? 'available' : 'busy'} ${selected ? 'selected' : ''}`}
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          aria-label={`${unit.name}，${unit.status}，${unit.distanceLabel}，${unit.etaLabel}`}
          aria-pressed={selected}
          onClick={() => onSelectUnit(unit.id)}
        >
          <span><Signal size={14} /></span><b>{unit.name}</b>
        </button>;
      })}
      <div className="demo-map-controls" aria-label="地图控制">
        <button type="button" aria-label="放大地图" title="放大地图"><Plus size={15} /></button>
        <button type="button" aria-label="缩小地图" title="缩小地图"><Minus size={15} /></button>
        <button type="button" aria-label="回到警情点" title="回到警情点"><LocateFixed size={15} /></button>
      </div>
      <div className="demo-map-scale"><span />虚构网格比例</div>
    </div>
    <footer className="demo-map-footer">
      <span><i className="demo-legend-dot incident" />当前警情</span>
      <span><i className="demo-legend-dot available" />可调度警力</span>
      <span><i className="demo-legend-dot busy" />处置中</span>
      <span className="demo-map-disclaimer"><ZoomIn size={13} />脱敏演示 · 不对应真实地理位置</span>
    </footer>
  </section>;
}
