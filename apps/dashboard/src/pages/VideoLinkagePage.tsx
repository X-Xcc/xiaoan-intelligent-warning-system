import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Eye,
  Maximize2,
  Menu,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Alert, Badge, Button, ConfigProvider, Descriptions, Divider, Flex, Modal, Progress, Space, Spin, Statistic, Steps, Tag, theme as antdTheme } from 'antd';
import Card from 'antd/es/card/Card';
import { useEffect, useRef, useState } from 'react';
import { appBasePath } from '../lib/presentation';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');

type CameraItem = { id: string; name: string; online: boolean; feedUrl?: string; source?: string; area?: string };
type DetectionStats = { people?: number; fire?: number; abnormal?: number; distance?: number };
type VisionJudgement = { configured?: boolean; model?: string; riskLevel?: string; peopleEstimate?: number; sceneSummary?: string; suggestion?: string };
type CapturedFrame = { imageBase64?: string; imageMimeType?: string };
type FightAlertReport = {
  capturedAt: string;
  source: string;
  riskLevel: '中高风险' | '中风险';
  confidence: string;
  summary: string;
  peopleRange: string;
  crowdLevel: string;
  injuryObservation: string;
  objectObservation: string;
  evidenceStatus: string;
  recommendations: Array<{ priority: string; title: string; detail: string }>;
};

const fallbackCameras: CameraItem[] = [
  { id: 'local', name: '本机摄像头', online: true, source: '浏览器本机信号', area: '控制席' },
  { id: 'cam-001', name: '东门主通道', online: true, source: 'CCTV-01', area: '东门' },
  { id: 'cam-002', name: '西门主通道', online: true, source: 'CCTV-02', area: '西门' },
  { id: 'cam-003', name: '中心广场', online: true, source: 'CCTV-03', area: '中心广场' },
  { id: 'cam-004', name: '餐饮南区', online: true, source: 'CCTV-04', area: '餐饮区' },
  { id: 'cam-005', name: '餐饮北区', online: true, source: 'CCTV-05', area: '餐饮区' },
  { id: 'cam-006', name: '停车场入口', online: true, source: 'CCTV-06', area: '停车场' },
  { id: 'cam-007', name: '停车场出口', online: true, source: 'CCTV-07', area: '停车场' },
  { id: 'cam-008', name: '舞台前场', online: true, source: 'CCTV-08', area: '活动区' },
  { id: 'cam-009', name: '舞台后场', online: true, source: 'CCTV-09', area: '活动区' },
  { id: 'cam-010', name: '治安岗亭', online: true, source: 'CCTV-10', area: '岗亭' },
  { id: 'cam-011', name: '河堤步道', online: true, source: 'CCTV-11', area: '步道' },
  { id: 'cam-012', name: '便民服务点', online: false, source: 'CCTV-12', area: '服务区' },
  { id: 'cam-013', name: '东侧巷道', online: true, source: 'CCTV-13', area: '东侧巷道' },
  { id: 'cam-014', name: '西侧巷道', online: true, source: 'CCTV-14', area: '西侧巷道' },
  { id: 'cam-015', name: '后勤通道', online: true, source: 'CCTV-15', area: '后勤区' },
  { id: 'cam-016', name: '河景高位点', online: true, source: 'CCTV-16', area: '河景观景位' },
];

// 01 路专用于浏览器本机信号；02–16 路各自绑定一台独立的 CCTV 源。
const defaultChannels = ['local', ...Array.from({ length: 15 }, (_, index) => `cam-${String(index + 2).padStart(3, '0')}`)];
const mechanicalDogFallbackFeed = '/night-market-cam-02.png';
const mechanicalDogMeta = { name: '机械狗巡检视角', area: '东门主通道 · 低位巡检', source: 'ROBOT-DOG-01' };

// Generated night-market stills are bound to individual CCTV channels.
// Keep this map explicit so a missing asset can never fall back to another feed.
const placeholderFeedByCameraId: Record<string, string> = {
  'cam-002': '/night-market-cam-02.png',
  'cam-003': '/night-market-cam-03.png',
  'cam-004': '/night-market-cam-04.png',
  'cam-005': '/night-market-cam-05.png',
  'cam-006': '/night-market-cam-06.png',
  'cam-007': '/night-market-cam-07.png',
  'cam-008': '/night-market-cam-08.png',
  'cam-009': '/night-market-cam-09.png',
  'cam-010': '/night-market-cam-10.png',
  'cam-011': '/night-market-cam-11.png',
  'cam-012': '/night-market-cam-12.png',
  'cam-013': '/night-market-cam-13.png',
  'cam-014': '/night-market-cam-14.png',
  'cam-015': '/night-market-cam-15.png',
  'cam-016': '/night-market-cam-16.png',
};

function formatCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function streamUrl(camera: CameraItem) {
  if (camera.feedUrl) return `${API_BASE.replace(/\/api$/, '')}${camera.feedUrl}`;
  return `${API_BASE}/security-video/feed?cam=${camera.id}`;
}

function buildFallbackFightReport(): FightAlertReport {
  return {
    capturedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    source: 'ROBOT-DOG-01 · 东门主通道低位巡检',
    riskLevel: '中高风险',
    confidence: '本地演示研判',
    summary: '画面显示多名人员在通行带附近快速靠近并发生持续肢体拉扯，周边出现围观聚集。当前结论为疑似肢体冲突，需现场人员复核。',
    peopleRange: '疑似涉事 3 人',
    crowdLevel: '围观 12–18 人',
    injuryObservation: '未见明显倒地',
    objectObservation: '未见危险物',
    evidenceStatus: '已锁定当前截帧，建议保全事件前后 60 秒录像。',
    recommendations: [
      { priority: '立即', title: '派发最近巡逻人员', detail: '从东门与治安岗亭方向就近到场，先分隔冲突双方并核查人员伤情。' },
      { priority: '持续', title: '机械狗安全观察', detail: '保持安全距离沿外围持续回传，不进入冲突中心区域。' },
      { priority: '条件触发', title: '疏散围观并升级联动', detail: '发现伤情、危险物或冲突扩大时，疏散围观并按流程联动紧急服务。' },
    ],
  };
}

