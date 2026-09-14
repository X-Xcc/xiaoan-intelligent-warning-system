import { Activity, ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  advanceGaitPhase, computeGaitPose, gaitAngleHistory, gaitCanvasSize, gaitGeiFrames,
  type GaitAngles, type GaitPoint, type GaitPose,
} from '../lib/gait-analysis';
import '../styles/gait-analysis.css';

type Props = { recordId: string; onNext?: () => void };
type History = Record<'hipL' | 'hipR' | 'kneeL' | 'kneeR', number[]>;

const angleLines: Array<[keyof History, string, string]> = [
  ['hipL', '左髋', '#ffb74d'],
  ['hipR', '右髋', '#4dd0e1'],
  ['kneeL', '左膝', '#81c784'],
  ['kneeR', '右膝', '#ce93d8'],
];
const jointLabels: Array<[string, string, string]> = [
  ['head', '头', '#fff'],
  ['shoulderL', '左肩', '#81c784'],
  ['shoulderR', '右肩', '#ce93d8'],
  ['elbowL', '左肘', '#81c784'],
  ['elbowR', '右肘', '#ce93d8'],
  ['wristL', '左腕', '#81c784'],
  ['wristR', '右腕', '#ce93d8'],
  ['hipL', '左髋', '#ffb74d'],
  ['hipR', '右髋', '#4dd0e1'],
  ['kneeL', '左膝', '#ffb74d'],
  ['kneeR', '右膝', '#4dd0e1'],
  ['ankleL', '左踝', '#ffb74d'],
  ['ankleR', '右踝', '#4dd0e1'],
];

function drawLimb(context: CanvasRenderingContext2D, first: GaitPoint, second: GaitPoint, width: number) {
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(first.x, first.y);
  context.lineTo(second.x, second.y);
  context.stroke();
}

function drawSkeleton(context: CanvasRenderingContext2D, pose: GaitPose, phase: number) {
  const { width: canvasWidth, height: canvasHeight } = gaitCanvasSize.main;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = '#080d17';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.strokeStyle = '#131d2e';
  context.lineWidth = 0.5;
  for (let x = 0; x < canvasWidth; x += 40) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvasHeight); context.stroke();
  }
  for (let y = 0; y < canvasHeight; y += 40) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(canvasWidth, y); context.stroke();
  }

  const j = pose.joints;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#4a7cf7';
  context.beginPath(); context.moveTo(j.shoulder.x, j.shoulder.y); context.lineTo(j.hipL.x, j.hipL.y);
  context.lineTo(j.hipR.x, j.hipR.y); context.lineTo(j.shoulder.x, j.shoulder.y); context.stroke();
  context.fillStyle = '#4a7cf7';
  context.beginPath(); context.arc(j.head.x, j.head.y, 10.8, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#ffb74d'; drawLimb(context, j.hipL, j.kneeL, 7); drawLimb(context, j.kneeL, j.ankleL, 6);
  context.strokeStyle = '#4dd0e1'; drawLimb(context, j.hipR, j.kneeR, 7); drawLimb(context, j.kneeR, j.ankleR, 6);
  context.strokeStyle = '#81c784'; drawLimb(context, j.shoulderL, j.elbowL, 5); drawLimb(context, j.elbowL, j.wristL, 4);
  context.strokeStyle = '#ce93d8'; drawLimb(context, j.shoulderR, j.elbowR, 5); drawLimb(context, j.elbowR, j.wristR, 4);
  context.strokeStyle = '#4a7cf7'; drawLimb(context, j.shoulderL, j.shoulderR, 4);

  context.font = '11px "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  for (const [key, label, color] of jointLabels) {
    const point = j[key];
    context.shadowColor = 'rgba(74,124,247,.5)';
    context.shadowBlur = 12;
    context.fillStyle = color;
    context.beginPath(); context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill();
    context.shadowBlur = 0;
    context.fillStyle = '#b0c6e5';
    context.fillText(label, point.x, point.y - 9);
  }

  const percent = ((phase / (Math.PI * 2)) * 100) % 100;
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  context.fillStyle = '#4a5f7a';
  context.font = '12px monospace';
  context.fillText(`相位 ${percent.toFixed(1)}%`, canvasWidth - 20, canvasHeight - 14);
  context.textAlign = 'left';
  context.textBaseline = 'top';
  const angleEntries: Array<[keyof GaitAngles, string, string]> = [
    ['hipL', '左髋', '#ffb74d'], ['hipR', '右髋', '#4dd0e1'],
    ['kneeL', '左膝', '#81c784'], ['kneeR', '右膝', '#ce93d8'],
  ];
  angleEntries.forEach(([key, label, color], index) => {
    context.fillStyle = color;
    context.fillText(`${label} ${(pose.angles[key] * 180 / Math.PI).toFixed(1)}°`, 14, 14 + index * 16);
  });
}

