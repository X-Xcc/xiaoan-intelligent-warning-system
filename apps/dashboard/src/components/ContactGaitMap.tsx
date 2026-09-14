import { ArrowUp, Camera, ImageOff, MapPin, Maximize2, RefreshCw } from 'lucide-react';
import { Modal, Tooltip } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { appBasePath } from '../lib/presentation';
import type { ContactReviewRecord } from '../lib/contact-review';
import type { NightMarketScene } from '../lib/contact-zijing';
import {
  caseBasemap,
  caseOutline,
  getCaseMapPoints,
  getCaseMapVariant,
  type CaseMapRoute,
} from '../lib/contact-case-map';
import '../styles/contact-case-map.css';

function imageSource(path: string, revision: number) {
  const source = `${appBasePath}${path}`;
  if (!revision) return source;
  const url = new URL(source, window.location.origin);
  url.searchParams.set('reload', String(revision));
  return url.href;
}

function GaitPhoto({ scene, revision, full = false }: { scene: NightMarketScene; revision: number; full?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [useOriginal, setUseOriginal] = useState(full);
  return failed
    ? <span className="cr-gait-photo-error" role="img" aria-label={`${scene.camera} 图片暂不可用`}><ImageOff size={22} /><span>图片暂不可用</span></span>
    : <img src={imageSource(useOriginal ? scene.assetPath : scene.thumbnailPath, revision)}
      alt={`${scene.camera} ${scene.title} 夜市场景演示，非紫荆夜市实拍`} onError={() => {
        if (!useOriginal) setUseOriginal(true);
        else setFailed(true);
      }} />;
}

export function ContactGaitMap({ sourceRecordId = '', records, selectedId, onSelect }: {
  sourceRecordId?: string;
  records: ContactReviewRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [previewId, setPreviewId] = useState<string>();
  const [revision, setRevision] = useState(0);
  const reloadImages = useCallback(() => {
    setMapFailed(false);
    setMapReady(false);
    setRevision(current => current + 1);
  }, []);
  useEffect(() => {
    window.addEventListener('online', reloadImages);
    return () => window.removeEventListener('online', reloadImages);
  }, [reloadImages]);
  const points = getCaseMapPoints(records, sourceRecordId);
  const activeId = points.find(point => point.record.id === selectedId)?.record.id ?? points[0]?.record.id;
  const preview = points.find(point => point.record.id === previewId);
  const variant = getCaseMapVariant(sourceRecordId, points.length);
  const routes: CaseMapRoute[] = [{ id: 'primary-route', color: 'blue', points: variant.route }];
  if (variant.comparisonRoute.length) routes.push({
    id: 'comparison-route', color: variant.comparisonColor, points: variant.comparisonRoute,
  });
  const overlapLabel = `路线重合率${sourceRecordId === 'CR-020' ? '仅 ' : ' '}${variant.overlapRate}%`;
  if (!points.length) return <section className="cr-nightmarket-map-section" aria-label="夜市仿真街区关联点位">
    <p className="cr-nightmarket-empty" role="status"><MapPin size={20} />暂无关联点位</p>
  </section>;

  return <section className="cr-gait-map-section cr-nightmarket-map-section" aria-label="夜市仿真街区关联点位"
    data-source-record-id={sourceRecordId}>
    <header className="cr-nightmarket-heading">
      <div className="cr-nightmarket-heading-title"><MapPin size={17} /><div><h3>{variant.title}</h3>
        <p>仿真街区 · 道路 / 建筑 / 机位</p></div></div>
      <div className="cr-nightmarket-heading-actions">
        <span className="cr-inspection-tag amber">演示场景</span>
        <span className="cr-inspection-tag">{points.length} 个关联点位</span>
        {points.length >= 3 && <span className="cr-nightmarket-route-overlap" aria-label={overlapLabel}>
          {overlapLabel}
        </span>}
        <Tooltip title="重新加载地图和图片"><button type="button" className="ui-icon-button"
          aria-label="重新加载地图和图片" onClick={reloadImages}><RefreshCw size={16} /></button></Tooltip>
      </div>
    </header>
    <div className="cr-nightmarket-legend" aria-label="点位图例">
      {points.filter(point => point.role !== 'transit').map(point => <span key={point.role} className={`cr-case-${point.role}`}>
        <i />{point.label}</span>)}
      {routes.map(route => <span key={route.id}><i className={`cr-nightmarket-route-key cr-nightmarket-route-key-${route.color}`} />
        {route.color === 'blue' ? '主路线' : route.color === 'brown' ? '对比路线' : '第二条路径'}</span>)}
      {variant.branches.length > 0 && <span><i className="cr-nightmarket-route-key cr-nightmarket-route-key-branch" />分叉路线</span>}
    </div>
    <div className="cr-nightmarket-map-viewport" role="region" aria-label="仿真街区地图与点位时间线">
      <aside className="cr-nightmarket-timeline">
        <h4>关联时间线</h4>
        <ol aria-label="关联时间线">{points.map((point, index) => <li key={point.record.id} className={`cr-case-${point.role}`}>
          <button type="button" data-record-id={point.record.id} aria-pressed={activeId === point.record.id}
            aria-label={`时间线 ${index + 1} ${point.label} ${point.scene.camera}`} onClick={() => onSelect(point.record.id)}>
            <span className="cr-nightmarket-step-number">{index + 1}</span>
            <span className="cr-nightmarket-step-detail"><strong>{point.label}</strong>
              <small>{point.scene.camera}<time dateTime={`${point.scene.occurredAt.replace(' ', 'T')}+08:00`}>
                {point.scene.occurredAt.slice(11)}</time></small></span>
          </button>
        </li>)}</ol>
        <p className="cr-nightmarket-timeline-summary">场景日期 {points[0].scene.occurredAt.slice(0, 10)}<br />
          {points.length} 个机位 · {points.filter(point => point.role !== 'transit').length} 个关键地点</p>
      </aside>
      <div className={`cr-gait-map${mapFailed ? ' map-failed' : ''}`}>
        <div className="cr-nightmarket-map-surface" aria-busy={!mapReady && !mapFailed}>
          {mapFailed
            ? <p className="cr-nightmarket-map-error" role="status"><ImageOff size={20} />地图底图暂不可用</p>
            : <>
            <img key={revision} className="cr-nightmarket-basemap" src={imageSource(caseBasemap.assetPath, revision)}
              width={caseBasemap.width} height={caseBasemap.height}
              alt="虚构夜市街区底图：道路、建筑、沿河绿地与停车场，非真实地理位置"
              onLoad={() => setMapReady(true)} onError={() => { setMapFailed(true); setMapReady(false); }} />
            {!mapReady && <span className="cr-inspection-loading" role="status">地图加载中</span>}
            {mapReady && <>
              <svg className="cr-gait-route-line" viewBox={`0 0 ${caseBasemap.width} ${caseBasemap.height}`} aria-hidden="true">
                <polygon className="cr-nightmarket-boundary" points={caseOutline.map(point => point.join(',')).join(' ')} />
                {routes.map(routeDefinition => {
                  const routePoints = routeDefinition.points.map(point => point.join(',')).join(' ');
                  return <g key={routeDefinition.id} data-route-id={routeDefinition.id} aria-label={routeDefinition.id}>
                    <polyline className="cr-nightmarket-route-halo" points={routePoints} />
                    <polyline className={`cr-nightmarket-route cr-nightmarket-route-${routeDefinition.color}`} points={routePoints} />
                  </g>;
                })}
                {variant.branches.map(branch => <g key={branch.id} data-route-id={branch.id} aria-label={branch.id}>
                  <polyline className="cr-nightmarket-route-halo cr-nightmarket-route-branch-halo"
                    points={branch.points.map(point => point.join(',')).join(' ')} />
                  <polyline className="cr-nightmarket-route cr-nightmarket-route-branch"
                    points={branch.points.map(point => point.join(',')).join(' ')} />
                </g>)}
              </svg>
              {points.map((point, index) => <button key={point.record.id} type="button"
                className={`cr-nightmarket-anchor cr-case-${point.role}`} data-record-id={point.record.id}
                style={{ left: `${point.anchor[0] / caseBasemap.width * 100}%`, top: `${point.anchor[1] / caseBasemap.height * 100}%` }}
                aria-label={`选择演示点位 ${index + 1} ${point.scene.camera} ${point.label}`} aria-pressed={activeId === point.record.id}
                onClick={() => onSelect(point.record.id)}>{index + 1}
                {(point.role === 'incident' || (point.role === 'contact' && sourceRecordId !== 'CR-020')) && <span className="cr-nightmarket-place-label">{point.label}</span>}
              </button>)}
              <span className="cr-nightmarket-north" aria-label="图示北向"><ArrowUp size={22} />N</span>
              <span className="cr-nightmarket-map-key">仿真街区 · 非实测比例</span>
            </>}
          </>}
        </div>
      </div>
    </div>
    <div className="cr-nightmarket-photo-strip" role="group" aria-label="关联点位图片">
      {points.map((point, index) => {
          const { record, scene } = point;
          const selected = activeId === record.id;
          return <div key={record.id} className={`cr-nightmarket-photo-marker cr-case-${point.role}${selected ? ' selected' : ''}`}>
            <button type="button" className="cr-gait-point" data-record-id={record.id}
              aria-label={`摄像头 ${scene.camera} ${scene.title} ${point.label}`} aria-pressed={selected} onClick={() => onSelect(record.id)}>
              <GaitPhoto key={`${scene.assetPath}:${revision}`} scene={scene} revision={revision} />
              <span className="cr-nightmarket-photo-label">{index + 1} · {point.label}</span>
              <span className="cr-nightmarket-photo-title"><Camera size={12} /><strong>{scene.camera}</strong>
                <time dateTime={`${scene.occurredAt.replace(' ', 'T')}+08:00`}>{scene.occurredAt.slice(11)}</time></span>
            </button>
            <Tooltip title="放大夜市场景图"><button type="button" className="cr-nightmarket-photo-zoom"
              aria-label={`放大 ${scene.camera} 夜市场景图`} onClick={() => { onSelect(record.id); setPreviewId(record.id); }}>
              <Maximize2 size={14} />
            </button></Tooltip>
          </div>;
        })}
    </div>
    <footer className="cr-nightmarket-map-footer">
      <span>程序绘制的仿真街区，非紫荆夜市真实地理结构；照片为项目既有夜市演示素材。</span>
    </footer>
    <Modal title={preview ? `夜市场景演示 · ${preview.scene.camera}` : '夜市场景图片'} open={!!preview}
      onCancel={() => setPreviewId(undefined)} footer={null} width={960} className="cr-gait-image-modal" destroyOnHidden>
      {preview && <figure className="cr-gait-photo-preview">
        <GaitPhoto key={`${preview.scene.assetPath}:${revision}`} scene={preview.scene} revision={revision} full />
        <figcaption><strong>{preview.label} · {preview.scene.camera} · {preview.scene.title}</strong>
          <span>素材标注时间：{preview.scene.occurredAt} · UTC+8</span>
          <span>资料来源：项目既有夜市演示素材。非紫荆夜市实拍，非真实监控证据。</span>
          <span>关联记录：{preview.record.id}（预设关联，不代表图中人物身份或实际行程）</span></figcaption>
      </figure>}
    </Modal>
  </section>;
}
