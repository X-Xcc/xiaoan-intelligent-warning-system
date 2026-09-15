import { CameraOff, Eye, Thermometer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { bridgeSourceKey, bridgeStatusLabels, hasFreshFrame, type BridgeDevice } from '../lib/device-bridges-api';
import { startThermalStream, type ThermalDisplayMode, type ThermalVideoFrame } from '../lib/thermal-stream';
import '../styles/thermal-monitor.css';

export type { ThermalDisplayMode } from '../lib/thermal-stream';

export function ThermalMonitor({ device, available, authorized, epoch, compact = true, mode, onModeChange, edges, onEdgesChange }: {
  device?: BridgeDevice;
  available: boolean;
  authorized: boolean;
  epoch: string | number;
  compact?: boolean;
  mode: ThermalDisplayMode;
  onModeChange: (mode: ThermalDisplayMode) => void;
  edges: boolean;
  onEdgesChange: (enabled: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latestDevice = useRef(device);
  const [now, setNow] = useState(Date.now);
  const [frame, setFrame] = useState<ThermalVideoFrame | null>(null);
  const [error, setError] = useState('');
  const fresh = Boolean(device && hasFreshFrame(device, now));
  const canPreview = Boolean(device && available && authorized && fresh);
  const sourceKey = device ? bridgeSourceKey(device) : '';

  useEffect(() => { latestDevice.current = device; }, [device]);
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);
  useEffect(() => {
    setFrame(null);
    setError('');
    if (!canPreview || !canvas.current) return;
    return startThermalStream({
      canvas: canvas.current, device: () => latestDevice.current, mode, edges,
      onFrame: setFrame, onError: setError,
    });
  }, [canPreview, sourceKey, epoch, mode, edges]);

  const current = canPreview && frame?.sourceKey === sourceKey && frame?.mode === mode
    && frame?.edges === edges && now - frame.receivedAt <= 10000 ? frame : null;
  const metrics = current?.metrics;
  const state = !device ? '未绑定摄像头'
    : !authorized ? '预览未授权'
      : !available ? '状态未确认，画面已暂停'
        : !fresh ? device.status === 'online' ? '画面已过期 / 等待新帧' : bridgeStatusLabels[device.status]
          : error || '正在读取视频帧';
  const metric = (value: number | undefined, digits = 1) => value === undefined ? '--' : value.toFixed(digits);

  return <div className={`ot-thermal ${compact ? 'compact' : 'expanded'}`}>
    {!compact && <div className="ot-thermal-toolbar">
      <div className="ot-thermal-modes" role="radiogroup" aria-label="01路画面模式">
        <label className={mode === 'thermal' ? 'selected' : ''}>
          <input type="radio" name="ot-thermal-mode" checked={mode === 'thermal'} onChange={() => onModeChange('thermal')} />
          <Thermometer size={15} /><span>热成像</span>
        </label>
        <label className={mode === 'original' ? 'selected' : ''}>
          <input type="radio" name="ot-thermal-mode" checked={mode === 'original'} onChange={() => onModeChange('original')} />
          <Eye size={15} /><span>原始画面</span>
        </label>
      </div>
      <label className="ot-thermal-edges"><input type="checkbox" checked={edges} disabled={mode === 'original'}
        onChange={event => onEdgesChange(event.target.checked)} />边缘增强</label>
    </div>}
    <div className="ot-thermal-body">
      <div className="ot-thermal-viewport" data-device-id={device?.id}
        data-preview-mode="thermal-snapshot" data-display-mode={mode}
        data-preview-state={current ? 'live' : 'unavailable'}>
        <canvas ref={canvas} className="ot-thermal-canvas" hidden={!current}
          aria-label={`${device?.name ?? '01路'}${mode === 'thermal' ? '伪彩热成像' : '原始画面'}`} />
        {!current && <div className="ot-thermal-empty" role="status"><CameraOff size={compact ? 20 : 28} /><span>{state}</span></div>}
        {current && <span className="ot-thermal-badge">{mode === 'thermal' ? '伪彩模拟' : '原始画面'}</span>}
        {current && mode === 'thermal' && <div className="ot-thermal-scale" aria-label="相对亮度色标">
          <span>高</span><i /><span>低</span>
        </div>}
      </div>
      {!compact && <aside className="ot-thermal-analysis" aria-label="实时模拟分析">
        <h4>实时模拟分析</h4>
        <small className="ot-thermal-disclaimer">亮度映射，非真实测温</small>
        <dl className="ot-thermal-metrics">
          <div><dt>平均温度（模拟）</dt><dd>{metric(metrics?.averageTemperature)}<small>°C</small></dd></div>
          <div><dt>峰值温度（模拟）</dt><dd>{metric(metrics?.peakTemperature)}<small>°C</small></dd></div>
          <div><dt>边缘密度</dt><dd>{metric(metrics?.edgeDensity)}<small>%</small></dd></div>
          <div><dt>复杂度指数</dt><dd>{metric(metrics?.complexity, 2)}</dd></div>
        </dl>
        <dl className="ot-thermal-details">
          <div><dt>高亮区域占比</dt><dd>{metric(metrics?.brightAreaPercent)} %</dd></div>
          <div><dt>处理帧率</dt><dd>{metric(current?.fps ?? undefined)} FPS</dd></div>
          <div><dt>画面时间</dt><dd>{current ? new Date(current.receivedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '--'}</dd></div>
        </dl>
      </aside>}
    </div>
  </div>;
}
