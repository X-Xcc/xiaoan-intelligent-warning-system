import {
  ArrowLeft, Bookmark, CalendarDays, Camera, Check, Download,
  ImageOff, ImagePlus, LayoutGrid, List, Map as MapIcon, MapPin, RotateCcw,
  Search, ShieldCheck, X,
} from 'lucide-react';
import { Tooltip } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appBasePath } from '../lib/presentation';
import { ContactAppearanceMap } from '../components/ContactAppearanceMap';
import { ContactRecordModal } from '../components/ContactRecordModal';
import {
  CONTACT_DEMO_DATE, CONTACT_STORAGE_KEY, contactDateWindow, contactReviewCsv,
  contactBehaviors, contactReviewRecords, parseContactDraft, selectContactRecords,
  type ContactBehavior, type ContactFilters, type ContactReviewDraft, type ReviewStatus,
} from '../lib/contact-review';

const initialFilters: ContactFilters = { ...contactDateWindow(30), query: '', location: '', behaviors: [...contactBehaviors], companion: '', sort: 'newest', status: 'all' };
const statuses: Array<'all' | ReviewStatus> = ['all', '待复核', '已标记', '已排除'];
const locations = [...new Set(contactReviewRecords.map((record) => record.location))];
const companions = [...new Map(contactReviewRecords.map((record) => [record.companion.id, record.companion])).values()];

