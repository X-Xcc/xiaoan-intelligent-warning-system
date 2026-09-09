import { useState, useRef, useCallback, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Eye, Info,
  Settings, BarChart3, Filter, Undo2, Redo2, Square, X, Circle,
  MoreHorizontal, Minus, ZoomIn, ZoomOut, ArrowLeft, Trash2,
  FolderOpen,
} from "lucide-react";
import { useToast } from "../components/Toast";
import "../styles/annotation-editor.css";
import {
  ANNOTATION_LABELS,
  clampAnnotationZoom,
  cloneAnnotationRects,
  createAnnotationImageEntries,
  createDefaultAnnotationRect,
  deleteAnnotationRect,
  filterAnnotationImageFiles,
  getGroupedAnnotationRects,
  isValidAnnotationRectSize,
  moveAnnotationRect,
  resetAnnotationIds,
  stepAnnotationZoom,
  syncImageRects,
  updateAnnotationRect,
  type AnnotationHistoryEntry,
  type AnnotationImageEntry,
  type AnnotationRect,
} from "../services/annotation-data";
import { submitAnnotation } from "../services/annotation-service";

export default function AnnotationEditor() {
  const toast = useToast();

  const [images, setImages] = useState<AnnotationImageEntry[]>([]);
  const [curIdx, setCurIdx] = useState(0);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const curImage = images[curIdx] || null;

  const [rects, setRects] = useState<AnnotationRect[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawCur, setDrawCur] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState<{ id: string; ox: number; oy: number } | null>(null);

  const [history, setHistory] = useState<AnnotationHistoryEntry[]>([{ rects: [] }]);
  const [histIdx, setHistIdx] = useState(0);
  const pushHistory = useCallback((next: AnnotationRect[]) => {
    setHistory(prev => {
      const h = prev.slice(0, histIdx + 1);
      h.push({ rects: cloneAnnotationRects(next) });
      return h;
    });
    setHistIdx(prev => prev + 1);
  }, [histIdx]);

  const [zoom, setZoom] = useState(100);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selected = rects.find(r => r.id === selectedId) || null;

  const syncRectsToImage = useCallback((idx: number, nextRects: AnnotationRect[]) => {
    setImages(prev => syncImageRects(prev, idx, nextRects));
  }, []);

  const loadImage = useCallback((idx: number) => {
    if (idx < 0 || idx >= images.length) return;
    if (curIdx >= 0 && curIdx < images.length) {
      syncRectsToImage(curIdx, rects);
    }
    const entry = images[idx];
    setCurIdx(idx);
    setRects(entry.rects);
    setSelectedId(null);
    setHistory([{ rects: entry.rects }]);
    setHistIdx(0);
    const img = new Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = entry.url;
  }, [images, curIdx, rects, syncRectsToImage]);

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = filterAnnotationImageFiles(files);
    if (imageFiles.length === 0) {
      toast.show("未找到 JPG/PNG 图片", "error");
      return;
    }
    const entries = createAnnotationImageEntries(imageFiles);
    setImages(entries);
    setCurIdx(0);
    setRects([]);
    setSelectedId(null);
    resetAnnotationIds();
    setHistory([{ rects: [] }]);
    setHistIdx(0);
    const img = new Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = entries[0].url;
    toast.show(`已加载 ${entries.length} 张图片`);
  };

  const toCanvas = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgSize.w || !imgSize.h) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * imgSize.w,
      y: ((e.clientY - rect.top) / rect.height) * imgSize.h,
    };
  }, [imgSize]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!curImage) return;
    const p = toCanvas(e);

    for (let i = rects.length - 1; i >= 0; i--) {
      const rect = rects[i];
      if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
        setSelectedId(rect.id);
        setDragOffset({ id: rect.id, ox: p.x - rect.x, oy: p.y - rect.y });
        return;
      }
    }

    setSelectedId(null);
    setDrawing(true);
    setDrawStart(p);
    setDrawCur(p);
  }, [curImage, rects, toCanvas]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!curImage) return;
    const p = toCanvas(e);
    if (drawing) {
      setDrawCur(p);
    } else if (dragOffset) {
      setRects(prev => moveAnnotationRect(prev, dragOffset, p));
    }
  }, [curImage, drawing, dragOffset, toCanvas]);

  const onMouseUp = useCallback(() => {
    if (drawing) {
      const newRect = createDefaultAnnotationRect(drawStart, drawCur);
      if (isValidAnnotationRectSize(newRect)) {
        const next = [...rects, newRect];
        setRects(next);
        pushHistory(next);
        setSelectedId(newRect.id);
      }
      setDrawing(false);
    }
    if (dragOffset) {
      pushHistory(rects);
      setDragOffset(null);
    }
  }, [drawing, drawStart, drawCur, rects, dragOffset, pushHistory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !curImage) return;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      canvas.width = imgSize.w;
      canvas.height = imgSize.h;
      ctx.clearRect(0, 0, imgSize.w, imgSize.h);
      ctx.drawImage(img, 0, 0);

      for (const rect of rects) {
        const color = ANNOTATION_LABELS.find(label => label.name === rect.label)?.color || "#ef4444";
        ctx.strokeStyle = color;
        ctx.lineWidth = rect.id === selectedId ? 3 : 2;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = color;
        ctx.font = "14px sans-serif";
        const tw = ctx.measureText(rect.label).width;
        ctx.fillRect(rect.x, rect.y - 20, tw + 8, 20);
        ctx.fillStyle = "#fff";
        ctx.fillText(rect.label, rect.x + 4, rect.y - 5);
      }

      if (drawing) {
        const preview = createDefaultAnnotationRect(drawStart, drawCur);
        ctx.strokeStyle = "#00f2ff";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(preview.x, preview.y, preview.w, preview.h);
        ctx.setLineDash([]);
      }
    };
    img.src = curImage.url;
  }, [curImage, imgSize, rects, selectedId, drawing, drawStart, drawCur]);

  const undo = () => {
    if (histIdx <= 0) return;
    const prev = history[histIdx - 1];
    setRects(cloneAnnotationRects(prev.rects));
    setHistIdx(histIdx - 1);
    setSelectedId(null);
  };

  const redo = () => {
    if (histIdx >= history.length - 1) return;
    const next = history[histIdx + 1];
    setRects(cloneAnnotationRects(next.rects));
    setHistIdx(histIdx + 1);
    setSelectedId(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const next = deleteAnnotationRect(rects, selectedId);
    setRects(next);
    pushHistory(next);
    setSelectedId(null);
  };

  const updateSelected = (patch: Partial<AnnotationRect>) => {
    setRects(prev => updateAnnotationRect(prev, selectedId, patch));
  };

  const handleSubmit = () => {
    if (!curImage) return;
    syncRectsToImage(curIdx, rects);
    toast.show("标注已提交");

    submitAnnotation(curImage.name, imgSize.w, imgSize.h, rects).catch(() => {});

    if (curIdx < images.length - 1) {
      loadImage(curIdx + 1);
    } else {
      toast.show("全部标注完成");
    }
  };

  const goPrev = () => { if (curIdx > 0) loadImage(curIdx - 1); };
  const goNext = () => { if (curIdx < images.length - 1) loadImage(curIdx + 1); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const grouped = getGroupedAnnotationRects(rects);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden select-none"
      style={{ background: "#111111", color: "#d1d5db", fontFamily: "'JetBrains Mono', monospace" }}>

      <header className="h-12 flex items-center justify-between px-4 relative overflow-hidden"
        style={{ background: "#1a1a1a", borderBottom: "1px solid #2a2a2a" }}>
        <div className="absolute inset-0 anno-shimmer-bg pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <button onClick={() => window.history.back()}
            className="p-1 hover:bg-[#2a2a2a] rounded transition-colors" title="返回">
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-medium">{curImage?.name || "未选择文件"}</span>
        </div>
        <div className="flex items-center gap-2 relative z-10">
          <button onClick={goPrev} disabled={curIdx <= 0}
            className="p-1 hover:bg-[#2a2a2a] rounded transition-colors disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <div className="px-3 py-1 rounded text-xs" style={{ background: "#2a2a2a" }}>
            {images.length > 0 ? `${curIdx + 1} / ${images.length}` : "0"}
          </div>
          <button onClick={goNext} disabled={curIdx >= images.length - 1}
            className="p-1 hover:bg-[#2a2a2a] rounded transition-colors disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 relative z-10">
          <button onClick={handleSubmit} disabled={!curImage}
            className="px-4 py-1 rounded text-xs text-white transition-all active:scale-95 disabled:opacity-30"
            style={{ background: "#2563eb" }}>
            提交
          </button>
          <button className="px-4 py-1 rounded text-xs text-white transition-all active:scale-95"
            style={{ background: "#ea580c" }}>
            无效
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 flex flex-col anno-slide-left overflow-hidden"
          style={{ background: "#1a1a1a", borderRight: "1px solid #2a2a2a" }}>
          <div className="grid grid-cols-3 text-center" style={{ borderBottom: "1px solid #2a2a2a" }}>
            <button className="py-2 text-xs" style={{ borderBottom: "2px solid #3b82f6", color: "#60a5fa" }}>标签</button>
            <button className="py-2 text-xs text-gray-500">ID</button>
            <button className="py-2 text-xs text-gray-500">组合</button>
          </div>
          <div className="p-2 space-y-2">
            <div className="relative">
              <input className="w-full rounded text-xs py-1 px-8 outline-none" placeholder="搜索ID"
                style={{ background: "#2a2a2a", border: "none" }} />
              <svg className="w-4 h-4 absolute left-2 top-1.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex gap-1">
              <select className="flex-1 rounded text-xs py-1 outline-none" style={{ background: "#2a2a2a", border: "none" }}>
                <option>矩形</option>
              </select>
              <select className="flex-1 rounded text-xs py-1 outline-none" style={{ background: "#2a2a2a", border: "none" }}>
                <option>质检</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto anno-scroll">
            {grouped.map(group => (
              <div key={group.name}>
                <div className="px-2 py-1 text-xs flex items-center justify-between cursor-pointer hover:bg-[#2a2a2a] transition-colors"
                  style={group.items.length > 0 ? {
                    color: "#60a5fa", background: "rgba(59,130,246,0.06)",
                    borderLeft: "2px solid #3b82f6",
                  } : { borderLeft: "2px solid transparent" }}>
                  <div className="flex items-center">
                    <svg className="w-3 h-3 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
                    </svg>
                    <span>{group.name}({group.items.length})</span>
                  </div>
                  <Eye size={14} className="hover:text-blue-300 cursor-pointer" />
                </div>
                {group.items.map(item => (
                  <div key={item.id}
                    className="px-8 py-1 text-xs flex items-center justify-between cursor-pointer transition-colors"
                    style={item.id === selectedId ? { background: "rgba(59,130,246,0.1)" } : {}}
                    onClick={() => setSelectedId(item.id)}
                    onMouseEnter={e => (e.currentTarget.style.background = "#2a2a2a")}
                    onMouseLeave={e => (e.currentTarget.style.background = item.id === selectedId ? "rgba(59,130,246,0.1)" : "")}>
                    <div className="flex items-center">
                      <div className="w-3 h-3 mr-2" style={{ border: `1px solid ${group.color}` }} />
                      <span>{item.id.slice(-4)}</span>
                    </div>
                    <div className="flex gap-2 opacity-60">
                      <button onClick={e => { e.stopPropagation(); setSelectedId(item.id); deleteSelected(); }}
                        className="hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                      <Eye size={12} className="hover:text-blue-400" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <section className="flex-1 relative overflow-hidden"
          style={{ background: "#000" }}>
          {!curImage ? (
            <div className="w-full h-full flex items-center justify-center cursor-pointer"
              onClick={() => fileRef.current?.click()}>
              <div className="flex flex-col items-center gap-6">
                <div className="w-20 h-20 rounded-full flex items-center justify-center anno-float"
                  style={{ background: "#1a1a1a", color: "#3b82f6" }}>
                  <FolderOpen size={40} />
                </div>
                <div className="text-center">
                  <h2 className="text-lg font-medium mb-2" style={{ color: "#e5e7eb" }}>选择图片文件夹</h2>
                  <p className="text-sm text-gray-500 anno-flicker anno-flicker-d1">支持 JPG, PNG 格式</p>
                </div>
                <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                  className="px-8 py-2.5 rounded font-medium text-sm text-white transition-all anno-hover-glow active:scale-95"
                  style={{ background: "#3b82f6" }}>
                  选择文件夹
                </button>
                <div className="flex items-center gap-2 text-[10px] text-gray-600 uppercase tracking-widest">
                  <span className="anno-flicker anno-flicker-d1">MAX FILE SIZE: 500MB</span>
                  <span className="h-1 w-1 bg-gray-700 rounded-full" />
                  <span className="anno-flicker anno-flicker-d2">DS-2 SYSTEM SECURE</span>
                </div>
              </div>
            </div>
          ) : (
            <div ref={canvasWrapRef} className="w-full h-full overflow-auto anno-scroll flex items-center justify-center">
              <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center center" }}>
                <canvas ref={canvasRef}
                  className={drawing ? "anno-canvas-draw" : "anno-canvas-move"}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseUp}
                />
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" multiple
            /* @ts-expect-error webkitdirectory is non-standard */
            webkitdirectory=""
            accept=".jpg,.jpeg,.png" className="hidden" onChange={handleSelectFiles} />
        </section>

        <aside className="w-64 flex flex-col anno-slide-right overflow-hidden"
          style={{ background: "#1a1a1a", borderLeft: "1px solid #2a2a2a" }}>
          <div className="p-4" style={{ borderBottom: "1px solid #2a2a2a" }}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold">信息</span>
              <div className="flex gap-2">
                <Info size={14} className="text-gray-500 cursor-pointer hover:text-gray-300" />
                <svg className="w-4 h-4 text-gray-500 cursor-pointer hover:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 5h14V3H3v2zm0 4h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2z" />
                </svg>
              </div>
            </div>
            <div className="flex justify-between text-xs mb-4">
              <span className="anno-flicker anno-flicker-d1">{selected ? `${Math.round(selected.x)},${Math.round(selected.y)}` : "-"}</span>
              <span style={{ color: "#60a5fa" }}>图层:{rects.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <CoordBox label="X" value={selected ? Math.round(selected.x) : "-"} />
              <CoordBox label="Y" value={selected ? Math.round(selected.y) : "-"} />
              <CoordBox label="W" value={selected ? Math.round(selected.w) : "-"} />
              <CoordBox label="H" value={selected ? Math.round(selected.h) : "-"} />
            </div>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto anno-scroll">
            <h3 className="text-xs font-bold text-gray-400">标签属性</h3>
            <div>
              <label className="text-xs block mb-1">
                <span className="text-red-500">*</span> 标签
              </label>
              <select value={selected?.label || "打架"}
                onChange={e => updateSelected({ label: e.target.value })}
                disabled={!selected}
                className="w-full rounded text-xs py-2 px-3 outline-none"
                style={{ background: "#2a2a2a", border: "1px solid #3a3a3a" }}>
                {ANNOTATION_LABELS.map(label => <option key={label.name} value={label.name}>{label.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs block mb-2">
                <span className="text-red-500">*</span> 遮挡
              </label>
              <div className="flex items-center gap-4">
                <Radio label="部分遮挡" name="occlusion"
                  checked={selected?.occlusion === "partial"}
                  onChange={() => updateSelected({ occlusion: "partial" })} />
                <Radio label="完全可见" name="occlusion"
                  checked={selected?.occlusion === "visible"}
                  onChange={() => updateSelected({ occlusion: "visible" })} />
              </div>
            </div>
            <div>
              <label className="text-xs block mb-2">
                <span className="text-red-500">*</span> 截断
              </label>
              <div className="flex items-center gap-4">
                <Radio label="是" name="truncation"
                  checked={selected?.truncation === true}
                  onChange={() => updateSelected({ truncation: true })} />
                <Radio label="否" name="truncation"
                  checked={selected?.truncation === false}
                  onChange={() => updateSelected({ truncation: false })} />
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="h-10 flex items-center justify-between px-4"
        style={{ background: "#1a1a1a", borderTop: "1px solid #2a2a2a" }}>
        <div className="flex items-center gap-4">
          <div className="flex gap-3">
            <ToolBtn icon={<Settings size={14} />} tip="Settings" />
            <ToolBtn icon={<Eye size={14} />} tip="View" />
            <ToolBtn icon={<BarChart3 size={14} />} tip="Analytics" />
            <ToolBtn icon={<Info size={14} />} tip="Info" />
            <ToolBtn icon={<Filter size={14} />} tip="Filter" />
          </div>
          <div className="flex items-center gap-2 pl-4" style={{ borderLeft: "1px solid #2a2a2a" }}>
            <select className="rounded text-xs py-0.5 outline-none cursor-pointer"
              style={{ background: "#2a2a2a", border: "none" }}>
              <option>单个绘制</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 px-4 py-1 rounded-full"
          style={{ background: "rgba(42,42,42,0.5)", border: "1px solid #2a2a2a" }}>
          <div className="flex items-center gap-1 pr-4" style={{ borderRight: "1px solid #2a2a2a" }}>
            <button onClick={undo} className="p-1 hover:bg-[#3a3a3a] rounded transition-colors"
              title="撤销 (Ctrl+Z)">
              <Undo2 size={14} />
            </button>
            <button onClick={redo} className="p-1 hover:bg-[#3a3a3a] rounded transition-colors"
              title="重做 (Ctrl+Y)">
              <Redo2 size={14} />
            </button>
          </div>
          <div className="flex gap-3">
            <button className="p-1 rounded text-white transition-colors shadow-sm"
              style={{ background: "#2563eb" }} title="矩形">
              <Square size={14} />
            </button>
            <ToolBtn icon={<X size={14} />} tip="交叉" />
            <ToolBtn icon={<Circle size={14} />} tip="圆形" />
            <ToolBtn icon={<MoreHorizontal size={14} />} tip="多点" />
            <ToolBtn icon={<Minus size={14} />} tip="直线" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <ToolBtn icon={<Eye size={14} />} tip="View" />
            <button className="p-1 hover:bg-[#2a2a2a] rounded text-[10px] transition-colors"
              style={{ border: "1px solid #2a2a2a" }}>
              ? Help
            </button>
            <div className="flex items-center gap-1 cursor-pointer group">
              <span className="text-xs group-hover:text-blue-400 transition-colors anno-flicker">
                {zoom}%
              </span>
              <button onClick={() => setZoom(current => stepAnnotationZoom(current, -25))}
                className="p-1 hover:bg-[#2a2a2a] rounded transition-colors">
                <ZoomOut size={12} />
              </button>
              <button onClick={() => setZoom(current => stepAnnotationZoom(current, 25))}
                className="p-1 hover:bg-[#2a2a2a] rounded transition-colors">
                <ZoomIn size={12} />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CoordBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded p-2 flex items-center justify-between hover:bg-[#3a3a3a] transition-colors"
      style={{ background: "#2a2a2a" }}>
      <span className="text-gray-500 text-[10px] mr-1">{label}</span>
      <span className="anno-flicker anno-flicker-d2">{value}</span>
    </div>
  );
}

function Radio({ label, name, checked, onChange }: {
  label: string; name: string; checked: boolean; onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input type="radio" name={name} checked={checked} onChange={onChange}
        className="accent-blue-500" />
      <span className="text-xs group-hover:text-blue-400 transition-colors">{label}</span>
    </label>
  );
}

function ToolBtn({ icon, tip }: { icon: React.ReactNode; tip: string }) {
  return (
    <button className="p-1 hover:bg-[#2a2a2a] rounded transition-colors" title={tip}>
      {icon}
    </button>
  );
}
