import { Modal, Tooltip } from 'antd';
import { Activity, ArrowLeft, Camera, ChevronLeft, ChevronRight, Columns2, ImageOff, MapPin, UserRound } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { appBasePath } from '../lib/presentation';
import {
  contactAnnotations, contactComparisonRecords, contactGaitRoute, contactRoleLabels, referenceIdentity, referenceResidence,
  type ContactPerson, type IdentityField,
} from '../lib/contact-inspection';
import { CONTACT_REDACTED_VALUE, type ContactReviewRecord } from '../lib/contact-review';
import { ContactGaitMap } from './ContactGaitMap';
import { GaitAnalysisPanel } from './GaitAnalysisPanel';
import '../styles/contact-inspection.css';

type Props = {
  record: ContactReviewRecord;
  open: boolean;
  index: number;
  count: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onIdentityNext?: () => void;
};

type AnnotationLevel = 1 | 2 | 3;
const COMPARISON_ASPECT_RATIO = 429 / 295;

function redactedAnnotationLabel(annotation: { label: string; role?: keyof typeof contactRoleLabels }) {
  return annotation.role ? `${contactRoleLabels[annotation.role]} ${annotation.label}` : `脱敏对象 ${annotation.label}`;
}

function InspectionImage({ path, label, aspectRatio, fit = 'contain', children }: {
  path: string;
  label: string;
  aspectRatio?: number;
  fit?: 'contain' | 'cover';
  children?: ReactNode;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [ratio, setRatio] = useState(1.5);
  const frameRatio = aspectRatio ?? ratio;
  return <div className="cr-inspection-frame" style={{ aspectRatio: frameRatio }} aria-busy={state === 'loading'}>
    {state === 'failed'
      ? <div className="cr-inspection-image-error" role="img" aria-label={`${label}，图片暂不可用`}><ImageOff size={28} /><span>图片暂不可用</span></div>
      : <div className={`cr-inspection-image-content ${fit === 'cover' ? 'is-cover' : ''}`} style={{
        width: fit === 'cover' ? '100%' : `${Math.min(1, ratio / frameRatio) * 100}%`,
        height: fit === 'cover' ? '100%' : `${Math.min(1, frameRatio / ratio) * 100}%`,
      }}>
        <img className={`cr-inspection-image-${fit}`} src={`${appBasePath}${path}`} alt={label} onLoad={event => {
          setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight);
          setState('ready');
        }} onError={() => setState('failed')} />
        {state === 'ready' && children}
      </div>}
    {state === 'loading' && <span className="cr-inspection-loading" role="status">图片加载中</span>}
  </div>;
}

function IdentitySection({ title, fields }: { title: string; fields: readonly IdentityField[] }) {
  return <section className="cr-identity-section"><h4>{title}</h4>
    <dl className="cr-identity-fields">{fields.map(([label, value, wide]) => <div key={label} className={wide ? 'wide' : undefined}>
      <dt>{label}</dt><dd className={value === '未提供' || value === CONTACT_REDACTED_VALUE ? 'unset' : undefined}>{value}</dd>
    </div>)}</dl>
  </section>;
}

