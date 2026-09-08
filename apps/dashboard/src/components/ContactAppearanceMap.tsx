import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Tooltip } from 'antd';
import { Camera, Check, Layers3, MapPin, MapPinOff, Minus, Plus, RotateCcw } from 'lucide-react';
import type { ContactReviewRecord } from '../lib/contact-review';
import '../styles/contact-appearance-map.css';

export type ContactAppearanceMapProps = {
  records: ContactReviewRecord[];
  selectedId?: string;
  onSelect: (id: string) => void;
};

// Coordinates belong only to this fictional illustration, never to a geographic system.
const LOCATION_POSITIONS: Record<string, readonly [number, number]> = {
  '东城服务中心外侧': [10, 15],
  '滨江步行街北入口': [90, 15],
  '市民广场东侧长廊': [50, 37],
  '科技园一号门': [30, 15],
  '文化馆南侧通道': [50, 15],
  '公交枢纽西侧落客区': [10, 59],
  '社区服务站门厅': [10, 37],
  '商业街停车区入口': [70, 37],
  '河畔步道观景平台': [90, 59],
  '大学城共享大厅': [30, 59],
  '图书馆北侧连廊': [50, 59],
  '会展中心东广场': [70, 59],
  '园区食堂外摆区': [30, 37],
  '体育中心南门': [70, 81],
  '老城街区拐角处': [10, 81],
  '社区公园西入口': [90, 37],
  '市政大厅前坪': [50, 81],
  '火车站南侧广场': [30, 81],
  '创新园咖啡外摆区': [70, 15],
  '公共文化中心入口': [90, 81],
};

type Place = { location: string; x: number; y: number; records: ContactReviewRecord[] };
type PointGroup = { places: Place[]; x: number; y: number; records: ContactReviewRecord[] };
const MARKER_WIDTH = 142;
const MARKER_HEIGHT = 70;

function locationPosition(location: string): readonly [number, number] {
  if (Object.prototype.hasOwnProperty.call(LOCATION_POSITIONS, location)) return LOCATION_POSITIONS[location];
  let hash = 2166136261;
  for (let i = 0; i < location.length; i += 1) hash = Math.imul(hash ^ location.charCodeAt(i), 16777619);
  const slot = (hash >>> 0) % 20;
  return [10 + (slot % 5) * 20, 15 + Math.floor(slot / 5) * 22];
}

