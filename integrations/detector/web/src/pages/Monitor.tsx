import { useState, useEffect, useRef, useCallback } from "react";
import {
  VideoOff, Loader2,
  AlertTriangle, Volume2, CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAlarmSound } from "../hooks/useAlarmSound";
import { Camera, CameraStatus } from "../types";
import { createMonitorAlert, loadMonitorCameras, uploadMonitorCapture } from "../services/monitor-service";
import {
  ALARM_CONFIGS,
  GRID_COLS,
  GRID_ROWS,
  getMonitorRealtimeUrl,
  getMonitorSlotCameras,
  GridMode,
  normalizeActiveAlarms,
  MONITOR_REFRESH_INTERVAL_MS,
  AlarmType,
} from "../services/monitor-data";

/** 从摄像头槽位捕获当前帧，返回 base64 jpeg data URL；失败返回 null */
function captureFrame(slotId: string): string | null {
  try {
    const slot = document.getElementById(slotId);
    if (!slot) return null;

    const video = slot.querySelector("video") as HTMLVideoElement | null;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.85);
    }

    const img = slot.querySelector("img") as HTMLImageElement | null;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      try {
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL("image/jpeg", 0.85);
      } catch {
        return null;
      }
    }
  } catch {
    // ignore capture errors and fall back to empty snapshot
  }
  return null;
}

function AlarmCard({ alarmType, onAck }: { alarmType: AlarmType; onAck: (type: AlarmType, isFalseAlarm?: boolean) => void }) {
  const cfg = ALARM_CONFIGS[alarmType];
  const c = cfg.hex;
  return (
    <div className="bg-white rounded-xl shadow-2xl max-w-[320px] w-[85%] overflow-hidden animate-fade-in-up"
      style={{ border: `2px solid ${c}`, boxShadow: `0 0 20px ${c}80, 0 0 60px ${c}40` }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: c }}>
        <AlertTriangle size={18} className="text-white animate-pulse" />
        <div className="flex-1">
          <h3 className="text-white font-bold text-body-sm">{cfg.label}</h3>
          <p className="text-white/80 text-[10px]">检测到异常行为，请立即处理</p>
        </div>
        <Volume2 size={16} className="text-white animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        <div className="border rounded-lg p-3" style={{ backgroundColor: `${c}0d`, borderColor: `${c}33` }}>
          <p className="font-semibold text-caption" style={{ color: c }}>{cfg.msg}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onAck(alarmType, false)}
            className="flex-1 py-2 rounded-lg font-bold text-caption text-white transition-all active:scale-95 shadow-lg flex items-center justify-center gap-1.5 hover:opacity-90"
            style={{ backgroundColor: c, boxShadow: `0 4px 14px ${c}4d` }}>
            <CheckCircle2 size={15} /> 确认
          </button>
          <button onClick={() => onAck(alarmType, true)}
            className="flex-1 py-2 rounded-lg font-bold text-caption text-white/80 bg-white/20 hover:bg-white/30 transition-all active:scale-95 border border-white/30">
            误报
          </button>
        </div>
      </div>
    </div>
  );
}

function AlarmOverlay({ alarms, onAck }: { alarms: AlarmType[]; onAck: (type: AlarmType, isFalseAlarm?: boolean) => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center backdrop-blur-[2px]"
      style={{ animation: "alarm-flash-overlay 0.6s ease-in-out infinite" }}>
      <div className="flex flex-col items-center gap-2">
        {alarms.map(type => (
          <AlarmCard key={type} alarmType={type} onAck={(t, isFalse) => onAck(t, isFalse)} />
        ))}
      </div>
    </div>
  );
}

function AlarmRealtimePlayer({ streamId }: { streamId: string }) {
  const realtimeUrl = getMonitorRealtimeUrl(streamId);

  return (
    <iframe
      key={streamId}
      src={realtimeUrl}
      className="absolute inset-0 w-full h-full border-0 bg-black"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen
    />
  );
}

