// 模型微调界面 — 上传训练素材 + 配置参数 + 实时监控训练进度
// 演讲提示: "前端通过SSE实时接收训练日志和指标，
//           用户可以看到loss下降、mAP上升的过程"
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play, Square, Upload, Loader2, BrainCircuit,
  TerminalSquare, Image as ImageIcon, FileVideo,
  Cpu, Gauge, Activity, Timer, BookOpen,
  CheckCircle2, X, Download, BarChart3,
} from "lucide-react";
import { cn } from "../lib/utils";
import { AnimatePresence, motion } from "motion/react";
import type { TrainingStatus, TrainingLog } from "../types";
import {
  appendPromptTag,
  buildTrainingMetrics,
  formatTrainingDuration,
  formatTrainingSize,
  getTrainingFileKind,
  getTrainingProgressPercent,
  MODEL_SCENE_TAGS,
  shouldOpenTrainingDoneDialog,
  TRAINING_LOG_POOL,
} from "../services/model-training-data";
import { uploadTrainingResource } from "../services/model-training-service";

function useMockTraining(totalEpochs: number) {
  const [status, setStatus] = useState<TrainingStatus["status"]>("idle");
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const epochRef = useRef(0);
  const logIdxRef = useRef(0);
  const startTimeRef = useRef(0);
  const gpuMemoryRef = useRef(3200 + Math.floor(Math.random() * 1600));

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    const final = epochRef.current >= totalEpochs ? "completed" : "idle";
    setStatus(final);
  }, [totalEpochs]);

  const start = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    epochRef.current = 0;
    logIdxRef.current = 0;
    startTimeRef.current = Date.now();
    setLogs([]);
    setStatus("running");

    intervalRef.current = setInterval(() => {
      epochRef.current += 1;
      const epoch = epochRef.current;
      gpuMemoryRef.current = 3200 + Math.floor(Math.random() * 1600);

      if (epoch >= totalEpochs) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        setStatus("completed");
      }

      if (Math.random() < 0.35 && logIdxRef.current < TRAINING_LOG_POOL.length) {
        const entry = TRAINING_LOG_POOL[logIdxRef.current];
        logIdxRef.current += 1;
        setLogs(prev => [...prev, {
          level: entry.level,
          message: entry.msg,
          timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        }]);
      }
    }, 100);
  }, [totalEpochs]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const trainingStatus = buildTrainingMetrics(
    totalEpochs,
    epochRef.current,
    status,
    startTimeRef.current,
    Date.now(),
    gpuMemoryRef.current,
  );

  return { status: trainingStatus, logs, start, stop };
}

function LogLevelTag({ level }: { level: TrainingLog["level"] }) {
  const colors: Record<string, string> = {
    INFO: "text-success-green",
    TRAIN: "text-primary",
    DATA: "text-white/40",
    WARN: "text-danger-red",
    SYNC: "text-info-cyan",
  };
  return <span className={cn("shrink-0 font-mono text-[10px] font-bold", colors[level])}>[{level}]</span>;
}

