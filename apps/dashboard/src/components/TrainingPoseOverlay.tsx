import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';
import { drawPose, poseSummary } from '../lib/training-pose';

type Phase = 'idle' | 'loading' | 'waiting' | 'searching' | 'tracking' | 'paused' | 'error';
type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  sourceKey: string;
  playback: boolean;
  subject: string;
};
const labels: Record<Phase, string> = {
  idle: '等待视频', loading: '模型加载中', waiting: '等待视频帧',
  searching: '未检测到清晰人体', tracking: '追踪中', paused: '追踪已关闭', error: '追踪不可用',
};

export function TrainingPoseOverlay({ videoRef, active, sourceKey, playback, subject }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState(poseSummary([]));
  const currentPhase = !enabled ? 'paused' : !active ? 'idle' : phase;

  useEffect(() => {
    if (!active || !enabled) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    let disposed = false;
    let frame = 0;
    let model: PoseLandmarker | null = null;
    let points: NormalizedLandmark[] = [];
    let connections: typeof PoseLandmarker.POSE_CONNECTIONS = [];
    let lastVideoTime = -1;
    let lastInference = -Infinity;
    let timestamp = 0;
    let lastFreshFrame = 0;
    const paint = () => drawPose(canvas, points, video.videoWidth, video.videoHeight, connections, window.devicePixelRatio);
    const clear = () => { points = []; paint(); setMetrics(poseSummary([])); };
    const release = () => { model?.close(); model = null; };
    const fail = (message: string) => {
      if (disposed) return;
      window.cancelAnimationFrame(frame);
      clear();
      release();
      setError(message);
      setPhase('error');
    };
    const invalidate = () => {
      lastVideoTime = -1;
      clear();
      setPhase(model ? 'waiting' : 'loading');
    };
    const mediaEvents = ['loadstart', 'emptied', 'seeking', 'error'] as const;
    mediaEvents.forEach((event) => video.addEventListener(event, invalidate));
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null;
    observer?.observe(canvas);
    const tick = (now: number) => {
      if (disposed || !model) return;
      if (document.hidden || video.readyState < 2 || video.seeking || !video.videoWidth) {
        if (points.length) { clear(); setPhase('waiting'); lastVideoTime = -1; }
      } else if (video.currentTime !== lastVideoTime && now - lastInference >= 1000 / 15) {
        try {
          timestamp = Math.max(performance.now(), timestamp + 1);
          const result = model.detectForVideo(video, timestamp);
          points = result.landmarks[0] ?? [];
          lastVideoTime = video.currentTime;
          lastInference = now;
          lastFreshFrame = now;
          const summary = poseSummary(points);
          setMetrics(summary);
          setPhase(summary.visible ? 'tracking' : 'searching');
          paint();
        } catch {
          fail('推理中断，请重试骨骼追踪。');
          return;
        }
      } else if (!video.paused && !video.ended && points.length && now - lastFreshFrame > 1500) {
        clear();
        setPhase('waiting');
        lastVideoTime = -1;
      }
      frame = window.requestAnimationFrame(tick);
    };
    setPhase('loading');
    setError('');
    clear();
    const initialize = async () => {
      try {
        const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
        if (disposed) return;
        const base = '/';
        const files = await FilesetResolver.forVisionTasks(`${base}wasm`);
        if (disposed) return;
        const options = {
          runningMode: 'VIDEO' as const, numPoses: 1, outputSegmentationMasks: false,
          minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        };
        let created: PoseLandmarker;
        try {
          created = await PoseLandmarker.createFromOptions(files, {
            ...options, baseOptions: { modelAssetPath: `${base}models/pose_landmarker_lite.task`, delegate: 'GPU' },
          });
        } catch {
          if (disposed) return;
          created = await PoseLandmarker.createFromOptions(files, {
            ...options, baseOptions: { modelAssetPath: `${base}models/pose_landmarker_lite.task`, delegate: 'CPU' },
          });
        }
        if (disposed) { created.close(); return; }
        model = created;
        connections = PoseLandmarker.POSE_CONNECTIONS;
        setPhase('waiting');
        frame = window.requestAnimationFrame(tick);
      } catch {
        fail('本地模型加载失败，请重试或检查模型文件。');
      }
    };
    void initialize();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      mediaEvents.forEach((event) => video.removeEventListener(event, invalidate));
      release();
      points = [];
      paint();
    };
  }, [active, enabled, attempt, sourceKey, videoRef]);

  return <div className={`ot-skeleton-overlay ${playback ? 'has-playback' : ''}`} aria-label="骨骼追踪" data-pose-state={currentPhase}>
    <canvas ref={canvasRef} className="ot-skeleton-overlay-canvas" aria-label="实时骨骼关键点" />
    <div className="ot-skeleton-overlay-top">
      <span className="ot-skeleton-live"><i />骨骼追踪<span>{labels[currentPhase]}</span></span>
      <label className="ot-skeleton-switch" title={enabled ? '关闭骨骼追踪' : '开启骨骼追踪'}>
        <input type="checkbox" role="switch" aria-label="骨骼追踪" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <span />
      </label>
    </div>
    {currentPhase === 'tracking' && <div className="ot-skeleton-overlay-readout">
      <span>可见关键点 <b>{metrics.visible} / 33</b></span>
      <span>可见度 <b>{metrics.visibility}%</b></span>
    </div>}
    {currentPhase === 'error' && <div className="ot-skeleton-error" role="alert"><span>{error}</span>
      <button type="button" title="重试骨骼追踪" aria-label="重试骨骼追踪" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} /></button>
    </div>}
    <span className="ot-skeleton-subject">科目：{subject}</span>
  </div>;
}