function sameBehaviors(left?: ContactBehavior[], right?: ContactBehavior[]) {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((behavior) => b.includes(behavior));
}

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
  const [queryImage, setQueryImage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [view, setView] = useState<'grid' | 'timeline'>('grid');
  const [workspace, setWorkspace] = useState<'records' | 'map'>('records');
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
  useEffect(() => () => { if (queryImage?.startsWith('blob:')) URL.revokeObjectURL(queryImage); }, [queryImage]);
  useEffect(() => () => { uploadVersion.current += 1; }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 4500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const records = useMemo(() => contactReviewRecords.map((record) => ({ ...record, status: draft[record.id]?.status ?? record.status })), [draft]);
  const filtered = useMemo(() => selectContactRecords(records, { ...filters, query }), [records, filters, query]);
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];
  const effectiveSelectedId = selected?.id ?? '';
  useEffect(() => {
    setSelectedId(effectiveSelectedId);
    if (!effectiveSelectedId) setExpanded(false);
  }, [effectiveSelectedId]);
  const marked = records.filter((record) => record.status === '已标记');
  const selectedIndex = selected ? filtered.findIndex((record) => record.id === selected.id) : -1;
  const chronological = useMemo(() => [...filtered].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)), [filtered]);
  const scopeRecords = useMemo(() => selectContactRecords(records, { ...filters, status: 'all', query }), [records, filters, query]);
  const hasPendingFilters = ['from', 'to', 'location'].some((key) => pendingFilters[key as keyof ContactFilters] !== filters[key as keyof ContactFilters])
    || !sameBehaviors(pendingFilters.behaviors, filters.behaviors);

  function selectRecord(id: string) {
    setSelectedId(id);
  }

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
      setFeedback('参考照片已更换，下方仍是固定演示集，不执行人脸检索。');
    } catch { URL.revokeObjectURL(url); setFeedback('图片无法读取，请换一张有效图片。'); }
  }

  function applyFilters() {
    if (!pendingFilters.from || !pendingFilters.to || pendingFilters.from > pendingFilters.to) {
      setFormError('请选择有效日期，开始日期不能晚于结束日期。'); return;
    }
    setFormError('');
    setFilters((current) => ({ ...current, from: pendingFilters.from, to: pendingFilters.to, location: pendingFilters.location, behaviors: pendingFilters.behaviors }));
  }

  function reset() {
    setFilters(initialFilters); setPendingFilters(initialFilters); setQuery(''); setRange('30'); setFormError('');
    if (queryImage?.startsWith('blob:')) URL.revokeObjectURL(queryImage);
    setQueryImage(null);
  }

  function exportRecords() {
    const url = URL.createObjectURL(new Blob([contactReviewCsv(marked, draft)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `contact-review-demo-${CONTACT_DEMO_DATE}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback(`已导出 ${marked.length} 条人工标记记录`);
  }

  return <section className="contact-review-page" aria-label="视频筛查工作台">
    <header className="contact-review-heading">
      <div><div className="ui-eyebrow">影像资料 / 人工复核</div><h1>视频筛查<span className="cr-heading-ref">REF-001</span></h1></div>
      <div className="cr-heading-actions">
        <Tooltip title="返回平台总览"><button className="ui-icon-button" type="button" aria-label="返回平台总览" onClick={onBack}><ArrowLeft size={18} /></button></Tooltip>
        <button className="ui-button" type="button" disabled={!marked.length} onClick={exportRecords}><Download size={16} />导出复核清单{marked.length > 0 && ` (${marked.length})`}</button>
      </div>
    </header>
    <div className="cr-source-caption"><ShieldCheck size={14} />AI 合成场景 · 时间、地点与人物关联为预设，非真实证据<span>样例截止 {CONTACT_DEMO_DATE}</span></div>
    <div className="cr-query-bar">
        <section className="cr-query-section">
          <div className="cr-query-object">{queryImage
            ? <img src={queryImage} alt="已上传的参考照片" />
            : <div className="cr-query-placeholder" role="img" aria-label="参考照片待上传"><ImageOff size={20} /><span>待上传</span></div>}
            <div><span>参考对象</span><strong>xxx</strong><button className="ui-text-button cr-upload-button" type="button" onClick={() => uploadRef.current?.click()}><ImagePlus size={14} />{queryImage ? '更换照片' : '上传照片'}</button></div></div>
          <input ref={uploadRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传参考照片" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
          {queryImage && <div className="cr-upload-note">当前照片不参与匹配；下方仍为原演示集。<button type="button" className="ui-text-button" onClick={() => { ++uploadVersion.current; if (queryImage.startsWith('blob:')) URL.revokeObjectURL(queryImage); setQueryImage(null); }}>清除照片</button></div>}
        </section>
        <form className="cr-filter-section" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
          <label className="cr-field cr-range-field"><span>时间范围</span><select aria-label="时间范围" value={range} onChange={(event) => {
            setRange(event.target.value);
            if (event.target.value !== 'custom') setPendingFilters((current) => ({ ...current, ...contactDateWindow(Number(event.target.value)) }));
          }}><option value="30">样例近 30 天</option><option value="7">样例近 7 天</option><option value="custom">自定义日期</option></select></label>
          <div className="cr-field cr-behavior-field"><span>行为类型</span><div className="cr-behavior-options" role="group" aria-label="行为类型筛选">
            <button type="button" aria-pressed={(pendingFilters.behaviors?.length ?? 0) === contactBehaviors.length} onClick={() => setPendingFilters((current) => ({ ...current, behaviors: [...contactBehaviors] }))}>全选</button>
            {contactBehaviors.map((behavior) => {
              const selectedBehavior = pendingFilters.behaviors?.includes(behavior) ?? false;
              return <button type="button" key={behavior} aria-pressed={selectedBehavior} onClick={() => setPendingFilters((current) => {
                const next = new Set(current.behaviors ?? contactBehaviors);
                if (next.has(behavior)) next.delete(behavior); else next.add(behavior);
                return { ...current, behaviors: contactBehaviors.filter((item) => next.has(item)) };
              })}>{behavior}</button>;
            })}
          </div></div>
          <label className="cr-field">
            <span>地点</span>
            <select aria-label="地点" value={pendingFilters.location} onChange={(event) => setPendingFilters((current) => ({ ...current, location: event.target.value }))}>
              <option value="">全部地点</option>
              {locations.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </label>
          <div className="cr-query-actions"><button className="ui-button primary cr-search-submit" type="submit"><Search size={16} />筛选记录{hasPendingFilters && <i className="cr-change-dot" />}</button>
          <Tooltip title="重置所有筛选"><button className="ui-icon-button" type="button" aria-label="重置所有筛选" onClick={reset}><RotateCcw size={16} /></button></Tooltip></div>
          {formError && <p className="cr-form-error" role="alert">{formError}</p>}
        </form>
    </div>
    <div className="cr-summary-strip" aria-label="当前结果统计">
      <div><Camera size={18} /><span>出现记录</span><strong>{filtered.length}<small> 条</small></strong></div>
      <div><MapPin size={18} /><span>出现点位</span><strong>{new Set(filtered.map(record => record.location)).size}<small> 处</small></strong></div>
      <div><Bookmark size={18} /><span>已标记记录</span><strong>{marked.length}<small> 条</small></strong></div>
    </div>
    <div className="contact-review-grid">
      <section className="contact-review-results" id="contact-results" aria-label="演示记录">
        <div className="cr-workspace-tabs" role="tablist" aria-label="记录工作区" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'records' : event.key === 'End' ? 'map' : workspace === 'records' ? 'map' : 'records';
          setWorkspace(next);
          document.getElementById(next === 'records' ? 'cr-records-tab' : 'cr-map-tab')?.focus();
        }}>
          <button type="button" role="tab" id="cr-records-tab" tabIndex={workspace === 'records' ? 0 : -1} aria-controls="cr-workspace-panel" aria-selected={workspace === 'records'} onClick={() => setWorkspace('records')}><LayoutGrid size={17} />抓拍记录<span>{filtered.length}</span></button>
          <button type="button" role="tab" id="cr-map-tab" tabIndex={workspace === 'map' ? 0 : -1} aria-controls="cr-workspace-panel" aria-selected={workspace === 'map'} onClick={() => setWorkspace('map')}><MapIcon size={17} />出现点位<span>{new Set(filtered.map(record => record.location)).size}</span></button>
        </div>
        <div className="cr-status-tabs" role="group" aria-label="记录状态">{statuses.map((status) => <button type="button" key={status} className={filters.status === status ? 'active' : ''} aria-pressed={filters.status === status} onClick={() => setFilters((current) => ({ ...current, status }))}>{status === 'all' ? '全部记录' : status}<span>{status === 'all' ? scopeRecords.length : scopeRecords.filter((record) => record.status === status).length}</span></button>)}</div>
        <div className="cr-results-controls">
          <label className="ui-search"><Search size={15} /><input aria-label="搜索接触记录" placeholder="地点、机位、角色编号" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空关键词" onClick={() => setQuery('')}><X size={14} /></button>}</label>
          <select aria-label="结果排序" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as ContactFilters['sort'] }))}><option value="newest">时间倒序</option><option value="oldest">时间正序</option><option value="frequency">角色出现次数</option></select>
          <select aria-label="角色筛选" value={filters.companion ?? ''} onChange={(event) => setFilters((current) => ({ ...current, companion: event.target.value }))}><option value="">全部角色</option>{companions.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</select>
          {workspace === 'records' && <div className="cr-view-toggle" role="group" aria-label="结果视图">
            <Tooltip title="图片视图"><button type="button" aria-label="图片视图" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={16} /></button></Tooltip>
            <Tooltip title="时间线视图"><button type="button" aria-label="时间线视图" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}><List size={17} /></button></Tooltip>
          </div>}
        </div>
        <div className="cr-range-caption"><CalendarDays size={13} /><span>{filters.from} 至 {filters.to} · UTC+8</span>{filters.companion && <button type="button" className="ui-text-button" onClick={() => setFilters((current) => ({ ...current, companion: '' }))}>{filters.companion}<X size={12} /></button>}</div>
        <div id="cr-workspace-panel" role="tabpanel" aria-labelledby={workspace === 'records' ? 'cr-records-tab' : 'cr-map-tab'}>
        {workspace === 'records' ? <div className={`cr-record-list ${view}`} role="list" aria-label="接触记录列表">
          {filtered.map((record) => <article role="listitem" className={`cr-record-card ${selected?.id === record.id ? 'selected' : ''}`} key={record.id}>
            <button type="button" className="cr-record-open" aria-label={`查看 ${record.id}`} aria-pressed={selected?.id === record.id} onClick={() => {
              setSelectedId(record.id);
              setExpanded(true);
            }}>
              <div className="cr-record-media"><RecordImage path={record.assetPath} label={`${record.id} AI 合成场景`} thumbnail /><span className="cr-camera-chip"><Camera size={11} />{record.camera}</span></div>
              <div className="cr-record-info"><div className="cr-record-time"><strong>{record.occurredAt}</strong>{selected?.id === record.id && <Check size={15} />}</div><span className="cr-record-place"><MapPin size={13} />{record.location}</span><div className="cr-record-bottom"><span>{record.companion.name}<small> · {record.companion.id}</small></span><StatusTag status={record.status} /></div></div>
            </button>
          </article>)}
        </div> : <div className="cr-map-workspace">
          <ContactAppearanceMap records={filtered} selectedId={selected?.id} onSelect={setSelectedId} />
          <div className="cr-section-heading cr-sequence-heading"><h2><CalendarDays size={15} />出现时间序列</h2><span className="cr-subtle">{chronological.length} 条 · 时间正序</span></div>
          <div className="cr-appearance-sequence">{chronological.map((record, index) => <button type="button" key={record.id} aria-label={`选择时间记录 ${record.id}`} aria-pressed={selected?.id === record.id} onClick={() => selectRecord(record.id)}>
            <span className="cr-sequence-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{record.occurredAt.slice(5)}</strong><small>{record.location}</small></span>
          </button>)}</div>
        </div>}
        {!filtered.length && <div className="cr-empty"><Search size={25} /><strong>没有符合条件的记录</strong><button className="ui-text-button" type="button" onClick={reset}>重置筛选</button></div>}
        </div>
        <div className="cr-list-footer"><span>共 {filtered.length} 条 / 样例集 {records.length} 条</span><span>离散出现记录 · 非连续轨迹</span></div>
      </section>
    </div>
    {selected && <ContactRecordModal record={selected} open={expanded} onClose={() => setExpanded(false)}
      index={selectedIndex} count={filtered.length}
      onPrevious={() => { if (selectedIndex > 0) setSelectedId(filtered[selectedIndex - 1].id); }}
      onNext={() => { if (selectedIndex >= 0 && selectedIndex < filtered.length - 1) setSelectedId(filtered[selectedIndex + 1].id); }} />}
    {feedback && <div className="cr-feedback" role="status">{feedback}<button type="button" aria-label="关闭提示" onClick={() => setFeedback('')}><X size={14} /></button></div>}
  </section>;
}
