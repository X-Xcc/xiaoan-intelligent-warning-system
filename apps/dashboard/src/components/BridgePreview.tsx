import { Button } from 'antd';
import { CameraOff, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { bridgeErrorMessage, bridgeMediaUrl, bridgeSourceKey, bridgeStatusLabels, hasFreshFrame, requestBridgeSnapshot, type BridgeDevice } from '../lib/device-bridges-api';
import { subscribeBridgeVideo, type VideoPlayback } from '../lib/bridge-webrtc';

type PreviewProps = { device?: BridgeDevice; available: boolean; authorized: boolean; epoch?: number; compact?: boolean };

function SnapshotSource({ device, available, authorized }: PreviewProps) {
  const latestDevice = useRef(device);
  const [now, setNow] = useState(Date.now);
  const [frame, setFrame] = useState('');
  const [receivedAt, setReceivedAt] = useState(0);
  const [error, setError] = useState('');
  const fresh = Boolean(device && hasFreshFrame(device, now));
  const canPreview = Boolean(device && available && authorized && fresh);

  useEffect(() => { latestDevice.current = device; }, [device]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setFrame('');
    setError('');
    if (!canPreview || !device) return;
    const id = device.id;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let currentUrl = '';
    let pendingUrl = '';
    const clearFrame = () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = '';
      setFrame('');
    };
    const load = async () => {
      const startedAt = performance.now();
      let interval = 100;
      try {
        if (!latestDevice.current || !hasFreshFrame(latestDevice.current)) { clearFrame(); return; }
        const image = await requestBridgeSnapshot(id, controller.signal);
        if (controller.signal.aborted) return;
        const capturedAt = Date.now();
        pendingUrl = URL.createObjectURL(image);
        const decoded = new Image();
        decoded.src = pendingUrl;
        await decoded.decode();
        if (controller.signal.aborted) return;
        if (!latestDevice.current || !hasFreshFrame(latestDevice.current)) { clearFrame(); return; }
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = pendingUrl;
        pendingUrl = '';
        setFrame(currentUrl);
        setReceivedAt(capturedAt);
        setError('');
      } catch (failure) {
        interval = 1000;
        if (!controller.signal.aborted) {
          clearFrame();
          setError(bridgeErrorMessage(failure));
        }
      } finally {
        if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = ''; }
        // Include fetch/decode time in the cadence; never overlap requests.
        if (!controller.signal.aborted) timer = setTimeout(load, Math.max(0, interval - (performance.now() - startedAt)));
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      currentUrl = '';
      pendingUrl = '';
    };
  }, [device?.id, canPreview]);

  const snapshotFresh = now - receivedAt <= 10000;
  const showImage = canPreview && Boolean(frame) && snapshotFresh;
  const state = !device ? '未绑定设备'
    : !authorized ? '预览未授权'
      : !available ? '状态未确认，画面已暂停'
        : !fresh ? device.status === 'online' ? '画面已过期 / 暂无新帧' : bridgeStatusLabels[device.status]
          : frame && !snapshotFresh ? '画面已过期 / 等待新快照' : error || '正在读取画面';
  return <div className="bridge-preview compact" data-device-id={device?.id} data-preview-mode="snapshot" data-preview-state={showImage ? 'live' : 'unavailable'}>
    {showImage && device && <img src={frame} alt={`${device.name}最新视频画面`} onError={() => { setFrame(''); setError('画面解码失败'); }} />}
    {!showImage && <div className="bridge-preview-empty" role="status"><CameraOff size={20} /><span>{state}</span></div>}
    {showImage && <span className="bridge-preview-live">最新画面</span>}
  </div>;
}