export function VideoLinkagePage({ onBack }: { onBack: () => void }) {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const imageRefs = useRef<Array<HTMLImageElement | null>>([]);
  const fightAlertVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<CameraItem[]>(fallbackCameras);
  const [channels, setChannels] = useState(defaultChannels);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [detection, setDetection] = useState<DetectionStats>({ people: 12, fire: 0, abnormal: 0, distance: 1 });
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [serviceOnline, setServiceOnline] = useState(false);
  const [failedFeeds, setFailedFeeds] = useState<Record<string, boolean>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fightAlertOpen, setFightAlertOpen] = useState(false);
  const [fightAlertFrame, setFightAlertFrame] = useState('');
  const [fightAlertReport, setFightAlertReport] = useState<FightAlertReport>(() => buildFallbackFightReport());
  const [fightAlertLoading, setFightAlertLoading] = useState(false);
  const [fightAlertProgress, setFightAlertProgress] = useState(0);
  const [fightAlertNotice, setFightAlertNotice] = useState('');

  useEffect(() => {
    const previousTitle = document.title;
    document.title = '夜市智防｜监控中心';
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const videoResponse = await fetch(`${API_BASE}/security-video/status`);
        if (!videoResponse.ok) throw new Error('视频服务暂不可用');
        const payload = await videoResponse.json() as { cameras?: CameraItem[]; detection?: DetectionStats; stats?: DetectionStats };
        if (cancelled) return;
        setServiceOnline(true);
        if (payload.cameras?.length) {
          // Keep the configured 16-channel wall even when the upstream reports only
          // the currently reachable cameras. Merging prevents every unknown channel
          // from being remapped to the first returned feed.
          const upstreamById = new Map(payload.cameras.filter((camera) => camera.id !== 'local').map((camera) => [camera.id, camera]));
          const mergedCameras = fallbackCameras.slice(1).map((fallback) => ({ ...fallback, ...upstreamById.get(fallback.id) }));
          payload.cameras.filter((camera) => camera.id !== 'local' && !mergedCameras.some((item) => item.id === camera.id)).forEach((camera) => mergedCameras.push(camera));
          const uniqueCameras = [fallbackCameras[0], ...mergedCameras];
          setCameras(uniqueCameras);
          setChannels((current) => current.map((source, index) => {
            if (index === 0 && source === 'local') return 'local';
            if (source !== 'local' && uniqueCameras.some((camera) => camera.id === source)) return source;
            // Keep the deterministic channel id even when that camera is offline.
            // Falling back to the first returned camera duplicates 01 路 across the wall.
            const defaultCameraId = `cam-${String(index + 2).padStart(3, '0')}`;
            return uniqueCameras.find((camera) => camera.id === defaultCameraId)?.id ?? defaultCameraId;
          }));
        }
        setDetection(payload.detection ?? payload.stats ?? detection);
      } catch {
        if (!cancelled) setServiceOnline(false);
        // The monitoring desk remains usable with its configured local source list.
      }
    };
    void loadStatus();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => localStreamRef.current?.getTracks().forEach((track) => track.stop()), []);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    videoRefs.current.forEach((element, index) => {
      if (element && index === 0 && channels[index] === 'local') element.srcObject = localStreamRef.current;
    });
  }, [channels, cameraStarted]);

  useEffect(() => {
    if (fightAlertVideoRef.current && cameraStarted) fightAlertVideoRef.current.srcObject = localStreamRef.current;
  }, [cameraStarted, fightAlertOpen]);

  useEffect(() => {
    if (!fightAlertLoading) return undefined;
    const timer = window.setInterval(() => setFightAlertProgress((current) => Math.min(current + 7, 88)), 420);
    return () => window.clearInterval(timer);
  }, [fightAlertLoading]);

  const onlineCount = cameras.filter((camera) => camera.online).length;

  const startLocalCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('当前浏览器不支持本机摄像头访问。');
      return;
    }
    try {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      localStreamRef.current = stream;
      setCameraStarted(true);
    } catch {
      setCameraStarted(false);
      setCameraError('请通过本机 localhost 页面授权摄像头后重试。');
    }
  };

  const setChannelSource = (channelIndex: number, sourceId: string) => {
    // The local webcam is reserved for 01 路; never let another tile bind to it.
    if (channelIndex !== 0 && sourceId === 'local') return;
    setChannels((current) => current.map((source, index) => index === channelIndex ? sourceId : source));
    setSelectedChannel(channelIndex);
  };

  const captureFrameForChannel = async (channelIndex: number): Promise<CapturedFrame> => {
    const video = videoRefs.current[channelIndex];
    const image = imageRefs.current[channelIndex];
    const source = video && video.readyState >= 2 ? video : image;
    if (!source) return {};
    try {
      const canvas = document.createElement('canvas');
      const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
      if (!width || !height) return {};
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(source, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const comma = dataUrl.indexOf(',');
      return comma >= 0 ? { imageBase64: dataUrl.slice(comma + 1), imageMimeType: 'image/jpeg' } : {};
    } catch {
      return {};
    }
  };

  const openFightAlert = async () => {
    setSelectedChannel(0);
    setFightAlertLoading(true);
    setFightAlertProgress(12);
    setFightAlertNotice('正在截取机械狗 01 路画面并提交千问视觉复核。');
    const fallback = buildFallbackFightReport();
    setFightAlertReport(fallback);
    setFightAlertOpen(true);
    try {
      const frame = await captureFrameForChannel(0);
      const evidenceUrl = frame.imageBase64 ? `data:${frame.imageMimeType ?? 'image/jpeg'};base64,${frame.imageBase64}` : mechanicalDogFallbackFeed;
      setFightAlertFrame(evidenceUrl);
      const response = await fetch(`${API_BASE}/security-ai/judgements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraId: 'local',
          cameraName: mechanicalDogMeta.name,
          ...frame,
          detection: {
            people: formatCount(detection.people),
            fire: formatCount(detection.fire),
            abnormal: formatCount(detection.abnormal),
            distance: formatCount(detection.distance),
          },
        }),
      });
      const payload = await response.json().catch(() => ({})) as { detail?: string; judgement?: VisionJudgement };
      if (!response.ok || !payload.judgement) throw new Error(payload.detail || '千问视觉复核暂不可用');
      const judgement = payload.judgement;
      if (judgement.configured === false) {
        setFightAlertNotice('千问未配置，当前展示本地演示研判；配置后将自动替换为云端视觉结论。');
        return;
      }
      if (typeof judgement.peopleEstimate === 'number') setDetection((current) => ({ ...current, people: judgement.peopleEstimate }));
      setFightAlertReport((current) => ({
        ...current,
        confidence: `${judgement.model || '千问视觉'} · 云端复核`,
        riskLevel: judgement.riskLevel && /high|高|danger|risk/i.test(judgement.riskLevel) ? '中高风险' : '中风险',
        summary: judgement.sceneSummary ? `千问视觉复核：${judgement.sceneSummary}` : current.summary,
        peopleRange: typeof judgement.peopleEstimate === 'number' ? '疑似涉事 3 人' : current.peopleRange,
        recommendations: judgement.suggestion ? [{ priority: '优先', title: '千问处置建议', detail: judgement.suggestion }, ...current.recommendations] : current.recommendations,
      }));
      setFightAlertNotice('千问视觉复核完成，研判内容已更新。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '千问视觉复核暂不可用';
      setFightAlertFrame((current) => current || mechanicalDogFallbackFeed);
      setFightAlertNotice(`本地演示研判：${message}`);
    } finally {
      setFightAlertLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.altKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        void openFightAlert();
      }
      if (event.key === 'Escape') setFightAlertOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detection]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreen(Boolean(document.fullscreenElement));
    } catch {
      setFullscreen(false);
    }
  };

  const navTo = (path: string) => {
    window.history.pushState({}, '', `${appBasePath}${path}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return <main className="monitoring-page">
    <header className="monitoring-topbar">
      <button className="monitoring-brand" type="button" onClick={onBack} aria-label="返回项目入口"><ArrowLeft size={18} /><span><ShieldCheck size={21} /></span><strong>夜市智防</strong><small>综合监控中心</small></button>
      <nav className="monitoring-desktop-nav" aria-label="工作系统"><button type="button" onClick={() => navTo('/night-market/command')}>指挥态势</button><button type="button" aria-current="page">视频监控</button></nav>
      <div className="monitoring-top-actions">
        <span className={`monitoring-service ${serviceOnline ? 'online' : ''}`}>{serviceOnline ? '视频服务在线' : '本地演示模式'}</span>
        <span className="monitoring-online"><i />设备在线 {onlineCount}/{cameras.length}</span>
        <button className="monitoring-icon-button" type="button" title="刷新视频状态" aria-label="刷新视频状态" onClick={() => window.location.reload()}><RefreshCw size={16} /></button>
        <button className="monitoring-icon-button" type="button" title={fullscreen ? '退出全屏' : '进入全屏'} aria-label={fullscreen ? '退出全屏' : '进入全屏'} onClick={() => void toggleFullscreen()}><Maximize2 size={16} /></button>
        <button className="monitoring-icon-button monitoring-mobile-menu" type="button" title="打开导航" aria-label={mobileMenuOpen ? '关闭导航' : '打开导航'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}</button>
      </div>
      {mobileMenuOpen && <nav className="monitoring-mobile-nav"><button type="button" onClick={() => navTo('/night-market/command')}>指挥前端</button><button type="button" onClick={() => navTo('/admin')}>后端管理</button><button type="button" onClick={() => navTo('/duty-plan')}>勤务预案</button></nav>}
    </header>

    <section className="monitoring-workspace">
      <div className="monitoring-wall-head">
        <div><span>监控中心 / {channels.length} 路视频</span><h1>全域视频监控</h1></div>
        <div className="monitoring-wall-controls"><span className="monitoring-selected-label">当前聚焦 {String(selectedChannel + 1).padStart(2, '0')} 路</span><button type="button" className="monitoring-subtle-button" onClick={() => void startLocalCamera()}><Camera size={16} />{cameraStarted ? '重新接入本机' : '接入本机摄像头'}</button><button type="button" className="monitoring-review-button" title="机械狗异常事件研判" onClick={() => void openFightAlert()} disabled={fightAlertLoading}><AlertTriangle size={16} />异常研判</button></div>
      </div>

      <div className="monitoring-layout">
        <section className="monitoring-video-wall" aria-label="十六路监控视频墙">
          {channels.map((sourceId, index) => {
            const camera = cameras.find((item) => item.id === sourceId) ?? { id: sourceId, name: `视频源 ${sourceId}`, online: false, area: '未接入' };
            const isSelected = selectedChannel === index;
            const isLocalChannel = index === 0 && camera.id === 'local';
            const isMechanicalDogChannel = index === 0;
            const displayCamera = isMechanicalDogChannel ? { ...camera, ...mechanicalDogMeta, online: true } : camera;
            const liveFeedUrl = streamUrl(camera);
            const hasLiveFeed = !isLocalChannel && camera.id !== 'local' && Boolean(camera.feedUrl) && !failedFeeds[liveFeedUrl];
            const placeholderFeed = isMechanicalDogChannel && !cameraStarted ? mechanicalDogFallbackFeed : !isLocalChannel && !hasLiveFeed ? placeholderFeedByCameraId[camera.id] : undefined;
            const feedStatus = (isLocalChannel && cameraStarted) || hasLiveFeed ? '实时信号' : placeholderFeed && !failedFeeds[placeholderFeed] ? '演示画面' : '信号未接入';
            return <article key={`channel-${index}`} className={`monitoring-tile ${isSelected ? 'selected' : ''} ${displayCamera.online ? 'online' : 'offline'}`} onClick={() => setSelectedChannel(index)}>
              <div className={`monitoring-scene scene-${(index % 8) + 1}`}>
                {isLocalChannel && cameraStarted && <video ref={(element) => { videoRefs.current[index] = element; }} autoPlay muted playsInline />}
                {hasLiveFeed && <img ref={(element) => { imageRefs.current[index] = element; }} crossOrigin="anonymous" src={liveFeedUrl} alt={`${camera.name}视频流`} onError={() => setFailedFeeds((current) => ({ ...current, [liveFeedUrl]: true }))} />}
                {placeholderFeed && !failedFeeds[placeholderFeed] && <img ref={(element) => { imageRefs.current[index] = element; }} src={placeholderFeed} alt={`${displayCamera.name}监控画面`} onError={() => setFailedFeeds((current) => ({ ...current, [placeholderFeed]: true }))} />}
                {!hasLiveFeed && (!placeholderFeed || failedFeeds[placeholderFeed]) && !(isLocalChannel && cameraStarted) && <div className="monitoring-feed-empty"><Camera size={24} /><span>暂无可用信号</span></div>}
                <span className={`monitoring-feed-status ${feedStatus === '实时信号' ? 'live' : ''}`}>{feedStatus}</span>
                {isLocalChannel && !cameraStarted && <button type="button" className="monitoring-local-start" onClick={(event) => { event.stopPropagation(); void startLocalCamera(); }}><Camera size={14} />接入本机</button>}
              </div>
              <div className="monitoring-tile-meta"><span><i className={displayCamera.online ? 'online' : ''} />{String(index + 1).padStart(2, '0')} 路</span><button className="monitoring-feed-name" type="button" title={`聚焦${displayCamera.name}`} aria-pressed={isSelected} onClick={() => setSelectedChannel(index)}><strong>{displayCamera.name}</strong></button><small>{displayCamera.area ?? displayCamera.source ?? '监控区域'}</small></div>
              {isMechanicalDogChannel ? <div className="monitoring-source-select monitoring-source-locked"><span>设备</span><strong>ROBOT-DOG-01</strong></div> : <label className="monitoring-source-select" onClick={(event) => event.stopPropagation()}><span>画面源</span><select value={sourceId} onChange={(event) => setChannelSource(index, event.target.value)} aria-label={`第 ${index + 1} 路画面源`}>{cameras.filter((item) => item.id !== 'local').map((item) => <option key={item.id} value={item.id}>{item.name}{item.online ? '' : '（待接入）'}</option>)}</select></label>}
              {isSelected && <span className="monitoring-focus-mark"><Eye size={14} />聚焦</span>}
            </article>;
          })}
        </section>
      </div>
      {cameraError && <div className="monitoring-error"><AlertTriangle size={15} />{cameraError}</div>}
    </section>
    <ConfigProvider theme={{ algorithm: antdTheme.darkAlgorithm, token: { colorPrimary: '#75a6ff', colorBgBase: '#14181e', colorBgContainer: '#1d222a', colorBgElevated: '#1d222a', colorBorder: '#3a414c', colorText: '#edf0f5', colorTextSecondary: '#adb6c4', colorSuccess: '#70cba3', colorWarning: '#e9bd72', colorError: '#f18d91', borderRadius: 6, fontSize: 14 }, components: { Button: { defaultBg: '#272e38', defaultBorderColor: '#454e5a', defaultColor: '#edf0f5' }, Card: { headerBg: '#1d222a' }, Modal: { headerBg: '#1d222a', contentBg: '#1d222a', footerBg: '#1d222a' } } }}>
    <Modal open={fightAlertOpen} footer={null} onCancel={() => setFightAlertOpen(false)} width={1120} className="fight-alert-modal" title={null} destroyOnHidden={false} styles={{ container: { padding: 0 }, body: { padding: 0 } }}>
      <section className="fight-alert-shell" aria-label="机械狗斗殴异常研判">
        <header className="fight-alert-header"><div><span>ABNORMAL EVENT REVIEW</span><strong>异常事件研判 · 机械狗</strong></div><Space className="fight-alert-tags" size={8} wrap><Tag color="orange"><AlertTriangle size={13} />{fightAlertReport.riskLevel} · 疑似肢体冲突</Tag><Badge status={fightAlertLoading ? 'processing' : 'success'} text={<span className="fight-alert-model-status">{fightAlertLoading && <Spin size="small" />}{fightAlertLoading ? '千问视觉复核中' : fightAlertReport.confidence}</span>} /></Space></header>
        <div className="fight-alert-body">
          <Card size="small" className="fight-alert-source" title="机械狗巡检画面" extra={<Tag color="cyan">ROBOT-DOG-01</Tag>}>
            <div className="fight-alert-frame">{cameraStarted ? <video ref={fightAlertVideoRef} autoPlay muted playsInline /> : <img src={mechanicalDogFallbackFeed} alt="机械狗巡检来源画面" />}<div className="fight-alert-hud top"><span>{cameraStarted ? '本机实时信号' : '演示画面'}</span><span>{fightAlertReport.capturedAt}</span></div><div className="fight-alert-hud bottom">东门主通道 · 低位巡检</div></div>
            <Descriptions size="small" column={1} className="fight-alert-source-details" items={[{ key: 'source', label: '来源', children: '东门主通道低位巡检' }, { key: 'time', label: '截取时间', children: fightAlertReport.capturedAt }, { key: 'device', label: '设备', children: '机械狗' }]} />
          </Card>
          <aside className="fight-alert-analysis">
            {fightAlertLoading ? <Card size="small" className="fight-alert-progress" title="千问视觉复核"><Flex vertical gap={16} justify="center" className="fight-alert-progress-content"><Badge status="processing" text="正在复核机械狗巡检画面" /><strong>{fightAlertProgress}%</strong><Progress percent={fightAlertProgress} showInfo={false} status="active" /><small>正在分析疑似涉事人员与现场风险。</small></Flex></Card> : <><Card size="small" className="fight-alert-evidence" title="异常截帧" extra={<Tag color="gold">EVIDENCE #01</Tag>}><Flex gap={10} align="center"><img src={fightAlertFrame || mechanicalDogFallbackFeed} alt="异常事件截帧" /><div><strong>已关联机械狗来源</strong><small>{fightAlertReport.capturedAt} · 当前截帧已保留</small></div></Flex></Card><Card size="small" className="fight-alert-report" title="警情研判"><Alert showIcon type="warning" message="疑似异常 · 待人工复核" description={fightAlertReport.summary} /><Divider /><div className="fight-alert-statistics"><Statistic title="涉事人员" value={fightAlertReport.peopleRange} /><Statistic title="现场影响" value={fightAlertReport.crowdLevel} /><Statistic title="伤情观察" value={fightAlertReport.injuryObservation} /><Statistic title="危险物" value={fightAlertReport.objectObservation} /></div></Card><Card size="small" className="fight-alert-recommendations" title="处置建议"><Steps size="small" orientation="vertical" items={fightAlertReport.recommendations.map((recommendation) => ({ title: recommendation.title, content: recommendation.detail }))} /><small className="fight-alert-evidence-status">{fightAlertReport.evidenceStatus}</small></Card></>}
          </aside>
        </div>
        <p className="fight-alert-human-review">AI 研判仅供辅助参考，事件性质与处置措施须由现场人员复核确认。</p>
        {fightAlertNotice && <p className="fight-alert-notice" aria-live="polite">{fightAlertNotice}</p>}
        <footer className="fight-alert-footer"><Space size={8} wrap><Button onClick={() => setFightAlertOpen(false)}>关闭</Button><Button onClick={() => setFightAlertNotice('已完成证据保全：当前截帧及事件前后 60 秒录像已加入演示档案。')}>保全证据</Button><Button onClick={() => setFightAlertNotice('已模拟请求增援：东门与治安岗亭方向的就近巡逻力量进入待响应状态。')}>请求增援</Button><Button type="primary" onClick={() => setFightAlertNotice('已发起模拟处置：事件已推送至值守台，等待现场人员确认。')}>发起处置</Button></Space></footer>
      </section>
    </Modal>
    </ConfigProvider>
  </main>;
}
