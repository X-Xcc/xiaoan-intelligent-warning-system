import {
  ArrowLeft, ArrowUpRight, Bookmark, CalendarDays, Camera, Check, Download,
  ImageOff, ImagePlus, LayoutGrid, List, MapPin, RotateCcw,
  Search, ShieldCheck, UsersRound, X,
} from 'lucide-react';
import { Modal, Tooltip } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appBasePath } from '../lib/presentation';
import {
  CONTACT_DEMO_DATE, CONTACT_STORAGE_KEY, contactDateWindow, contactReviewCsv,
  contactReviewRecords, parseContactDraft, selectContactRecords,
  type ContactFilters, type ContactReviewDraft, type ReviewStatus,
} from '../lib/contact-review';

const initialFilters: ContactFilters = { ...contactDateWindow(30), query: '', location: '', companion: '', sort: 'newest', status: 'all' };
const statuses: Array<'all' | ReviewStatus> = ['all', '待复核', '已标记', '已排除'];
const locations = [...new Set(contactReviewRecords.map((record) => record.location))];
const companions = [...new Map(contactReviewRecords.map((record) => [record.companion.id, record.companion])).values()];
const subjectPath = `${appBasePath}/contact-review-assets/query-subject.jpg`;

function StatusTag({ status }: { status: ReviewStatus }) {
  return <span className={`cr-status ${status === '已标记' ? 'marked' : status === '已排除' ? 'excluded' : 'pending'}`}><i />{status}</span>;
}

function RecordImage({ path, label, thumbnail = false }: { path: string; label: string; thumbnail?: boolean }) {
  const [failedPath, setFailedPath] = useState('');
  return failedPath === path
    ? <div className="cr-image-unavailable" role="img" aria-label={label + '，素材未就绪'}><ImageOff size={22} /><span>素材未就绪</span></div>
    : <img src={`${appBasePath}${thumbnail ? path.replace(/\.png$/, '.thumb.webp') : path}`} alt={label} loading="lazy" onError={() => setFailedPath(path)} />;
}

function initialDraft() {
  try { return parseContactDraft(localStorage.getItem(CONTACT_STORAGE_KEY)); } catch { return {}; }
}