export default function ModelTraining() {
  const [totalEpochs, setTotalEpochs] = useState(50);
  const [prompt, setPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const { status, logs, start, stop } = useMockTraining(totalEpochs);

  const isTraining = status.status === "running";
  const isCompleted = status.status === "completed";
  const canStart = uploadDone && !isTraining;
  const progressPct = getTrainingProgressPercent(status.current_epoch, totalEpochs);

  const [showDoneDialog, setShowDoneDialog] = useState(false);
  const prevStatusRef = useRef<TrainingStatus["status"]>("idle");

  useEffect(() => {
    if (shouldOpenTrainingDoneDialog(prevStatusRef.current, status.status)) {
      setShowDoneDialog(true);
    }
    prevStatusRef.current = status.status;
  }, [status.status]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const uploadFile = async (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setUploadedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    setUploadProgress(0);
    setUploadDone(false);
    setUploadError(null);

    try {
      await uploadTrainingResource(file, (pct) => {
        setUploadProgress(pct);
      });
      setUploadDone(true);
    } catch (err: unknown) {
      setUploadDone(false);
      setUploadError(err instanceof Error ? err.message || "上传失败" : "上传失败");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = Array.from(e.dataTransfer.files)[0];
    if (file) uploadFile(file);
  }, [previewUrl]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
      e.target.value = "";
    }
  }, [previewUrl]);

  const appendTag = (tag: string) => {
    setPrompt(prev => appendPromptTag(prev, tag));
  };

  const { isImage, isVideo } = getTrainingFileKind(uploadedFile);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-8 animate-fade-in-up">

      <div className="flex flex-col lg:flex-row gap-5">
        <aside className="w-full lg:w-[340px] bg-white border border-outline-variant rounded-xl p-4 flex flex-col gap-4 shrink-0 shadow-sm">

          <div>
            <h2 className="text-heading font-bold flex items-center gap-2">
              <Upload size={18} className="text-primary" /> 资源上传
            </h2>
            <p className="text-caption text-outline mt-0.5">上传 1 个视频或图片素材</p>
          </div>
          <div
            className={cn(
              "min-h-[160px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 cursor-pointer transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-outline-variant hover:border-primary/50",
              uploading && "pointer-events-none opacity-60"
            )}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileSelect} />
            {uploading ? (
              <>
                <Loader2 size={24} className="animate-spin text-primary mb-2" />
                <span className="font-semibold text-body-sm">上传中...</span>
                <div className="w-3/4 h-1.5 bg-surface-container-high rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-caption text-outline mt-1">{uploadProgress}%</span>
              </>
            ) : uploadedFile && previewUrl ? (
              <>
                {isImage ? (
                  <img src={previewUrl} alt={uploadedFile.name} className="w-full max-h-[120px] object-contain rounded-lg mb-2" />
                ) : isVideo ? (
                  <video src={previewUrl} muted loop autoPlay className="w-full max-h-[120px] object-contain rounded-lg mb-2" />
                ) : (
                  <FileVideo size={24} className="text-primary/40 mb-2" />
                )}
                <span className="font-semibold text-body-sm text-on-surface truncate max-w-full">{uploadedFile.name}</span>
                <span className="text-caption text-outline">{formatTrainingSize(uploadedFile.size)}</span>
                {uploadDone && <span className="text-caption text-success-green font-semibold mt-1">上传完成</span>}
                {uploadError && <span className="text-caption text-danger-red font-semibold mt-1">{uploadError}</span>}
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center mb-2">
                  <Upload size={20} />
                </div>
                <span className="font-semibold text-body-sm">上传训练素材</span>
                <p className="text-caption text-outline mt-1">拖拽或<span className="text-primary font-semibold">点击选择</span></p>
              </>
            )}
          </div>

          <div>
            <h3 className="text-caption font-semibold text-outline mb-1.5 flex items-center gap-1.5">
              <BookOpen size={14} /> 场景描述 (Prompt Tuning)
            </h3>
            <textarea
              value={prompt}
              onChange={e => { if (e.target.value.length <= 2048) setPrompt(e.target.value); }}
              placeholder="请输入针对该视频场景的微调指令或行为描述词..."
              className="w-full h-20 bg-surface-container-low rounded-lg border border-outline-variant p-2.5 text-body-sm resize-none focus:outline-none focus:border-primary transition-colors placeholder:text-outline"
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {MODEL_SCENE_TAGS.map(tag => (
                <button key={tag} onClick={() => appendTag(tag)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container-high text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors border border-outline-variant">
                  {tag}
                </button>
              ))}
            </div>
            <div className="text-right text-[10px] text-outline mt-1 tabular-nums">{prompt.length}/2048</div>
          </div>

          <div>
            <h3 className="text-caption font-semibold text-outline mb-1.5 flex items-center gap-1.5">
              <Gauge size={14} /> 训练参数
            </h3>
            <div className="flex items-center gap-3">
              <label className="text-caption text-on-surface-variant shrink-0">Epochs</label>
              <input type="range" min={1} max={200} value={totalEpochs}
                onChange={e => setTotalEpochs(Number(e.target.value))}
                className="flex-1 accent-primary h-1" />
              <span className="bg-primary/10 text-primary font-mono text-caption font-bold px-2 py-0.5 rounded-full tabular-nums">{totalEpochs}</span>
            </div>
            <div className="bg-info-cyan/5 border border-info-cyan/20 rounded-lg px-3 py-2 mt-2 text-caption text-info-cyan">
              建议初始训练设为 40-60 epochs（当前 {totalEpochs}），观察收敛后再调整
            </div>
          </div>

          <button
            onClick={isTraining ? stop : start}
            disabled={!canStart && !isTraining}
            className={cn(
              "w-full py-2.5 rounded-xl font-semibold text-body shadow-sm transition-all flex items-center justify-center gap-2",
              isTraining
                ? "bg-danger-red text-white hover:bg-red-700 active:scale-95"
                : canStart
                  ? "bg-primary text-white hover:shadow-md active:scale-95"
                  : "bg-surface-container-high text-outline cursor-not-allowed"
            )}
          >
            {isTraining
              ? <><Square size={14} /> 停止训练</>
              : isCompleted
                ? <><Play size={16} /> 重新训练</>
                : <><Play size={16} /> 开始训练</>
            }
          </button>
        </aside>

        <div className="flex-1 flex flex-col gap-4 min-w-0">

          <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-caption font-semibold text-outline">训练进度</span>
              <span className="font-mono text-caption text-primary font-bold tabular-nums">{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div className={cn(
                "h-full rounded-full transition-all duration-100",
                isCompleted ? "bg-success-green" : isTraining ? "bg-primary animate-pulse" : "bg-primary"
              )} style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-caption text-outline">
              <span>{isTraining ? "训练中..." : isCompleted ? "训练完成" : "等待开始"}</span>
              <span className="tabular-nums">已用 {formatTrainingDuration(status.elapsed_seconds)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={13} className="text-primary" />
                <span className="text-[10px] font-semibold text-outline uppercase tracking-wide">Current Epoch</span>
              </div>
              <div className="font-mono text-body-sm font-bold tabular-nums">{status.current_epoch}/{status.total_epochs}</div>
            </div>

            <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Gauge size={13} className="text-info-cyan" />
                <span className="text-[10px] font-semibold text-outline uppercase tracking-wide">Learning Rate</span>
              </div>
              <div className="font-mono text-body-sm font-bold tabular-nums">{status.learning_rate.toFixed(6)}</div>
            </div>

            <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Cpu size={13} className="text-success-green" />
                <span className="text-[10px] font-semibold text-outline uppercase tracking-wide">mAP@.5</span>
              </div>
              <div className="font-mono text-body-sm font-bold tabular-nums">{status.map50.toFixed(4)}</div>
            </div>

            <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={13} className="text-warning-orange" />
                <span className="text-[10px] font-semibold text-outline uppercase tracking-wide">Loss</span>
              </div>
              <div className="font-mono text-body-sm font-bold tabular-nums">{status.loss.toFixed(4)}</div>
            </div>

            <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Timer size={13} className="text-detect-purple" />
                <span className="text-[10px] font-semibold text-outline uppercase tracking-wide">Remaining</span>
              </div>
              <div className="font-mono text-body-sm font-bold tabular-nums">{formatTrainingDuration(status.eta_seconds)}</div>
            </div>
          </div>

          <div className="bg-dark-bg rounded-xl border border-white/10 shadow-lg flex flex-col overflow-hidden" style={{ height: 300 }}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5 shrink-0">
              <h3 className="text-body font-semibold text-white flex items-center gap-2"><TerminalSquare size={14} /> 实时训练日志</h3>
              <div className="flex items-center gap-2 text-caption text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-success-green animate-pulse" /> LIVE
              </div>
            </div>
            <div className="p-3 flex-1 font-mono text-[11px] space-y-0.5 overflow-y-auto custom-scrollbar">
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-white/15 text-body-sm">
                  等待训练日志输出...
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-white/25 shrink-0">{log.timestamp}</span>
                    <LogLevelTag level={log.level} />
                    <span className="text-white/80 break-all">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-7 bg-white border border-outline-variant rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BrainCircuit size={18} className="text-primary" />
                <h3 className="text-body-lg font-bold">训练摘要</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-body-sm">
                <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/50">
                  <p className="text-caption font-semibold text-outline uppercase mb-1">输入模态</p>
                  <div className="flex items-center gap-2 font-semibold">
                    {isImage ? <ImageIcon size={15} className="text-primary" /> : isVideo ? <FileVideo size={15} className="text-primary" /> : <Upload size={15} className="text-primary" />}
                    {uploadedFile ? uploadedFile.type || "未知" : "未上传"}
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/50">
                  <p className="text-caption font-semibold text-outline uppercase mb-1">GPU 显存</p>
                  <div className="font-mono font-bold">{status.gpu_memory_mb} MB</div>
                </div>
                <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/50 col-span-2">
                  <p className="text-caption font-semibold text-outline uppercase mb-1">场景 Prompt</p>
                  <p className="text-body-sm text-on-surface whitespace-pre-wrap min-h-[38px]">{prompt || "—"}</p>
                </div>
              </div>
            </div>

            <div className="col-span-5 bg-white border border-outline-variant rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={18} className="text-primary" />
                <h3 className="text-body-lg font-bold">导出与落盘</h3>
              </div>
              <div className="space-y-2.5">
                <button disabled={!isCompleted} className={cn(
                  "w-full h-10 rounded-lg font-semibold text-body flex items-center justify-center gap-2 transition-colors",
                  isCompleted ? "bg-primary text-white hover:bg-primary/90" : "bg-surface-container-high text-outline cursor-not-allowed"
                )}>
                  <Download size={15} /> 导出训练权重
                </button>
                <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/50 text-body-sm">
                  <p className="text-caption font-semibold text-outline uppercase mb-1">输出目录</p>
                  <p className="font-mono text-on-surface">runs/train/exp_auto</p>
                </div>
                <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/50 text-body-sm">
                  <p className="text-caption font-semibold text-outline uppercase mb-1">最佳指标</p>
                  <p className="font-mono text-on-surface">mAP50 {status.map50.toFixed(4)} · Loss {status.loss.toFixed(4)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDoneDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center px-4"
            onClick={() => setShowDoneDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="w-full max-w-[420px] bg-white rounded-2xl shadow-2xl border border-outline-variant overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant bg-surface-container-low/60">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-success-green/10 flex items-center justify-center">
                    <CheckCircle2 size={20} className="text-success-green" />
                  </div>
                  <div>
                    <h3 className="text-body-lg font-bold text-on-surface">训练完成</h3>
                    <p className="text-caption text-outline">模型已成功收敛并保存</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDoneDialog(false)}
                  className="w-8 h-8 rounded-lg hover:bg-surface-container-high flex items-center justify-center text-outline"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
                    <p className="text-caption font-semibold text-outline uppercase mb-1">Best mAP50</p>
                    <p className="font-mono text-heading font-bold text-primary">{status.map50.toFixed(4)}</p>
                  </div>
                  <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
                    <p className="text-caption font-semibold text-outline uppercase mb-1">最终 Loss</p>
                    <p className="font-mono text-heading font-bold text-warning-orange">{status.loss.toFixed(4)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-body-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-outline">训练耗时</span>
                    <span className="font-mono font-semibold">{formatTrainingDuration(status.elapsed_seconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-outline">总 Epoch</span>
                    <span className="font-mono font-semibold">{status.total_epochs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-outline">模型目录</span>
                    <span className="font-mono font-semibold">exp_auto</span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-outline-variant bg-white flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowDoneDialog(false)}
                  className="h-10 px-4 rounded-lg border border-outline-variant text-on-surface font-semibold hover:bg-surface-container-low"
                >
                  稍后查看
                </button>
                <button
                  onClick={() => setShowDoneDialog(false)}
                  className="h-10 px-4 rounded-lg bg-primary text-white font-semibold hover:shadow-md flex items-center gap-2"
                >
                  <Download size={15} /> 下载权重
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