function AlarmFullscreenDialog({
  alarmType,
  cameras,
  onAck,
}: {
  alarmType: AlarmType;
  cameras: Camera[];
  onAck: (type: AlarmType, isFalseAlarm: boolean) => void;
}) {
  const cfg = ALARM_CONFIGS[alarmType];
  const c = cfg.hex;

  const alarmCamera = cameras[0];
  const alarmCameraGo2rtcId = alarmCamera?.go2rtcId || (alarmCamera ? `cam_${alarmCamera.id}` : undefined);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black animate-fade-in-up"
      onClick={e => e.stopPropagation()}
    >
      <div
        className="flex items-center justify-center gap-3 py-4 shrink-0"
        style={{ backgroundColor: c }}
      >
        <AlertTriangle size={22} className="text-white animate-pulse" />
        <h2 className="text-white font-bold text-xl tracking-wide">{cfg.label}</h2>
        <Volume2 size={20} className="text-white animate-pulse" />
      </div>

      <div className="flex-1 min-h-0 relative bg-zinc-900">
        {alarmCamera && alarmCameraGo2rtcId ? (
          <>
            <AlarmRealtimePlayer streamId={alarmCameraGo2rtcId} />
            <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse" />
              <span className="px-3 py-1 bg-black/70 backdrop-blur-sm rounded text-white text-sm font-mono font-semibold">
                报警画面 - {alarmCamera.name}
              </span>
            </div>
            <AlarmOverlay alarms={[alarmType]} onAck={(type, isFalse) => onAck(type, !!isFalse)} />
          </>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="relative z-10 text-center">
              <VideoOff size={64} className="mx-auto text-white/20 mb-4" />
              <p className="text-white/40 text-2xl font-semibold">无摄像头连接</p>
              <p className="text-white/20 text-body-sm mt-1">报警画面暂无视频源</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-8 py-6 shrink-0" style={{ backgroundColor: `${c}22` }}>
        <button
          onClick={() => onAck(alarmType, false)}
          className="px-10 py-3 rounded-xl font-bold text-lg text-white transition-all active:scale-95 shadow-xl hover:opacity-90"
          style={{ backgroundColor: c, boxShadow: `0 0 30px ${c}60` }}
        >
          确认
        </button>
        <button
          onClick={() => onAck(alarmType, true)}
          className="px-10 py-3 rounded-xl font-bold text-lg text-white/80 bg-white/20 backdrop-blur-sm transition-all active:scale-95 hover:bg-white/30 border border-white/30"
        >
          误报
        </button>
      </div>
    </div>
  );
}

export default function Monitor() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [gridMode, setGridMode] = useState<GridMode>(2);
  const [activeAlarms, setActiveAlarms] = useState<Set<AlarmType>>(new Set());
  const [alarmFullscreen, setAlarmFullscreen] = useState(false);
  const [gridDropdownOpen, setGridDropdownOpen] = useState(false);

  useAlarmSound(activeAlarms.size > 0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await loadMonitorCameras();
        if (!cancelled) {
          setCameras(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const iv = setInterval(load, MONITOR_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const slotCameras = getMonitorSlotCameras(cameras);
  const primaryAlarmCamera = slotCameras.find(camera => camera?.status === CameraStatus.ONLINE) ?? slotCameras.find(Boolean) ?? cameras[0] ?? null;

  const handleAlarmTrigger = useCallback(async (type: AlarmType) => {
    setActiveAlarms(prev => {
      const next = new Set(prev);
      next.add(type);
      return next;
    });
    setAlarmFullscreen(true);

    const alarmCam = slotCameras.find(camera => camera?.status === CameraStatus.ONLINE) ?? slotCameras.find(Boolean) ?? cameras[0];
    const captured = captureFrame("cam-slot-" + alarmCam?.id)
      || captureFrame("cam-slot-0")
      || captureFrame("cam-slot-empty")
      || "";

    try {
      await createMonitorAlert(type, cameras, captured);
    } catch (err) {
      console.warn("创建告警失败:", err);
    }

    try {
      await uploadMonitorCapture(type, cameras, captured);
    } catch (err) {
      console.warn("上传截图失败:", err);
    }
  }, [cameras, slotCameras]);

  const handleAlarmAcknowledge = useCallback((type: AlarmType, _isFalseAlarm: boolean = false) => {
    setActiveAlarms(prev => {
      const normalized = normalizeActiveAlarms(prev, type);
      setAlarmFullscreen(normalized.alarmFullscreen);
      return normalized.activeAlarms;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const map: Record<string, AlarmType> = { x: "fight", c: "fall", v: "suicide", d: "gathering" };
      const type = map[e.key.toLowerCase()];
      if (type) {
        e.preventDefault();
        if (window.confirm(`确认触发 ${ALARM_CONFIGS[type].label}？`)) {
          handleAlarmTrigger(type);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleAlarmTrigger]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 animate-fade-in-up">
      <header className="flex items-center justify-between shrink-0">
        <div className="relative">
          <button
            onClick={() => setGridDropdownOpen(!gridDropdownOpen)}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-outline-variant bg-white hover:bg-surface-container-high transition-all text-caption font-semibold"
          >
            <span>{gridMode}窗口</span>
            <ChevronDown size={16} className={cn("transition-transform", gridDropdownOpen && "rotate-180")} />
          </button>
          {gridDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg border border-outline-variant shadow-xl z-50 min-w-[120px] py-1">
              {([2, 4, 8, 16] as GridMode[]).map(n => (
                <button
                  key={n}
                  onClick={() => { setGridMode(n); setGridDropdownOpen(false); }}
                  className={cn(
                    "w-full px-4 py-2 text-left text-caption transition-colors",
                    gridMode === n
                      ? "bg-primary text-white font-semibold"
                      : "hover:bg-surface-container-high"
                  )}
                >
                  {n}窗口
                </button>
              ))}
            </div>
          )}
        </div>
        {gridDropdownOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setGridDropdownOpen(false)} />
        )}
      </header>

      <main className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center bg-zinc-900/80 rounded-lg border border-white/[0.04]">
            <div className="text-center">
              <Loader2 size={32} className="animate-spin mx-auto mb-2 text-primary" />
              <p className="text-white/40 text-body-sm">加载摄像头列表...</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0 gap-1.5">
            <div className={cn("grid gap-1.5 flex-1 min-h-0", GRID_COLS[gridMode], GRID_ROWS[gridMode])}>
              {Array.from({ length: gridMode }, (_, i) => {
                const cam = slotCameras[i] ?? null;
                if (!cam) return (
                  <EmptySlot key={`e-${i}`} index={i} isFirstEmpty={i === slotCameras.filter(Boolean).length}
                    activeAlarms={activeAlarms} onAck={handleAlarmAcknowledge} />
                );
                return (
                  <CameraSlot
                    key={cam.id}
                    name={cam.name}
                    streamUrl={cam.streamUrl}
                    isOnline={cam.status === "online"}
                    go2rtcId={cam.go2rtcId}
                    httpMjpegUrl={cam.httpMjpegUrl}
                    cameraId={cam.id}
                  />
                );
              })}
            </div>
          </div>
        )}
      </main>

      {alarmFullscreen && activeAlarms.size > 0 && primaryAlarmCamera && (
        <AlarmFullscreenDialog
          alarmType={[...activeAlarms][0]}
          cameras={[primaryAlarmCamera]}
          onAck={handleAlarmAcknowledge}
        />
      )}
    </div>
  );
}

function EmptySlot({ index, isFirstEmpty, activeAlarms, onAck }: {
  index: number; isFirstEmpty: boolean; activeAlarms: Set<AlarmType>; onAck: (type: AlarmType) => void;
}) {
  if (!isFirstEmpty) {
    return (
      <div className="bg-zinc-900/80 rounded-lg border border-white/[0.04] flex items-center justify-center">
        <div className="text-center">
          <VideoOff size={40} className="mx-auto text-white/20 mb-3" />
          <p className="text-white/40 text-lg font-semibold">无摄像头连接</p>
          <p className="text-white/20 text-body-sm mt-1">视频{index + 1}</p>
        </div>
      </div>
    );
  }

  return (
    <div id="cam-slot-empty" className="relative bg-zinc-900/80 rounded-lg border border-white/[0.04] overflow-hidden group hover:border-primary/40 hover:shadow-[0_0_20px_rgba(26,86,219,0.15)] transition-all duration-300">
      <img
        src="/video_feed?cam=0"
        className="absolute inset-0 w-full h-full object-contain"
        alt="Detection stream"
      />
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-success-green animate-pulse" />
        <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-white/80 text-caption font-mono font-semibold">
          检测流
        </span>
      </div>
      {activeAlarms.size > 0 && (
        <AlarmOverlay alarms={[...activeAlarms]} onAck={onAck} />
      )}
    </div>
  );
}

function CameraSlot({
  name, isOnline, go2rtcId, httpMjpegUrl, streamUrl, cameraId,
}: {
  name: string;
  streamUrl: string;
  isOnline: boolean;
  go2rtcId?: string;
  httpMjpegUrl?: string;
  cameraId: string;
}) {
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const go2rtcPermFailed = useRef(false);
  const [useFallback, setUseFallback] = useState(false);
  const hasGo2rtc = !!go2rtcId;
  const go2rtcStreamId = go2rtcId || "cam_" + cameraId;
  const go2rtcUrl = `http://${window.location.hostname}:1984/stream.html?src=${go2rtcStreamId}`;
  const fallbackStreamUrl = httpMjpegUrl || streamUrl || `/video_feed?cam=${cameraId}`;

  useEffect(() => {
    if (!hasGo2rtc) return;
    if (go2rtcPermFailed.current) {
      if (!useFallback) setUseFallback(true);
      return;
    }
    const timer = setTimeout(() => {
      go2rtcPermFailed.current = true;
      setUseFallback(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [cameraId, hasGo2rtc, useFallback]);

  useEffect(() => {
    if (!hasGo2rtc) {
      setUseFallback(true);
    }
  }, [hasGo2rtc]);

  const handleIframeLoad = () => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
  };

  const handleIframeError = () => {
    go2rtcPermFailed.current = true;
    setUseFallback(true);
  };

  return (
    <div id={`cam-slot-${cameraId}`} className="relative bg-zinc-900 rounded-lg overflow-hidden group border border-white/[0.04] hover:border-primary/40 hover:shadow-[0_0_20px_rgba(26,86,219,0.15)] transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.015) 10px, rgba(255,255,255,0.015) 20px)" }} />
      {hasGo2rtc && !useFallback ? (
        <iframe
          src={go2rtcUrl}
          className="absolute inset-0 w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      ) : (
        <img
          src={fallbackStreamUrl}
          className="absolute inset-0 w-full h-full object-contain"
          alt={`Camera ${cameraId}`}
        />
      )}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
        <span className={cn("w-2 h-2 rounded-full", isOnline ? "bg-success-green animate-pulse" : "bg-outline")} />
        <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-white/80 text-caption font-mono font-semibold">
          {name}
        </span>
      </div>
    </div>
  );
}