function drawAngleCurve(context: CanvasRenderingContext2D, history: History) {
  const { width, height } = gaitCanvasSize.angle;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#080d17';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#141e2e';
  context.lineWidth = 0.5;
  for (let index = 0; index < 6; index += 1) {
    const y = (index / 5) * height;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  for (const [key, , color] of angleLines) {
    const values = history[key];
    if (values.length < 2) continue;
    context.strokeStyle = color;
    context.lineWidth = 2.5;
    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (gaitAngleHistory - 1)) * width;
      const y = height / 2 - (value / 0.7) * (height / 2.2);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
  }
  context.strokeStyle = '#2a3648';
  context.setLineDash([4, 6]);
  context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
  context.setLineDash([]);
}

function drawSilhouette(context: CanvasRenderingContext2D, pose: GaitPose, scaleX: number, scaleY: number) {
  const point = (key: string) => ({ x: pose.joints[key].x * scaleX, y: pose.joints[key].y * scaleY });
  const j = {
    head: point('head'), shoulder: point('shoulder'), shoulderL: point('shoulderL'), shoulderR: point('shoulderR'),
    elbowL: point('elbowL'), elbowR: point('elbowR'), wristL: point('wristL'), wristR: point('wristR'),
    hipL: point('hipL'), hipR: point('hipR'), kneeL: point('kneeL'), kneeR: point('kneeR'),
    ankleL: point('ankleL'), ankleR: point('ankleR'),
  };
  const limb = (first: GaitPoint, second: GaitPoint, width: number) => {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    context.save();
    context.translate((first.x + second.x) / 2, (first.y + second.y) / 2);
    context.rotate(angle);
    context.beginPath(); context.ellipse(0, 0, length / 2, width / 2, 0, 0, Math.PI * 2); context.fill();
    context.restore();
  };
  context.fillStyle = '#fff';
  const torsoCenter = { x: (j.shoulder.x + (j.hipL.x + j.hipR.x) / 2) / 2, y: (j.shoulder.y + (j.hipL.y + j.hipR.y) / 2) / 2 };
  context.beginPath(); context.ellipse(torsoCenter.x, torsoCenter.y, Math.abs(j.shoulderL.x - j.shoulderR.x) * 0.35 + 8, Math.abs(j.shoulder.y - (j.hipL.y + j.hipR.y) / 2) * 0.45 + 6, 0, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(j.head.x, j.head.y, 12, 0, Math.PI * 2); context.fill();
  limb(j.hipL, j.kneeL, 10 * scaleX + 2); limb(j.kneeL, j.ankleL, 8 * scaleX + 2);
  limb(j.hipR, j.kneeR, 10 * scaleX + 2); limb(j.kneeR, j.ankleR, 8 * scaleX + 2);
  limb(j.shoulderL, j.elbowL, 7 * scaleX + 2); limb(j.elbowL, j.wristL, 5 * scaleX + 2);
  limb(j.shoulderR, j.elbowR, 7 * scaleX + 2); limb(j.elbowR, j.wristR, 5 * scaleX + 2);
}

function updateGei(
  context: CanvasRenderingContext2D,
  offscreen: HTMLCanvasElement,
  pose: GaitPose,
  accumulator: Float32Array,
  count: number,
) {
  const { width, height } = gaitCanvasSize.gei;
  const offscreenContext = offscreen.getContext('2d');
  if (!offscreenContext) return false;
  offscreenContext.clearRect(0, 0, width, height);
  drawSilhouette(offscreenContext, pose, width / gaitCanvasSize.main.width, height / gaitCanvasSize.main.height);
  const data = offscreenContext.getImageData(0, 0, width, height).data;
  for (let index = 0; index < width * height; index += 1) accumulator[index] += data[index * 4] > 128 ? 1 : 0;
  if (count < gaitGeiFrames) return false;
  const output = context.createImageData(width, height);
  let maxValue = 1;
  for (const value of accumulator) maxValue = Math.max(maxValue, value);
  for (let index = 0; index < width * height; index += 1) {
    const value = accumulator[index] / maxValue;
    const offset = index * 4;
    output.data[offset] = Math.round(Math.min(1, value) * 255);
    output.data[offset + 1] = Math.round(Math.min(1, value * 1.15) * 190);
    output.data[offset + 2] = Math.round(Math.max(0, 1 - value) * 210);
    output.data[offset + 3] = 255;
  }
  context.putImageData(output, 0, 0);
  return true;
}

export function GaitAnalysisPanel({ recordId, onNext }: Props) {
  const mainRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef<HTMLCanvasElement>(null);
  const geiRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(true);
  const speedRef = useRef(1);
  const resetRef = useRef(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [phasePercent, setPhasePercent] = useState(0);
  const [geiCount, setGeiCount] = useState(0);
  const [fps, setFps] = useState(60);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    const main = mainRef.current;
    const angle = angleRef.current;
    const gei = geiRef.current;
    const mainContext = main?.getContext('2d');
    const angleContext = angle?.getContext('2d');
    const geiContext = gei?.getContext('2d');
    if (!main || !angle || !gei || !mainContext || !angleContext || !geiContext) return undefined;

    const offscreen = document.createElement('canvas');
    offscreen.width = gaitCanvasSize.gei.width;
    offscreen.height = gaitCanvasSize.gei.height;
    const accumulator = new Float32Array(gaitCanvasSize.gei.width * gaitCanvasSize.gei.height);
    const history: History = { hipL: [], hipR: [], kneeL: [], kneeR: [] };
    let phase = 0;
    let last = performance.now();
    let frameCounter = 0;
    let fpsClock = last;
    let frameHandle = 0;
    let currentGeiCount = 0;

    const render = (timestamp: number) => {
      const delta = Math.min(timestamp - last, 80);
      last = timestamp;
      if (resetRef.current) {
        resetRef.current = false;
        phase = 0;
        currentGeiCount = 0;
        accumulator.fill(0);
        Object.values(history).forEach(values => { values.length = 0; });
        geiContext.clearRect(0, 0, gaitCanvasSize.gei.width, gaitCanvasSize.gei.height);
        setGeiCount(0);
      }
      if (playingRef.current) phase = advanceGaitPhase(phase, delta, speedRef.current);
      const pose = computeGaitPose(phase);
      drawSkeleton(mainContext, pose, phase);
      history.hipL.push(pose.angles.hipL); history.hipR.push(pose.angles.hipR);
      history.kneeL.push(pose.angles.kneeL); history.kneeR.push(pose.angles.kneeR);
      Object.values(history).forEach(values => { if (values.length > gaitAngleHistory) values.shift(); });
      drawAngleCurve(angleContext, history);
      if (playingRef.current) {
        currentGeiCount = Math.min(gaitGeiFrames, currentGeiCount + 1);
        updateGei(geiContext, offscreen, pose, accumulator, currentGeiCount);
        if (currentGeiCount === gaitGeiFrames) {
          accumulator.fill(0);
          currentGeiCount = 0;
        }
        setGeiCount(currentGeiCount);
      }
      frameCounter += 1;
      if (timestamp - fpsClock >= 500) {
        setFps(Math.round(frameCounter * 1000 / (timestamp - fpsClock)));
        frameCounter = 0;
        fpsClock = timestamp;
      }
      setPhasePercent(Math.round((phase / (Math.PI * 2)) * 1000) / 10);
      frameHandle = requestAnimationFrame(render);
    };
    frameHandle = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameHandle);
  }, [recordId]);

  return <section className="gait-analysis" aria-label="步态识别分析">
    <header className="gait-analysis-header">
      <div><div className="gait-analysis-title"><Activity size={17} /><h4>步态识别 · 模拟分析</h4></div><p>骨骼追踪、关节摆动规律与步态能量图</p></div>
      <span className="gait-analysis-status">演示数据 · {recordId}</span>
    </header>
    <div className="gait-analysis-grid">
      <div className="gait-analysis-skeleton">
        <canvas ref={mainRef} width={gaitCanvasSize.main.width} height={gaitCanvasSize.main.height} aria-label="人体骨骼步态动画" />
        <span className="gait-analysis-canvas-label">骨骼点 · 步态相位 {phasePercent.toFixed(1)}%</span>
      </div>
      <div className="gait-analysis-side">
        <div className="gait-analysis-card">
          <div className="gait-analysis-card-title"><span className="gait-dot amber" />关节摆动规律 <small>角度曲线</small></div>
          <canvas ref={angleRef} width={gaitCanvasSize.angle.width} height={gaitCanvasSize.angle.height} aria-label="髋膝关节角度曲线" />
          <div className="gait-analysis-legend">{angleLines.map(([, label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div>
        </div>
        <div className="gait-analysis-card">
          <div className="gait-analysis-card-title"><span className="gait-dot red" />步态能量图 <small>GEI · 累积 {geiCount} 帧</small></div>
          <canvas ref={geiRef} width={gaitCanvasSize.gei.width} height={gaitCanvasSize.gei.height} aria-label="步态能量图 GEI" />
        </div>
      </div>
    </div>
    <div className="gait-analysis-controls">
      <button type="button" className="ui-button" onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? '暂停' : '播放'}</button>
      <button type="button" className="ui-button" onClick={() => { resetRef.current = true; }}><RotateCcw size={15} />重置 GEI</button>
      <div className="gait-analysis-controls-right">
        <label>速度 <input type="range" min="0.2" max="3" step="0.1" value={speed} onChange={event => setSpeed(Number(event.target.value))} /><span>{speed.toFixed(1)}x</span></label>
        <span className="gait-analysis-fps">FPS: {fps}</span>
        {onNext && <button type="button" className="ui-button primary gait-analysis-next" onClick={onNext}><span>检索</span><ArrowRight size={15} /></button>}
      </div>
    </div>
    <p className="gait-analysis-note">演示规则输出，不作为身份认定或真实人员追踪依据。</p>
  </section>;
}
