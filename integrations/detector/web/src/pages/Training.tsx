// 算法版本对比页 — 四代算法同屏对比
// v1.0 基础版 → v2.1 轻量版 → v3.0 精度版 → v4.2 增强版
// 演讲提示: "同一个视频素材，四个版本同时检测，
//           直观看到每个版本的检测效果差异"
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, Zap, Eye, Crosshair,
  TerminalSquare, FileVideo, Image as ImageIcon,
  CheckCircle2, Loader2, Layers, AlertTriangle, Volume2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAlarmSound } from "../hooks/useAlarmSound";
import {
  buildTrainingCompleteLog,
  buildTrainingLoadedLog,
  buildTrainingUploadErrorLog,
  buildTrainingUploadSuccessLog,
  buildTrainingWarnLogs,
  createTrainingUploadItem,
  getRecognitionProgress,
  getTrainingProgressDetail,
  getTrainingProgressStatus,
  TRAINING_ALGO_VERSIONS,
  TRAINING_LOG_MESSAGES,
  toggleTrainingAlgoSelection,
  type TrainingAlgoVersion,
  type TrainingLogEntry,
  type TrainingUploadItem,
} from "../services/training-data";
import { uploadTrainingComparisonResource } from "../services/training-service";

function LogLevelTag({ level }: { level: TrainingLogEntry["level"] }) {
  const colors: Record<string, string> = {
    INFO: "text-success-green", ALGO: "text-warning-orange", WARN: "text-danger-red",
    SYNC: "text-info-cyan", DATA: "text-white/40", RECOG: "text-detect-purple",
  };
  return <span className={cn("shrink-0 font-mono text-[10px] font-bold", colors[level])}>[{level}]</span>;
}

