import { Camera, ImageOff, MapPin, Maximize2, RefreshCw } from 'lucide-react';
import { Modal, Tooltip } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { appBasePath } from '../lib/presentation';
import type { ContactReviewRecord } from '../lib/contact-review';
import { zijingBasemap, zijingDemoStops, zijingOutline, type NightMarketScene } from '../lib/contact-zijing';

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

export function ContactGaitMap({ records, selectedId, onSelect }: {
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
  const points = records.slice(0, zijingDemoStops.length).map((record, index) => ({
    record, ...zijingDemoStops[index],
  }));
  const preview = points.find((point: typeof points[number]) => point.record.id === previewId);

  return <section className="cr-gait-map-section cr-nightmarket-map-section" aria-label="南昌市紫荆夜市演示点位地图">
    <header className="cr-nightmarket-heading">
      <div><MapPin size={17} /><h3>南昌市紫荆夜市</h3><span>地理地图 · 夜市场景演示</span></div>
      <div className="cr-nightmarket-heading-actions">
        <span className="cr-inspection-tag">{points.length} 个演示点位</span>
        <Tooltip title="重新加载地图和图片"><button type="button" className="ui-icon-button"
          aria-label="重新加载地图和图片" onClick={reloadImages}><RefreshCw size={16} /></button></Tooltip>
      </div>
    </header>
    <div className="cr-nightmarket-map-viewport" role="region" aria-label="紫荆夜市地图与点位图片">
      <div className={`cr-gait-map${mapFailed ? ' map-failed' : ''}`}>
        {mapFailed
          ? <p className="cr-nightmarket-map-error" role="status"><ImageOff size={20} />地图底图暂不可用</p>
          : <div className="cr-nightmarket-map-surface">
            <img key={revision} className="cr-nightmarket-basemap" src={imageSource(zijingBasemap.assetPath, revision)}
              alt="OpenStreetMap 紫荆夜市及周边地理底图，非实景照片"
              onLoad={() => setMapReady(true)} onError={() => { setMapFailed(true); setMapReady(false); }} />
            {!mapReady && <span className="cr-inspection-loading" role="status">地图加载中</span>}
            {mapReady && <>
              <svg className="cr-gait-route-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon className="cr-nightmarket-boundary" points={zijingOutline.map(point => point.join(',')).join(' ')} />
                {points.map(point => <line key={point.record.id} className="cr-nightmarket-leader"
                  x1={point.anchor[0]} y1={point.anchor[1]} x2={point.photo[0]} y2={point.photo[1]} />)}
                <polyline className="cr-nightmarket-route" points={points.map(point => point.anchor.join(',')).join(' ')} />
              </svg>
              {points.map((point, index) => <button key={point.record.id} type="button" className="cr-nightmarket-anchor"
                style={{ left: `${point.anchor[0]}%`, top: `${point.anchor[1]}%` }}
                aria-label={`选择演示点位 ${index + 1} ${point.scene.camera}`} aria-pressed={selectedId === point.record.id}
                onClick={() => onSelect(point.record.id)}>{index + 1}</button>)}
              <span className="cr-nightmarket-map-key"><span />预设路线</span>
            </>}
          </div>}
        {points.map((point, index) => {
          const { record, scene } = point;
          const selected = selectedId === record.id;
          return <div key={record.id} className={`cr-nightmarket-photo-marker${selected ? ' selected' : ''}`}
            style={{ left: `${point.photo[0]}%`, top: `${point.photo[1]}%` }}>
            <button type="button" className="cr-gait-point" data-record-id={record.id}
              aria-label={`摄像头 ${scene.camera} ${scene.title}`} aria-pressed={selected} onClick={() => onSelect(record.id)}>
              <GaitPhoto key={`${scene.assetPath}:${revision}`} scene={scene} revision={revision} />
              <span className="cr-nightmarket-photo-label">夜市演示</span>
              <span className="cr-nightmarket-photo-title"><span className="cr-nightmarket-photo-number">{index + 1}</span>
                <Camera size={13} /><strong>{scene.camera}</strong><span>{scene.title}</span></span>
            </button>
            <Tooltip title="放大夜市场景图"><button type="button" className="cr-nightmarket-photo-zoom"
              aria-label={`放大 ${scene.camera} 夜市场景图`} onClick={() => { onSelect(record.id); setPreviewId(record.id); }}>
              <Maximize2 size={14} />
            </button></Tooltip>
          </div>;
        })}
      </div>
    </div>
    <footer className="cr-nightmarket-map-footer">
      <span>地理底图非实景照片；机位与路线为预设，图片为项目夜市演示素材，非紫荆夜市实拍。</span>
      <a href={zijingBasemap.attributionUrl} target="_blank" rel="noopener noreferrer">{zijingBasemap.attribution}</a>
    </footer>
    <Modal title={preview ? `夜市场景演示 · ${preview.scene.camera}` : '夜市场景图片'} open={!!preview}
      onCancel={() => setPreviewId(undefined)} footer={null} width={960} className="cr-gait-image-modal" destroyOnHidden>
      {preview && <figure className="cr-gait-photo-preview">
        <GaitPhoto key={`${preview.scene.assetPath}:${revision}`} scene={preview.scene} revision={revision} full />
        <figcaption><strong>{preview.scene.camera} · {preview.scene.title}</strong>
          <span>素材标注时间：{preview.scene.occurredAt} · UTC+8</span>
          <span>资料来源：项目既有夜市演示素材。非紫荆夜市实拍，非真实监控证据。</span>
          <span>关联记录：{preview.record.id}（预设关联，不代表图中人物身份或实际行程）</span></figcaption>
      </figure>}
    </Modal>
  </section>;
}
