import { useState, useEffect } from "react";
import { Download, FileVideo, ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { useToast } from "../components/Toast";
import { EvidenceItem } from "../services/dataService";
import Lightbox from "../components/Lightbox";
import { useImageRetry } from "../hooks/useImageRetry";
import { canGoNextEvidencePage, createEvidenceLightbox, downloadEvidenceSnapshot, EVIDENCE_PAGE_SIZE, EVIDENCE_TABS, getEvidenceNextPage, getEvidencePrevPage, getEvidenceTotalPages } from "../services/evidence-data";
import { exportEvidenceReport, loadEvidencePage, subscribeEvidenceRefresh } from "../services/evidence-service";

export default function Evidence() {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeTab, setActiveTab] = useState(0);
  const [evPage, setEvPage] = useState(0);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [evTotal, setEvTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [lightbox, setLightbox] = useState<{ src: string; item: EvidenceItem } | null>(null);
  const { onError: onImgError } = useImageRetry(3, 500);

  useEffect(() => subscribeEvidenceRefresh(() => setVersion(v => v + 1)), []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const res = await loadEvidencePage(selectedDate, activeTab, evPage, controller.signal);
        setEvidenceItems(res.items);
        setEvTotal(res.total);
      } catch {
        if (!controller.signal.aborted) {
          setEvidenceItems([]);
          setEvTotal(0);
          toast.show("证据加载失败");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [selectedDate, activeTab, evPage, version, toast]);

  useEffect(() => { setEvPage(0); }, [selectedDate, activeTab]);

  function openLightbox(item: EvidenceItem) {
    setLightbox(createEvidenceLightbox(item));
  }

  async function downloadImage(item: EvidenceItem) {
    try {
      await downloadEvidenceSnapshot(item);
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : "下载失败");
    }
  }

  return (
    <div className="space-y-4 flex flex-col h-full overflow-hidden animate-fade-in-up">
      <section className="flex justify-between items-end shrink-0">
          <button onClick={() => { exportEvidenceReport(selectedDate, activeTab); toast.show("已开始导出证据报告"); }} className="bg-primary text-white px-4 py-2 rounded-lg font-semibold text-body flex items-center gap-2 shadow-sm">
          <Download size={15} /> 导出报告
        </button>
      </section>

      <div className="shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="bg-white border border-outline-variant rounded-lg px-3 py-1.5 font-mono text-body outline-none" />
          <div className="flex bg-white border border-outline-variant rounded-lg overflow-hidden">
            {EVIDENCE_TABS.map((label, i) => (
              <button key={label} onClick={() => setActiveTab(i)}
                className={cn(
                  "px-3 py-1.5 text-body font-semibold transition-all",
                  activeTab === i ? "bg-primary text-white" : "text-outline hover:text-on-surface"
                )}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <span className="text-body-sm text-outline">共 {evTotal} 条证据</span>
      </div>

      <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-3 pr-1 custom-scrollbar">
        {loading ? (
          <div className="col-span-3 flex items-center justify-center py-16 text-outline">
            加载中...
          </div>
        ) : evidenceItems.length === 0 ? (
          <div className="col-span-3 flex flex-col items-center justify-center py-16 text-outline">
            <FileVideo size={40} className="mb-3 opacity-30" />
            <p className="text-body font-semibold">暂无匹配的证据数据</p>
            <p className="text-body-sm mt-1">尝试修改筛选条件或选择其他日期</p>
          </div>
        ) : evidenceItems.map(item => {
          const imgUrl = item.snapshotUrl || "";
          return (
            <div key={item.id} className="group relative bg-dark-bg aspect-video rounded-lg overflow-hidden border border-outline-variant shadow-sm h-fit cursor-pointer"
              onClick={() => openLightbox(item)}>
              {imgUrl ? (
                <img src={imgUrl} alt={item.actions?.[0] || "证据"} className="w-full h-full object-cover"
                  onError={onImgError} />
              ) : null}
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 absolute inset-0 -z-10">
                <ImageIcon size={28} className="text-white/10" />
              </div>
              <div className="absolute inset-0 video-hud flex flex-col justify-between p-2">
                <div className="flex justify-between items-start">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-caption font-semibold",
                    (item.actions || []).some(a => ["打架", "跌倒"].includes(a))
                      ? "bg-danger-red text-white" : "bg-warning-orange text-white"
                  )}>
                    {(item.actions || [])[0] || "异常"}
                  </span>
                  <button onClick={e => { e.stopPropagation(); downloadImage(item); }}
                    className="bg-black/50 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    <Download size={12} />
                  </button>
                </div>
                <div className="translate-y-1 group-hover:translate-y-0 transition-transform">
                  <div className="text-white text-body-sm font-semibold truncate">{item.cameraName}</div>
                  <div className="flex justify-between">
                    <span className="text-white/50 font-mono text-caption tabular-nums">
                      {new Date(item.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-white/30 text-caption font-mono">#{item.cameraId.slice(-3)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {evTotal > EVIDENCE_PAGE_SIZE && (
        <div className="shrink-0 flex justify-center gap-2">
          <button onClick={() => setEvPage(page => getEvidencePrevPage(page))} disabled={evPage === 0}
            className="px-3 py-1.5 bg-white border border-outline-variant rounded-lg text-body-sm font-semibold flex items-center gap-1 disabled:opacity-30">
            <ChevronLeft size={13} /> 上一页
          </button>
          <span className="px-3 py-1.5 text-body-sm text-outline font-medium">
            第 {evPage + 1} / {getEvidenceTotalPages(evTotal)} 页
          </span>
          <button onClick={() => setEvPage(page => getEvidenceNextPage(page))} disabled={!canGoNextEvidencePage(evPage, evTotal)}
            className="px-3 py-1.5 bg-white border border-outline-variant rounded-lg text-body-sm font-semibold flex items-center gap-1 disabled:opacity-30">
            下一页 <ChevronRight size={13} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {lightbox && (
          <Lightbox
            key={lightbox.item.id}
            src={lightbox.src}
            alt={lightbox.item.actions?.[0] || "证据截图"}
            cameraId={lightbox.item.cameraId}
            onClose={() => setLightbox(null)}
            onDownload={() => downloadImage(lightbox.item)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