function ComparisonWindow({
  version, upload, isAlarming, alarmMsg, onAlarmAcknowledge, large,
}: {
  version: TrainingAlgoVersion;
  upload?: TrainingUploadItem;
  isAlarming: boolean;
  alarmMsg: string;
  onAlarmAcknowledge: () => void;
  large?: boolean;
}) {
  useAlarmSound(isAlarming);

  return (
    <div className={cn(
      "bg-white rounded-xl overflow-hidden flex flex-col",
      isAlarming ? "shadow-lg shadow-danger-red/30 border-2 border-danger-red" : "shadow-sm border border-outline-variant"
    )}>
      <div className={cn(
        "px-4 py-2 flex justify-between items-center",
        isAlarming ? "bg-danger-red text-white" : "bg-surface-container-low border-b border-outline-variant"
      )}>
        <div className="flex items-center gap-2">
          {isAlarming ? <AlertTriangle size={16} className="animate-pulse" /> : <Eye size={16} className="text-primary" />}
          <span className="font-semibold text-body-sm">{version.label} ({version.sublabel})</span>
        </div>
        {isAlarming ? (
          <div className="flex items-center gap-1.5">
            <span className="animate-pulse inline-block w-1.5 h-1.5 rounded-full bg-white" />
            <span className="font-semibold text-[10px]">报警中</span>
            <Volume2 size={12} className="animate-pulse" />
          </div>
        ) : (
          <span className="bg-surface-container-highest px-2.5 py-0.5 rounded-full font-mono text-[10px] text-on-surface-variant">原始流</span>
        )}
      </div>
      <div className={cn("relative bg-dark-bg flex items-center justify-center overflow-hidden", large ? "aspect-[16/10]" : "aspect-video")}>
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900" />
        {upload ? (
          upload.previewUrl && upload.type === "image" ? (
            <img src={upload.previewUrl} alt={upload.name}
              className="relative z-10 w-full h-full object-contain" />
          ) : upload.previewUrl && upload.type === "video" ? (
            <video src={upload.previewUrl} autoPlay loop muted
              className="relative z-10 w-full h-full object-contain" />
          ) : (
            <div className="relative z-10 flex flex-col items-center gap-2 text-white/60">
              {upload.type === "video" ? <FileVideo size={40} className="text-primary/40" /> : <ImageIcon size={40} className="text-primary/40" />}
              <span className="font-mono text-[10px] font-bold">{upload.name}</span>
              <span className="text-[10px] text-white/30">{upload.size}</span>
            </div>
          )
        ) : (
          <div className="relative w-4/5 h-3/5 border border-success-green/30 rounded" />
        )}
        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-white font-mono text-[10px] border border-white/10">
          {upload ? upload.name : "等待素材上传..."}
        </div>

        {isAlarming && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
            <div className="bg-white rounded-xl shadow-2xl shadow-danger-red/50 border-2 border-danger-red max-w-[340px] w-[90%] overflow-hidden animate-fade-in-up">
              <div className="bg-danger-red px-4 py-2.5 flex items-center gap-2">
                <AlertTriangle size={18} className="text-white animate-pulse" />
                <div className="flex-1">
                  <h3 className="text-white font-bold text-body-sm">异常行为报警</h3>
                  <p className="text-white/80 text-[10px]">检测到异常行为，请立即处理</p>
                </div>
                <Volume2 size={16} className="text-white animate-pulse" />
              </div>
              <div className="p-4 space-y-3">
                <div className="bg-danger-red/5 border border-danger-red/20 rounded-lg p-3">
                  <p className="text-danger-red font-semibold text-caption">{alarmMsg}</p>
                </div>
                <button
                  onClick={onAlarmAcknowledge}
                  className="w-full py-2 rounded-lg font-bold text-caption bg-danger-red text-white hover:bg-red-700 active:scale-95 transition-all shadow-lg shadow-danger-red/30 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 size={15} /> 确认处理
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Training() {
  const [uploads, setUploads] = useState<TrainingUploadItem[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isAlarming, setIsAlarming] = useState(false);
  const [alarmMsg, setAlarmMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedAlgos, setSelectedAlgos] = useState<number[]>([0, 3]);
  const [logs, setLogs] = useState<TrainingLogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const singleUpload = uploads.length > 0 ? uploads[0] : undefined;

  const uploadFile = async (file: File) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const item = createTrainingUploadItem(file, id);
    setUploads([item]);
    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadTrainingComparisonResource(file, (pct) => {
        setUploadProgress(pct);
      });

      const previewUrl = URL.createObjectURL(file);

      setUploads([{
        ...item,
        status: "done",
        progress: 100,
        serverFilename: result.filename,
        previewUrl,
      }]);
      setLogs(prev => [...prev, buildTrainingUploadSuccessLog(file, new Date().toLocaleTimeString("zh-CN", { hour12: false }))]);
    } catch (err: unknown) {
      setUploads([{ ...item, status: "error", progress: 0 }]);
      setLogs(prev => [...prev, buildTrainingUploadErrorLog(err instanceof Error ? err.message : String(err), new Date().toLocaleTimeString("zh-CN", { hour12: false }))]);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = Array.from(e.dataTransfer.files)[0];
    if (file) uploadFile(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
      e.target.value = "";
    }
  }, []);

  const toggleAlgo = (idx: number) => {
    setSelectedAlgos(prev => toggleTrainingAlgoSelection(prev, idx));
  };

  const handleAlarmAcknowledge = () => {
    setIsAlarming(false);
    setAlarmMsg("");
  };

  const handleStartRecognition = () => {
    if (isRecognizing) return;
    setIsRecognizing(true);
    setLogs([]);
    setProgress(0);
    const startTime = Date.now();
    const totalDuration = 12000;

    const logMessages: Array<{ level: TrainingLogEntry["level"]; msg: string }> = [
      TRAINING_LOG_MESSAGES[0],
      TRAINING_LOG_MESSAGES[1],
      buildTrainingLoadedLog(singleUpload?.name || "未知文件", new Date().toLocaleTimeString("zh-CN", { hour12: false })),
      ...TRAINING_LOG_MESSAGES.slice(2),
    ].map(entry => 'timestamp' in entry ? { level: entry.level, msg: entry.message } : entry);

    let logIdx = 0;
    let warned = false;
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = getRecognitionProgress(elapsed, totalDuration);
      setProgress(pct);

      if (logIdx < logMessages.length) {
        const entry = logMessages[logIdx];
        const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
        setLogs(prev => [...prev, { level: entry.level, message: entry.msg, timestamp: ts }]);
        logIdx++;
      }

      if (pct >= 80 && !warned) {
        warned = true;
        const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
        setLogs(prev => [...prev, ...buildTrainingWarnLogs(ts)]);
      }

      if (pct >= 100) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsRecognizing(false);
        setLogs(prev => [...prev, buildTrainingCompleteLog(new Date().toLocaleTimeString("zh-CN", { hour12: false }))]);
        setAlarmMsg("区域 A 打架告警 — 检测到连续拳击动作，双方肢体冲突特征明显");
        setIsAlarming(true);
      }
    }, 200);
  };

  const canStart = !!singleUpload && singleUpload.status === "done" && !uploading;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-8 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-caption font-mono text-on-surface-variant bg-surface-container-high px-3 py-1.5 rounded-lg">
          <span>RTX 5060 · CUDA 12.8</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        <aside className="w-full lg:w-[340px] bg-white border border-outline-variant rounded-xl p-4 flex flex-col gap-4 shrink-0 shadow-sm">
          <div>
            <h2 className="text-heading font-bold flex items-center gap-2">
              <Upload size={18} className="text-primary" /> 资源上传
            </h2>
            <p className="text-caption text-outline mt-0.5">上传 1 个视频或图片素材进行识别比对</p>
          </div>
          <div
            className={cn(
              "flex-1 min-h-[160px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 cursor-pointer transition-colors",
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
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center mb-2">
                  <Upload size={20} />
                </div>
                <span className="font-semibold text-body-sm">上传训练素材</span>
                <p className="text-caption text-outline mt-1">拖拽或<span className="text-primary font-semibold">点击选择</span></p>
                {singleUpload && (
                  <p className="text-caption mt-1.5 font-semibold text-success-green">{singleUpload.name}</p>
                )}
              </>
            )}
          </div>

          <div>
            <h3 className="text-caption font-semibold text-outline mb-1.5 flex items-center gap-1.5">
              <Layers size={14} /> 算法版本比对
            </h3>
            <div className="space-y-1">
              {TRAINING_ALGO_VERSIONS.map((algo, idx) => (
                <button key={idx} onClick={() => toggleAlgo(idx)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-all text-caption",
                    selectedAlgos.includes(idx)
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high border border-transparent"
                  )}>
                  <div className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                    selectedAlgos.includes(idx) ? "bg-primary border-primary" : "border-outline-variant"
                  )}>
                    {selectedAlgos.includes(idx) && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{algo.label}</div>
                    <div className="text-[10px] opacity-60">{algo.sublabel}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleStartRecognition} disabled={isRecognizing || !canStart}
            className={cn(
              "w-full py-2.5 rounded-xl font-semibold text-body shadow-sm transition-all flex items-center justify-center gap-2",
              isRecognizing || !canStart
                ? "bg-surface-container-high text-outline cursor-not-allowed"
                : "bg-primary text-white hover:shadow-md active:scale-95"
            )}>
            {isRecognizing ? <><Loader2 size={16} className="animate-spin" /> 识别中...</> : <><Zap size={16} /> 开始识别</>}
          </button>
        </aside>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {selectedAlgos.length > 0 ? selectedAlgos.map(idx => (
              <ComparisonWindow key={idx} version={TRAINING_ALGO_VERSIONS[idx]} upload={singleUpload}
                isAlarming={isAlarming && idx === 3}
                alarmMsg={alarmMsg} onAlarmAcknowledge={handleAlarmAcknowledge}
                large={idx === 0 || idx === 3} />
            )) : (
              <div className="xl:col-span-2 bg-white rounded-xl border border-outline-variant shadow-sm p-8 flex flex-col items-center justify-center aspect-video text-outline">
                <Crosshair size={40} className="mb-3 opacity-20" />
                <span className="font-semibold text-body-sm">请在左侧选择至少一个算法版本</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-caption font-semibold text-outline">识别进度</span>
              <span className="font-mono text-caption text-primary font-bold tabular-nums">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-300 ease-linear", isAlarming ? "bg-danger-red animate-pulse" : "bg-primary")}
                style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-caption text-outline">
              <span>{getTrainingProgressStatus(progress, isRecognizing)}</span>
              <span className="tabular-nums">{getTrainingProgressDetail(progress)}</span>
            </div>
          </div>

          <div className="bg-dark-bg rounded-xl border border-white/10 shadow-lg flex flex-col overflow-hidden" style={{ height: 300 }}>
            <div className="bg-black/40 px-3 py-2 border-b border-white/10 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <TerminalSquare size={12} className="text-success-green" />
                <span className="text-white font-semibold text-caption">实时识别日志</span>
              </div>
              <div className="flex items-center gap-1">
                {isRecognizing && <span className="w-1.5 h-1.5 rounded-full bg-danger-red animate-pulse" />}
                <span className={cn("font-bold text-[10px] tracking-wider", isRecognizing ? "text-danger-red" : "text-white/30")}>
                  {isRecognizing ? "LIVE" : "IDLE"}
                </span>
              </div>
            </div>
            <div className="p-3 flex-1 font-mono text-[11px] space-y-0.5 overflow-y-auto custom-scrollbar">
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-white/15 text-body-sm">
                  点击"开始识别"后，日志将在此实时滚动
                </div>
              ) : logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <LogLevelTag level={log.level} />
                  <span className="text-white/30 shrink-0 tabular-nums">{log.timestamp}</span>
                  <span className={cn("text-white/60", log.level === "WARN" && "text-danger-red font-bold")}>{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