function PreviewSource({ device, available, authorized, compact }: PreviewProps) {
  const image = useRef<HTMLImageElement>(null);
  const [now, setNow] = useState(Date.now);
  const [loaded, setLoaded] = useState(false);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const fresh = Boolean(device && hasFreshFrame(device, now));
  const failed = failedAt !== null;
  const showImage = Boolean(device && available && authorized && fresh && !failed);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (image.current?.naturalWidth) setLoaded(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { if (!showImage) setLoaded(false); }, [showImage]);

  useEffect(() => {
    if (failedAt !== null && device && device.frameCount > failedAt && fresh) {
      setFailedAt(null);
      setLoaded(false);
      setRetry((value) => value + 1);
    }
  }, [device?.frameCount, failedAt, fresh]);

  const state = !device ? '未绑定设备'
    : !authorized ? '预览未授权'
      : !available ? '状态未确认，画面已暂停'
        : failed ? '视频加载失败'
          : !fresh ? device.status === 'online' ? '画面已过期 / 暂无新帧' : bridgeStatusLabels[device.status]
            : loaded ? '实时画面' : '正在加载画面';

  return <div className={`bridge-preview ${compact ? 'compact' : ''}`} data-device-id={device?.id} data-preview-state={showImage && loaded ? 'live' : 'unavailable'}>
    {showImage && device && <img
      key={retry} ref={image} src={bridgeMediaUrl(device.id, 'feed')} alt={`${device.name}实时视频`}
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(Boolean(image.current?.naturalWidth))}
      onError={() => { setLoaded(false); setFailedAt(device.frameCount); }}
    />}
    {(!showImage || !loaded) && <div className="bridge-preview-empty" role="status">
      <CameraOff size={compact ? 20 : 28} /><span>{state}</span>
      {failed && <Button size="small" icon={<RefreshCw size={14} />} onClick={() => { setFailedAt(null); setRetry((value) => value + 1); }}>重试画面</Button>}
    </div>}
    {showImage && loaded && <span className="bridge-preview-live">实时画面</span>}
  </div>;
}

function ContinuousVideo(props: PreviewProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState<VideoPlayback>({ stream: null, fps: null, bufferMs: null, dropped: 0, error: '' });
  const [playing, setPlaying] = useState(false);
  const key = props.device ? `${bridgeSourceKey(props.device)}:${props.epoch ?? 0}` : '';
  const active = Boolean(props.device && props.available && props.authorized && props.device.online);
  useEffect(() => {
    setPlaying(false);
    if (!active || !props.device) return;
    return subscribeBridgeVideo(props.device.id, key, setPlayback);
  }, [active, key]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = playback.stream;
    if (playback.stream) void element.play().catch(() => setPlaying(false));
    return () => { element.srcObject = null; };
  }, [playback.stream]);
  const live = active && playing && Boolean(playback.stream);
  return <div className={`bridge-preview ${props.compact ? 'compact' : ''}`}
    data-device-id={props.device?.id} data-preview-mode="webrtc" data-preview-state={live ? 'live' : 'unavailable'}
    data-playback-fps={playback.fps?.toFixed(1)} data-buffer-ms={playback.bufferMs?.toFixed(1)}
    data-dropped-frames={playback.dropped}>
    <video ref={video} autoPlay muted playsInline aria-label={`${props.device?.name}实时视频`}
      onPlaying={() => setPlaying(true)} onWaiting={() => setPlaying(false)} />
    {!live && <div className="bridge-preview-empty" role="status"><CameraOff size={20} />
      <span>{!active ? '视频未连接' : playback.error || '正在连接实时视频'}</span></div>}
    {live && <span className="bridge-preview-live">
      实时画面{playback.fps !== null ? ` · ${playback.fps.toFixed(1)} fps` : ''}
    </span>}
  </div>;
}

export function BridgePreview(props: PreviewProps) {
  const key = `${props.device ? bridgeSourceKey(props.device) : 'unbound'}:${props.epoch ?? 0}`;
  if (props.device?.webrtc && typeof RTCPeerConnection !== 'undefined') return <ContinuousVideo key={key} {...props} />;
  return props.compact ? <SnapshotSource key={key} {...props} /> : <PreviewSource key={key} {...props} />;
}