function groupPoints(places: Place[], width: number, height: number): PointGroup[] {
  const position = (members: Place[]): PointGroup => ({
    places: members,
    x: Math.max(MARKER_WIDTH / 2 + 6, Math.min(width - MARKER_WIDTH / 2 - 6,
      members.reduce((sum, place) => sum + place.x, 0) / members.length * width / 100)),
    y: Math.max(MARKER_HEIGHT / 2 + 6, Math.min(height - MARKER_HEIGHT / 2 - 6,
      members.reduce((sum, place) => sum + place.y, 0) / members.length * height / 100)),
    records: members.flatMap((place) => place.records).sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)),
  });
  const groups = places.map((place) => position([place]));
  // Merge intersecting label footprints as well as markers; filtering never moves a lone place.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < groups.length; a += 1) {
      for (let b = a + 1; b < groups.length; b += 1) {
        if (Math.abs(groups[a].x - groups[b].x) < MARKER_WIDTH + 10
          && Math.abs(groups[a].y - groups[b].y) < MARKER_HEIGHT + 6) {
          groups[a] = position([...groups[a].places, ...groups[b].places]);
          groups.splice(b, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups;
}

export function FictionalDistrict() {
  return (
    <svg className="contact-appearance-map__drawing" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
      <rect width="1000" height="620" fill="#f0f3f2" />
      <path d="M916 0 C866 95 956 163 917 252 S860 405 943 481 L1000 545 V0Z" fill="#d8edf4" />
      <path d="M892 0 C842 96 932 158 893 249 S834 407 918 493" fill="none" stroke="#c5e3d7" strokeWidth="19" />
      <path d="M808 202 Q853 186 883 208 L871 332 Q820 347 796 306Z" fill="#d4e8dd" />
      <path d="M420 204 H564 Q581 204 581 221 V318 H420Z" fill="#deebe3" />
      <path d="M390 351 H579 V454 H405 Q390 445 390 425Z" fill="#d5e8df" />
      <g fill="#e0e5e5" stroke="#d2dadb" strokeWidth="1">
        {[44, 243, 442, 641].map((x) => (
          <g key={x}>
            <rect x={x} y="38" width="60" height="39" rx="4" />
            <rect x={x + 73} y="38" width="46" height="68" rx="4" />
            <rect x={x} y="93" width="60" height="39" rx="4" />
            <rect x={x} y="222" width="51" height="72" rx="4" />
            <rect x={x + 67} y="239" width="52" height="55" rx="4" />
            <rect x={x} y="374" width="119" height="35" rx="4" />
            <rect x={x} y="426" width="48" height="29" rx="4" />
            <rect x={x + 64} y="426" width="55" height="29" rx="4" />
            <rect x={x} y="532" width="49" height="54" rx="4" />
            <rect x={x + 65} y="544" width="54" height="42" rx="4" />
          </g>
        ))}
      </g>
      <g fill="none" stroke="#d9dfe0" strokeWidth="28">
        <path d="M0 161 H1000 M0 298 H1000 M0 434 H1000" />
        <path d="M200 0 V620 M399 0 V620 M600 0 V620 M793 0 V620" />
      </g>
      <g fill="none" stroke="#fff" strokeWidth="23">
        <path d="M0 161 H1000 M0 298 H1000 M0 434 H1000" />
        <path d="M200 0 V620 M399 0 V620 M600 0 V620 M793 0 V620" />
      </g>
      <g fill="none" stroke="#e5eaeb" strokeWidth="2" strokeDasharray="6 8">
        <path d="M0 161 H1000 M0 298 H1000 M0 434 H1000" />
      </g>
      <g className="contact-appearance-map__road-labels" fill="#73817d" fontSize="12" textAnchor="middle">
        <text x="290" y="165">云栖路</text>
        <text x="690" y="302">青禾路</text>
        <text x="490" y="438">知行路</text>
      </g>
    </svg>
  );
}

export function ContactAppearanceMap({ records, selectedId, onSelect }: ContactAppearanceMapProps) {
  const headingId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 392 });
  const [zoom, setZoom] = useState(1);
  const [activeLocation, setActiveLocation] = useState<string>();
  const places = useMemo(() => {
    const byLocation = new Map<string, Place>();
    records.forEach((record) => {
      const existing = byLocation.get(record.location);
      if (existing) existing.records.push(record);
      else {
        const [x, y] = locationPosition(record.location);
        byLocation.set(record.location, { location: record.location, x, y, records: [record] });
      }
    });
    return [...byLocation.values()].sort((a, b) => a.location.localeCompare(b.location));
  }, [records]);
  const groups = useMemo(() => groupPoints(places, size.width * zoom, size.height * zoom), [places, size, zoom]);
  const selectedGroup = groups.find((group) => group.records.some((record) => record.id === selectedId));
  const activeGroup = selectedGroup ?? groups.find((group) => group.places.some((place) => place.location === activeLocation));

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setSize((current) => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      return next.width > 0 && next.height > 0 && (next.width !== current.width || next.height !== current.height) ? next : current;
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const focusX = selectedGroup?.x ?? size.width * zoom / 2;
  const focusY = selectedGroup?.y ?? size.height * zoom / 2;
  useEffect(() => {
    viewport.current?.scrollTo({
      left: Math.max(0, focusX - size.width / 2),
      top: Math.max(0, focusY - size.height / 2),
      behavior: 'instant',
    });
  }, [focusX, focusY, size.width, size.height, selectedId, zoom]);

  return (
    <section className="contact-appearance-map" aria-labelledby={headingId}>
      <header className="contact-appearance-map__header">
        <div className="contact-appearance-map__heading">
          <MapPin size={17} aria-hidden="true" />
          <h3 id={headingId}>虚构点位示意</h3>
        </div>
        <span className="contact-appearance-map__count">{places.length} 个地点 · {records.length} 条记录</span>
      </header>
      <div className="contact-appearance-map__surface">
        <div
          ref={viewport}
          className="contact-appearance-map__viewport"
          role="region"
          aria-label="虚构街区点位，非实际地图，不代表移动路径"
          tabIndex={0}
        >
          <div className="contact-appearance-map__world" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
            <FictionalDistrict />
            {groups.map((group) => {
              const selected = group.records.some((record) => record.id === selectedId);
              const multiplePlaces = group.places.length > 1;
              const multipleRecords = group.records.length > 1;
              const label = multiplePlaces ? `${group.places.length} 个地点` : group.places[0].location;
              const cameras = [...new Set(group.records.map((record) => record.camera))].sort().join(' / ');
              const accessibleLabel = `${label}，${cameras}，${group.records.length} 条记录`;
              return (
                <Tooltip key={group.places.map((place) => place.location).join('\u0000')} title={accessibleLabel}>
                  <button
                    type="button"
                    className={`contact-appearance-map__point${selected ? ' is-selected' : ''}${multipleRecords ? ' is-multiple' : ''}`}
                    style={{ left: group.x, top: group.y }}
                    aria-label={accessibleLabel}
                    aria-pressed={selected}
                    onClick={() => {
                      setActiveLocation(group.places[0].location);
                      onSelect(group.records.find((record) => record.id === selectedId)?.id ?? group.records[0].id);
                    }}
                  >
                    <span className="contact-appearance-map__pin">
                      {multiplePlaces ? <Layers3 size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}
                      {multipleRecords && <span className="contact-appearance-map__badge">{group.records.length}</span>}
                    </span>
                    <span className="contact-appearance-map__place">{label}</span>
                    <span className="contact-appearance-map__camera">{multiplePlaces ? `${group.records.length} 条记录` : cameras}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div className="contact-appearance-map__controls" role="group" aria-label="地图缩放">
          <Tooltip title="放大">
            <button type="button" aria-label="放大点位示意图" disabled={zoom >= 3 || !records.length} onClick={() => setZoom((value) => Math.min(3, value + 0.5))}>
              <Plus size={17} aria-hidden="true" />
            </button>
          </Tooltip>
          <output aria-label="当前缩放比例">{Math.round(zoom * 100)}%</output>
          <Tooltip title="缩小">
            <button type="button" aria-label="缩小点位示意图" disabled={zoom <= 1 || !records.length} onClick={() => setZoom((value) => Math.max(1, value - 0.5))}>
              <Minus size={17} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip title="重置视图">
            <button type="button" aria-label="重置点位示意图" disabled={!records.length} onClick={() => {
              setZoom(1);
              viewport.current?.scrollTo({ left: 0, top: 0, behavior: 'instant' });
            }}>
              <RotateCcw size={15} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
        {!records.length && (
          <div className="contact-appearance-map__empty" role="status">
            <MapPinOff size={28} aria-hidden="true" />
            <strong>暂无匹配点位</strong>
            <span>0 条出现记录</span>
          </div>
        )}
      </div>
      <footer className="contact-appearance-map__legend" aria-label="点位图例">
        <span><i className="contact-appearance-map__key" />出现点位</span>
        <span><i className="contact-appearance-map__key is-selected" />当前选中</span>
        <span><Layers3 size={13} aria-hidden="true" />聚合记录</span>
        <span className="contact-appearance-map__disclaimer">非实际地图 · 不代表移动路径</span>
      </footer>
      {activeGroup && (
        <div className="contact-appearance-map__records">
          <div className="contact-appearance-map__records-heading">
            <strong>{activeGroup.places.length > 1 ? '聚合点位' : activeGroup.places[0].location}</strong>
            <span>{activeGroup.records.length} 条记录</span>
          </div>
          <ul aria-label="当前点位的出现记录">
            {activeGroup.records.map((record) => (
              <li key={record.id}>
                <Tooltip title={`${record.location} · ${record.camera} · ${record.occurredAt}`}>
                  <button type="button" aria-label={`选择记录 ${record.id}，${record.location}，${record.camera}，${record.occurredAt}`}
                    aria-pressed={record.id === selectedId} onClick={() => onSelect(record.id)}>
                    <Camera size={16} aria-hidden="true" />
                    <span className="contact-appearance-map__record-copy">
                      <strong>{record.location}</strong>
                      <span>{record.camera} · {record.occurredAt}</span>
                    </span>
                    {record.id === selectedId && <Check size={16} aria-hidden="true" />}
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ContactAppearanceMap;