function InspectionContent({ record, index, count, onPrevious, onNext, onIdentityNext }: Omit<Props, 'open' | 'onClose'>) {
  const [person, setPerson] = useState<ContactPerson>('reference');
  const annotations = contactAnnotations[record.id] ?? [];
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(annotations.find(annotation => annotation.person === 'reference')?.id ?? '');
  const [annotationLevels, setAnnotationLevels] = useState<Record<string, AnnotationLevel>>({});
  const [showAnnotationMarker, setShowAnnotationMarker] = useState(false);
  const [comparing, setComparing] = useState(false);
  const comparisonRecords = useMemo(() => contactComparisonRecords(record), [record]);
  const [comparisonId, setComparisonId] = useState(() => (
    comparisonRecords.find(item => item.camera === 'CAM-11' && item.camera !== record.camera)
    ?? comparisonRecords.find(item => item.camera !== record.camera)
    ?? comparisonRecords[0]
  )?.id ?? '');
  const comparison = comparisonRecords.find(item => item.id === comparisonId);
  const comparisonCameras = [...new Set(comparisonRecords.map(item => item.camera))].sort();
  const comparisonCameraRecords = comparisonRecords.filter(item => item.camera === comparison?.camera);
  const [view, setView] = useState<'photo' | 'route' | 'gait'>('photo');
  const [cameraId, setCameraId] = useState(record.id);
  const heading = useRef<HTMLHeadingElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const mainPane = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const previousAnnotationId = useRef(selectedAnnotationId);
  const panelId = useId();
  const route = useMemo(() => contactGaitRoute(record), [record]);
  const camera = route.find(item => item.id === cameraId) ?? route[0];
  const selectedAnnotation = annotations.find(annotation => annotation.id === selectedAnnotationId);
  const selectedRole = selectedAnnotation?.role;
  const unknownId = CONTACT_REDACTED_VALUE;
  const identityLabel = selectedAnnotation ? redactedAnnotationLabel(selectedAnnotation) : CONTACT_REDACTED_VALUE;
  const gaitDisplayId = CONTACT_REDACTED_VALUE;
  const roleIdentity: readonly IdentityField[] = selectedRole ? [
    ['演示角色', contactRoleLabels[selectedRole]], ['人员编号', unknownId],
    ['姓名', CONTACT_REDACTED_VALUE], ['身份资料', CONTACT_REDACTED_VALUE], ['标注来源', '人工指定 · 演示预设', true],
  ] : [];
  const eventFields: IdentityField[] = [
    ['记录编号', record.id], ['当前机位', record.camera],
    ['出现时间', `${record.occurredAt} · UTC+8`, true], ['出现地点', record.location, true],
  ];
  useEffect(() => {
    heading.current?.closest('.ant-modal-wrap')?.scrollTo({ top: 0, behavior: 'instant' });
    mainPane.current?.scrollTo({ top: 0, behavior: 'instant' });
    sidebar.current?.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [view]);
  useEffect(() => {
    if (previousAnnotationId.current === selectedAnnotationId) return;
    previousAnnotationId.current = selectedAnnotationId;
    sidebar.current?.scrollTo({ top: 0, behavior: 'instant' });
    if (window.innerWidth <= 720) sidebar.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [selectedAnnotationId]);

  return <div className="cr-inspection">
    <div className="cr-inspection-toolbar">
      <div className="cr-inspection-title">
        {view === 'route' && <Tooltip title="返回原始图片"><button type="button" className="ui-icon-button"
          aria-label="返回原始图片" onClick={() => setView('photo')}><ArrowLeft size={17} /></button></Tooltip>}
        <div><h3 ref={heading} tabIndex={-1}>{view === 'route' ? `步态记录 · ${gaitDisplayId}` : view === 'gait' ? `步态分析 · ${gaitDisplayId}` : '现场图片与脱敏信息'}</h3>
          <p>{view === 'route' ? `${unknownId} · ${route.length} 个预设关联点位` : view === 'gait' ? `${record.occurredAt} · ${record.camera} · ${record.location}` : `${record.occurredAt} · ${record.camera} · ${record.location}`}</p></div>
      </div>
      {view === 'photo' && showAnnotationMarker && selectedAnnotation && !selectedRole && <div className="cr-annotation-marker-picker" role="group" aria-label="当前人物标记">
        <span>标记</span>
        {[1, 2, 3].map(level => <button type="button" key={level}
          className={`cr-annotation-marker marker-${level}`}
          aria-label={`标记 ${level}`}
          aria-pressed={annotationLevels[selectedAnnotation.id] === level}
          onClick={() => setAnnotationLevels(current => ({ ...current, [selectedAnnotation.id]: level as AnnotationLevel }))}>{level}</button>)}
      </div>}
      <div className="cr-inspection-pager"><span>{index + 1} / {count}</span>
        <Tooltip title="上一条记录"><button type="button" className="ui-icon-button" aria-label="弹窗上一条记录"
          disabled={index <= 0} onClick={onPrevious}><ChevronLeft size={17} /></button></Tooltip>
        <Tooltip title="下一条记录"><button type="button" className="ui-icon-button" aria-label="弹窗下一条记录"
          disabled={index >= count - 1} onClick={onNext}><ChevronRight size={17} /></button></Tooltip>
      </div>
    </div>
    <div className={`cr-inspection-body${view !== 'photo' ? ' cr-inspection-body-route' : ''}${view === 'gait' ? ' cr-inspection-body-gait' : ''}`}>
      <div ref={mainPane} className="cr-inspection-main">
        {view === 'photo' ? <div className={`cr-inspection-photos${comparing && comparison ? ' is-comparing' : ''}`}>
          <div className="cr-inspection-current">
            <InspectionImage key={record.assetPath} path={record.assetPath} label={`${record.id} 合成照片大图`}
              aspectRatio={comparing && comparison ? COMPARISON_ASPECT_RATIO : undefined}
              fit={comparing && comparison && !annotations.some(annotation => annotation.role) ? 'cover' : 'contain'}>
              <span className="cr-inspection-camera"><Camera size={13} />{record.camera}</span>
              {annotations.map(annotation => <button type="button"
                key={annotation.id} className={`cr-person-box ${annotation.person}${annotation.role ? ` role-${annotation.role}` : ''}${annotationLevels[annotation.id] ? ` level-${annotationLevels[annotation.id]}` : ''}`}
                aria-label={`查看${redactedAnnotationLabel(annotation)} 脱敏信息`}
                aria-pressed={selectedAnnotation?.id === annotation.id} aria-controls={panelId}
                title={`${redactedAnnotationLabel(annotation)} · ${annotation.role ? '人工指定的演示角色' : '已脱敏'}`}
                style={{ left: `${annotation.bounds[0]}%`, top: `${annotation.bounds[1]}%`, width: `${annotation.bounds[2]}%`, height: `${annotation.bounds[3]}%` }}
                onClick={() => { setSelectedAnnotationId(annotation.id); setPerson(annotation.person); setShowAnnotationMarker(true); }}><span>{annotation.role && <span className="cr-person-role">{contactRoleLabels[annotation.role]}</span>}{annotation.label}</span></button>)}
            </InspectionImage>
            <div className="cr-inspection-scene-caption"><span><MapPin size={13} />{record.location}</span></div>
          </div>
          <div className="cr-inspection-compare-controls" role="group" aria-label="图片对比">
            <label className="cr-inspection-compare-toggle">
              <input type="checkbox" checked={comparing} disabled={!comparison}
                onChange={event => setComparing(event.target.checked)} />
              <Columns2 size={15} aria-hidden="true" /><span>对比</span>
            </label>
            <select aria-label="对比机位" value={comparison?.camera ?? ''} disabled={!comparison}
              onChange={event => {
                const next = comparisonRecords.find(item => item.camera === event.target.value);
                if (next) { setComparisonId(next.id); setComparing(true); }
              }}>
              {comparisonCameras.map(camera => <option key={camera} value={camera}>{camera}</option>)}
            </select>
            {comparisonCameraRecords.length > 1 && <select className="cr-inspection-compare-record" aria-label="对比记录"
              value={comparisonId} onChange={event => { setComparisonId(event.target.value); setComparing(true); }}>
              {comparisonCameraRecords.map(item => <option key={item.id} value={item.id}>{item.occurredAt} · {item.id}</option>)}
            </select>}
          </div>
          {comparing && comparison && <section className="cr-inspection-comparison" aria-label="对比图片">
            <InspectionImage key={comparison.assetPath} path={comparison.assetPath} label={`${comparison.camera} · ${comparison.id} 对比图片`}
              aspectRatio={COMPARISON_ASPECT_RATIO} fit="cover">
              <span className="cr-inspection-camera"><Camera size={13} />{comparison.camera}</span>
            </InspectionImage>
            <div className="cr-inspection-scene-caption"><span><MapPin size={13} />{comparison.location}</span></div>
            <p className="cr-inspection-compare-time">{comparison.occurredAt} · {comparison.id}</p>
          </section>}
        </div> : view === 'route' ? <ContactGaitMap key={record.id} sourceRecordId={record.id} records={route} selectedId={camera.id} onSelect={setCameraId} /> : <GaitAnalysisPanel recordId={CONTACT_REDACTED_VALUE} onNext={onIdentityNext} />}
      </div>
      {view === 'photo' && <aside ref={sidebar} id={panelId} className="cr-inspection-sidebar" aria-label="脱敏资料">
          <div className="cr-inspection-section-heading"><h3 ref={panelHeading} tabIndex={-1}>{selectedRole ? `${contactRoleLabels[selectedRole]}脱敏信息` : '脱敏信息'}</h3>
            <span className={`cr-inspection-tag ${person === 'unknown' ? 'amber' : ''}`}>{selectedRole ? '演示预设' : person === 'reference' ? '虚构样例' : '占位样例'}</span></div>
          <div className="cr-inspection-person">
            <div className="cr-inspection-avatar"><UserRound size={32} role="img" aria-label="身份照片已脱敏" /></div>
            <div><strong>{identityLabel}</strong><small>{selectedRole ? `演示角色 · ${unknownId}` : '身份资料已脱敏'}</small></div>
          </div>
          {person === 'reference' ? <>
            <IdentitySection title={selectedRole ? '角色与身份' : '基本身份'} fields={selectedRole ? roleIdentity : referenceIdentity} />
            {!selectedRole && <IdentitySection title="居住与联系" fields={referenceResidence} />}
            <IdentitySection title="本次出现记录" fields={eventFields} />
            <p className="cr-inspection-notice">{selectedRole ? '角色由人工指定，仅用于合成场景演示，不构成身份识别或事实认定；未提供的身份资料不作推断。' : '资料来源：演示预设资料。性别、出生日期、国籍和地址为虚构填充值，与参考照片本人无关；未提供字段不作推断。'}</p>
          </> : <>
            <section className="cr-inspection-unknown"><h4>{selectedRole ? '人工角色标注' : '身份占位信息'}</h4><p>{selectedRole ? '角色由人工指定，仅用于合成场景演示，不构成身份识别或事实认定。' : '当前人物已标记，身份资料先使用占位内容。'}</p></section>
            <IdentitySection title={selectedRole ? '角色与身份' : '占位身份'} fields={selectedRole ? roleIdentity : referenceIdentity} />
            <div className="cr-inspection-actions" role="group" aria-label="步态与点位操作">
              <button type="button" className="ui-button primary cr-inspection-action" onClick={() => setView('gait')}><Activity size={15} />打开步态分析</button>
              <button type="button" className="ui-button cr-inspection-action-secondary" onClick={() => setView('route')}><MapPin size={15} />查看关联点位</button>
            </div>
            <IdentitySection title="演示记录" fields={[
              ['记录编号', gaitDisplayId, true], ['关联点位', `${route.length} 个摄像头`], ['资料来源', '脚本预设'],
              ['样例时间范围', `${route[0].occurredAt} 至 ${route[route.length - 1].occurredAt}`, true],
            ]} />
          </>}
      </aside>}
    </div>
    <p className="cr-inspection-footer">{view === 'route'
      ? '仿真街区 · 机位、案情地点与接触记录均为预设关联，不代表真实人物轨迹或监控证据。'
      : view === 'gait'
      ? '步态动画与 GEI 为前端演示模拟，不代表真实识别结果。'
      : '合成演示 · 图片、脱敏资料与点位关联为预设，非真实证据'}</p>
  </div>;
}

export function ContactRecordModal({ record, open, onClose, ...props }: Props) {
  return <Modal title={`记录详情 · ${record.id}`} open={open} onCancel={onClose} footer={null}
    width={1320} className="cr-record-modal" destroyOnHidden>
    <InspectionContent key={record.id} record={record} {...props} />
  </Modal>;
}