export function ContactReviewPage({ onBack }: { onBack: () => void }) {
  const [filters, setFilters] = useState<ContactFilters>(initialFilters);
  const [pendingFilters, setPendingFilters] = useState<ContactFilters>(initialFilters);
  const [range, setRange] = useState('30');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('CR-001');
  const [draft, setDraft] = useState<ContactReviewDraft>(initialDraft);
  const [queryImage, setQueryImage] = useState(subjectPath);
  const [uploaded, setUploaded] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [view, setView] = useState<'grid' | 'timeline'>('grid');
  const [expanded, setExpanded] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadVersion = useRef(0);

  useEffect(() => {
    function syncDraft(event: StorageEvent) {
      if (event.key !== CONTACT_STORAGE_KEY && event.key !== null) return;
      try {
        setDraft(parseContactDraft(localStorage.getItem(CONTACT_STORAGE_KEY)));
      } catch { setFeedback('本地草稿暂时无法读取。'); }
    }
    window.addEventListener('storage', syncDraft);
    return () => window.removeEventListener('storage', syncDraft);
  }, []);
  useEffect(() => () => { if (queryImage.startsWith('blob:')) URL.revokeObjectURL(queryImage); }, [queryImage]);
  useEffect(() => () => { uploadVersion.current += 1; }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 4500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const records = useMemo(() => contactReviewRecords.map((record) => ({ ...record, status: draft[record.id]?.status ?? record.status })), [draft]);
  const filtered = useMemo(() => selectContactRecords(records, { ...filters, query }), [records, filters, query]);
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];
  const marked = records.filter((record) => record.status === '已标记');
  const pendingCount = records.filter((record) => record.status === '待复核').length;
  const hasPendingFilters = ['from', 'to', 'location'].some((key) => pendingFilters[key as keyof ContactFilters] !== filters[key as keyof ContactFilters]);

  async function upload(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setFeedback('请选择不超过 8 MB 的 JPG、PNG 或 WebP 图片。'); return;
    }
    const version = ++uploadVersion.current;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (version !== uploadVersion.current) { URL.revokeObjectURL(url); return; }
      setQueryImage(url);
      setUploaded(true);
      setFeedback('参考照片已更换，下方仍是固定演示集，不执行人脸检索。');
    } catch { URL.revokeObjectURL(url); setFeedback('图片无法读取，请换一张有效图片。'); }
  }

  function applyFilters() {
    if (!pendingFilters.from || !pendingFilters.to || pendingFilters.from > pendingFilters.to) {
      setFormError('请选择有效日期，开始日期不能晚于结束日期。'); return;
    }
    setFormError('');
    setFilters((current) => ({ ...current, from: pendingFilters.from, to: pendingFilters.to, location: pendingFilters.location }));
  }

  function reset() {
    setFilters(initialFilters); setPendingFilters(initialFilters); setQuery(''); setRange('30'); setFormError('');
  }

  function exportRecords() {
    const url = URL.createObjectURL(new Blob([contactReviewCsv(marked, draft)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `contact-review-demo-${CONTACT_DEMO_DATE}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback(`已导出 ${marked.length} 条人工标记记录`);
  }

  return <section className="contact-review-page" aria-label="接触记录检索工作台">
    <header className="contact-review-heading">
      <div><div className="ui-eyebrow">影像资料 / 人工复核</div><h1>接触记录检索 <span className="cr-demo-badge">演示工作台</span></h1></div>
      <div className="cr-heading-actions">
        <Tooltip title="返回平台总览"><button className="ui-icon-button" type="button" aria-label="返回平台总览" onClick={onBack}><ArrowLeft size={18} /></button></Tooltip>
        <button className="ui-button" type="button" disabled={!marked.length} onClick={exportRecords}><Download size={16} />导出复核清单{marked.length > 0 && ` (${marked.length})`}</button>
      </div>
    </header>
    <div className="cr-provenance"><ShieldCheck size={15} /><span>合成演示，非真实证据。时间、地点与同行档案均为预设，不代表真实行踪或身份识别结果。</span><span className="cr-provenance-date">样例基准日 {CONTACT_DEMO_DATE}</span></div>
    <div className="contact-review-grid">
      <aside className="contact-review-sidebar">
        <section className="cr-query-section">
          <div className="cr-section-heading"><h2>参考对象</h2><span className="cr-subtle">REF-001</span></div>
          <div className="cr-query-object"><img src={queryImage} alt="授权对象参考照片" /><div><strong>授权演示对象</strong><span>参考照片</span><span className="cr-local-label"><ShieldCheck size={12} />仅本地预览</span></div></div>
          <button className="ui-button cr-upload-button" type="button" onClick={() => uploadRef.current?.click()}><ImagePlus size={15} />更换参考照片</button>
          <input ref={uploadRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传参考照片" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
          {uploaded && <div className="cr-upload-note">当前照片不参与匹配；下方仍为原演示集。<button type="button" className="ui-text-button" onClick={() => { ++uploadVersion.current; setQueryImage(subjectPath); setUploaded(false); }}>恢复演示参考</button></div>}
        </section>
        <form className="cr-filter-section" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
          <div className="cr-section-heading"><h2>记录范围</h2><Tooltip title="重置所有筛选"><button className="ui-icon-button" type="button" aria-label="重置所有筛选" onClick={reset}><RotateCcw size={15} /></button></Tooltip></div>
          <label className="cr-field"><span>时间范围</span><select aria-label="时间范围" value={range} onChange={(event) => {
            setRange(event.target.value);
            if (event.target.value !== 'custom') setPendingFilters((current) => ({ ...current, ...contactDateWindow(Number(event.target.value)) }));
          }}><option value="30">样例近 30 天</option><option value="7">样例近 7 天</option><option value="custom">自定义日期</option></select></label>
          <label className="cr-field"><span>开始日期</span><input type="date" value={pendingFilters.from} onChange={(event) => { setRange('custom'); setPendingFilters((current) => ({ ...current, from: event.target.value })); }} /></label>
          <label className="cr-field"><span>结束日期</span><input type="date" value={pendingFilters.to} onChange={(event) => { setRange('custom'); setPendingFilters((current) => ({ ...current, to: event.target.value })); }} /></label>
          <label className="cr-field"><span>演示地点</span><select aria-label="演示地点" value={pendingFilters.location} onChange={(event) => setPendingFilters((current) => ({ ...current, location: event.target.value }))}><option value="">全部地点</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
          {formError && <p className="cr-form-error" role="alert">{formError}</p>}
          <button className="ui-button primary cr-search-submit" type="submit"><Search size={16} />筛选演示记录{hasPendingFilters && <i className="cr-change-dot" />}</button>
        </form>
        <section className="cr-companion-index"><div className="cr-section-heading"><h2>同行角色</h2><span className="cr-subtle">10 个虚构档案</span></div>
          <button className={`cr-companion-shortcut ${filters.companion === 'P-2048' ? 'active' : ''}`} type="button" aria-pressed={filters.companion === 'P-2048'} onClick={() => setFilters((current) => ({ ...current, companion: current.companion === 'P-2048' ? '' : 'P-2048' }))}>
            <span className="cr-role-avatar">叶</span><span><strong>叶承宇 <small>虚构</small></strong><small>P-2048</small></span><b>11<span> 条</span></b><ArrowUpRight size={14} />
          </button>
          <label className="cr-field"><span>角色筛选</span><select aria-label="角色筛选" value={filters.companion ?? ''} onChange={(event) => setFilters((current) => ({ ...current, companion: event.target.value }))}><option value="">全部角色</option>{companions.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</select></label>
          <p className="cr-subtle cr-source-note">角色关联为脚本预设</p>
        </section>
      </aside>
      <section className="contact-review-results" aria-label="演示记录">
        <div className="cr-summary-strip">
          <div><Camera size={16} /><span>全部样例</span><strong>20<small> 条</small></strong></div>
          <div><UsersRound size={16} /><span>同行角色</span><strong>10<small> 位</small></strong></div>
          <div><Bookmark size={16} /><span>已标记</span><strong>{marked.length}<small> 条</small></strong></div>
        </div>
        <div className="cr-results-heading"><h2>记录列表 <span>{filtered.length}</span></h2><span className="cr-subtle">{pendingCount} 条待复核</span></div>
        <div className="cr-status-tabs" role="group" aria-label="记录状态">{statuses.map((status) => <button type="button" key={status} className={filters.status === status ? 'active' : ''} aria-pressed={filters.status === status} onClick={() => setFilters((current) => ({ ...current, status }))}>{status === 'all' ? '全部记录' : status}<span>{status === 'all' ? records.length : records.filter((record) => record.status === status).length}</span></button>)}</div>
        <div className="cr-results-controls">
          <label className="ui-search"><Search size={15} /><input aria-label="搜索接触记录" placeholder="地点、机位、角色编号" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空关键词" onClick={() => setQuery('')}><X size={14} /></button>}</label>
          <select aria-label="结果排序" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as ContactFilters['sort'] }))}><option value="newest">时间倒序</option><option value="oldest">时间正序</option><option value="frequency">角色出现次数</option></select>
          <div className="cr-view-toggle" role="group" aria-label="结果视图">
            <Tooltip title="图片视图"><button type="button" aria-label="图片视图" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={16} /></button></Tooltip>
            <Tooltip title="时间线视图"><button type="button" aria-label="时间线视图" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}><List size={17} /></button></Tooltip>
          </div>
        </div>
        <div className="cr-range-caption"><CalendarDays size={13} /><span>{filters.from} 至 {filters.to} · UTC+8</span>{filters.companion && <button type="button" className="ui-text-button" onClick={() => setFilters((current) => ({ ...current, companion: '' }))}>{filters.companion}<X size={12} /></button>}</div>
        <div className={`cr-record-list ${view}`} role="list" aria-label="接触记录列表">
          {filtered.map((record) => <article role="listitem" className={`cr-record-card ${selected?.id === record.id ? 'selected' : ''}`} key={record.id}>
            <button type="button" className="cr-record-open" aria-label={`查看 ${record.id}`} aria-pressed={selected?.id === record.id} onClick={() => {
              setSelectedId(record.id);
              setExpanded(true);
            }}>
              <div className="cr-record-media"><RecordImage path={record.assetPath} label={`${record.id} 日常交谈合成演示`} thumbnail /><span className="cr-camera-chip"><Camera size={11} />{record.camera}</span><span className="cr-demo-chip">演示素材</span></div>
              <div className="cr-record-info"><div className="cr-record-time"><strong>{record.occurredAt}</strong>{selected?.id === record.id && <Check size={15} />}</div><span className="cr-record-place"><MapPin size={13} />{record.location}</span><div className="cr-record-bottom"><span>{record.companion.name}<small> · {record.companion.id}</small></span><StatusTag status={record.status} /></div></div>
            </button>
          </article>)}
        </div>
        {!filtered.length && <div className="cr-empty"><Search size={25} /><strong>没有符合条件的记录</strong><button className="ui-text-button" type="button" onClick={reset}>重置筛选</button></div>}
        <div className="cr-list-footer"><span>共 {filtered.length} 条 / 样例集 20 条</span><span>未接入实时检索服务</span></div>
      </section>
    </div>
    <Modal title={selected ? `${selected.id} · ${selected.location} · 合成演示` : '照片预览'} open={expanded && !!selected} onCancel={() => setExpanded(false)} footer={null} width={1100} destroyOnHidden>
      {selected && <div className="cr-expanded-image"><RecordImage path={selected.assetPath} label={`${selected.id} 合成照片大图`} /><p>{selected.occurredAt} · {selected.camera} · 演示素材，非真实证据</p></div>}
    </Modal>
    {feedback && <div className="cr-feedback" role="status">{feedback}<button type="button" aria-label="关闭提示" onClick={() => setFeedback('')}><X size={14} /></button></div>}
  </section>;
}
