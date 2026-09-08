import { Modal, Tooltip } from 'antd';
import { ArrowLeft, ArrowRight, Camera, ChevronLeft, ChevronRight, ImageOff, MapPin, UserRound, UserRoundX } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { appBasePath } from '../lib/presentation';
import {
  contactAnnotations, contactGaitRoute, referenceIdentity, referenceResidence,
  type ContactPerson, type IdentityField,
} from '../lib/contact-inspection';
import type { ContactReviewRecord } from '../lib/contact-review';
import { ContactGaitMap } from './ContactGaitMap';
import '../styles/contact-inspection.css';

type Props = {
  record: ContactReviewRecord;
  open: boolean;
  index: number;
  count: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function InspectionImage({ path, label, children }: {
  path: string;
  label: string;
  children?: ReactNode;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [ratio, setRatio] = useState(1.5);
  return <div className="cr-inspection-frame" style={{ aspectRatio: ratio }} aria-busy={state === 'loading'}>
    {state === 'failed'
      ? <div className="cr-inspection-image-error" role="img" aria-label={`${label}，图片暂不可用`}><ImageOff size={28} /><span>图片暂不可用</span></div>
      : <img src={`${appBasePath}${path}`} alt={label} onLoad={event => {
        setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight);
        setState('ready');
      }} onError={() => setState('failed')} />}
    {state === 'loading' && <span className="cr-inspection-loading" role="status">图片加载中</span>}
    {state === 'ready' && children}
  </div>;
}

function IdentitySection({ title, fields }: { title: string; fields: readonly IdentityField[] }) {
  return <section className="cr-identity-section"><h4>{title}</h4>
    <dl className="cr-identity-fields">{fields.map(([label, value, wide]) => <div key={label} className={wide ? 'wide' : undefined}>
      <dt>{label}</dt><dd className={value === '未提供' ? 'unset' : undefined}>{value}</dd>
    </div>)}</dl>
  </section>;
}

function InspectionContent({ record, index, count, onPrevious, onNext }: Omit<Props, 'open' | 'onClose'>) {
  const [person, setPerson] = useState<ContactPerson>('reference');
  const [view, setView] = useState<'photo' | 'route'>('photo');
  const [cameraId, setCameraId] = useState(record.id);
  const heading = useRef<HTMLHeadingElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const mainPane = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const previousPerson = useRef(person);
  const panelId = useId();
  const route = useMemo(() => contactGaitRoute(record), [record]);
  const camera = route.find(item => item.id === cameraId) ?? route[0];
  const unknownId = `TMP-${record.id}-02`;
  const gaitId = `GT-DEMO-${record.id.slice(3)}-02`;
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
    if (previousPerson.current === person) return;
    previousPerson.current = person;
    sidebar.current?.scrollTo({ top: 0, behavior: 'instant' });
    if (window.innerWidth <= 720) sidebar.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [person]);

  function selectUnknown() {
    setPerson('unknown');
    panelHeading.current?.focus({ preventScroll: true });
  }

  return <div className="cr-inspection">
    <div className="cr-inspection-toolbar">
      <div className="cr-inspection-title">
        {view === 'route' && <Tooltip title="返回原始图片"><button type="button" className="ui-icon-button"
          aria-label="返回原始图片" onClick={() => setView('photo')}><ArrowLeft size={17} /></button></Tooltip>}
        <div><h3 ref={heading} tabIndex={-1}>{view === 'route' ? `步态记录 · ${gaitId}` : '现场图片与身份信息'}</h3>
          <p>{view === 'route' ? `${unknownId} · ${route.length} 个预设关联点位` : `${record.occurredAt} · ${record.camera} · ${record.location}`}</p></div>
      </div>
      <div className="cr-inspection-pager"><span>{index + 1} / {count}</span>
        <Tooltip title="上一条记录"><button type="button" className="ui-icon-button" aria-label="弹窗上一条记录"
          disabled={index <= 0} onClick={onPrevious}><ChevronLeft size={17} /></button></Tooltip>
        <Tooltip title="下一条记录"><button type="button" className="ui-icon-button" aria-label="弹窗下一条记录"
          disabled={index >= count - 1} onClick={onNext}><ChevronRight size={17} /></button></Tooltip>
      </div>
    </div>
    <div className={`cr-inspection-body${view === 'route' ? ' cr-inspection-body-route' : ''}`}>
      <div ref={mainPane} className="cr-inspection-main">
        {view === 'photo' ? <>
          <InspectionImage key={record.assetPath} path={record.assetPath} label={`${record.id} 合成照片大图`}>
            <span className="cr-inspection-camera"><Camera size={13} />{record.camera}</span>
            {(contactAnnotations[record.id] ?? []).map(annotation => <button type="button"
              key={annotation.person} className={`cr-person-box ${annotation.person}`}
              aria-label={annotation.person === 'reference' ? '查看参考对象 01 身份信息' : '查看未知人物 02 人体框'}
              aria-pressed={person === annotation.person} aria-controls={panelId}
              title={annotation.person === 'reference' ? '参考对象 01 · 预设资料' : '未知人物 02 · 资料不可用'}
              style={{ left: `${annotation.bounds[0]}%`, top: `${annotation.bounds[1]}%`, width: `${annotation.bounds[2]}%`, height: `${annotation.bounds[3]}%` }}
              onClick={() => setPerson(annotation.person)}><span>{annotation.person === 'reference' ? '01' : '02'}</span></button>)}
          </InspectionImage>
          <div className="cr-inspection-person-switch" role="group" aria-label="图片中的人物">
            <button type="button" aria-pressed={person === 'reference'} onClick={() => setPerson('reference')}><UserRound size={15} />01 · 参考对象</button>
            <button type="button" aria-pressed={person === 'unknown'} onClick={selectUnknown}><UserRoundX size={15} />02 · 未知人物</button>
          </div>
          <div className="cr-inspection-scene-caption"><span><MapPin size={13} />{record.location}</span><span>人工预设框 · 非识别结果</span></div>
        </> : <ContactGaitMap records={route} selectedId={camera.id} onSelect={setCameraId} />}
      </div>
      {view === 'photo' && <aside ref={sidebar} id={panelId} className="cr-inspection-sidebar" aria-label="人物资料">
          <div className="cr-inspection-section-heading"><h3 ref={panelHeading} tabIndex={-1}>{person === 'reference' ? '身份信息' : '人物信息'}</h3>
            <span className={`cr-inspection-tag ${person === 'unknown' ? 'amber' : ''}`}>{person === 'reference' ? '虚构样例' : '无法识别'}</span></div>
          <div className="cr-inspection-person">
            <div className="cr-inspection-avatar">{person === 'reference'
              ? <InspectionImage path="/contact-review-assets/query-subject.jpg" label="参考对象 01 的参考照片" />
              : <UserRoundX size={27} />}</div>
            <div><strong>{person === 'reference' ? 'xxx' : '未知人物 02'}</strong><small>{person === 'reference' ? '参考对象 01 · REF-001' : unknownId}</small></div>
          </div>
          {person === 'reference' ? <>
            <IdentitySection title="基本身份" fields={referenceIdentity} />
            <IdentitySection title="居住与联系" fields={referenceResidence} />
            <IdentitySection title="本次出现记录" fields={eventFields} />
            <p className="cr-inspection-notice">资料来源：演示预设资料。性别、出生日期、国籍和地址为虚构填充值，与参考照片本人无关；未提供字段不作推断。</p>
            <button type="button" className="ui-button cr-inspection-action" onClick={selectUnknown}><UserRoundX size={15} />查看未知人物 02</button>
          </> : <>
            <section className="cr-inspection-unknown"><h4>无法识别人物信息</h4><p>暂无可用身份资料，当前状态为演示预设。</p></section>
            <p className="cr-inspection-generated">已生成步态记录（演示）</p>
            <IdentitySection title="演示记录" fields={[
              ['记录编号', gaitId, true], ['关联点位', `${route.length} 个摄像头`], ['资料来源', '脚本预设'],
              ['样例时间范围', `${route[0].occurredAt} 至 ${route[route.length - 1].occurredAt}`, true],
            ]} />
            <button type="button" className="ui-button primary cr-inspection-action" onClick={() => {
              setCameraId(record.id); setView('route');
            }}>查看步态记录<ArrowRight size={16} /></button>
            <p className="cr-inspection-notice">该记录仅为预设演示，不执行人脸识别、步态识别或真实人员追踪。</p>
          </>}
      </aside>}
    </div>
    <p className="cr-inspection-footer">{view === 'route'
      ? '紫荆夜市地理参考；夜市场景图与接触记录为预设关联，不代表真实人物轨迹。'
      : '合成演示 · 图片、身份资料与点位关联为预设，非真实证据'}</p>
  </div>;
}

export function ContactRecordModal({ record, open, onClose, ...props }: Props) {
  return <Modal title={`记录详情 · ${record.id}`} open={open} onCancel={onClose} footer={null}
    width={1320} className="cr-record-modal" destroyOnHidden>
    <InspectionContent key={record.id} record={record} {...props} />
  </Modal>;
}
