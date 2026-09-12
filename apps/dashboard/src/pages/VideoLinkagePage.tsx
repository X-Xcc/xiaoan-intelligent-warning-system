import { App, Button, ConfigProvider, Modal, Tooltip, theme } from 'antd';
import { ArrowLeft, BrainCircuit, Cable, Eye, LockKeyhole, Maximize2, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BridgeLogin, BridgePreview } from '../components/BridgePreview';
import { bridgeErrorMessage, bridgeKindLabels, frameTime, hasFreshFrame, useBridgeInventory } from '../lib/device-bridges-api';
import { appBasePath, routePath, type PlatformView } from '../lib/presentation';
import '../styles/device-bridges.css';

const emptyBindings: Array<string | null> = Array(16).fill(null);
const slotPlaceholder = (index: number) => `${appBasePath}/night-market-cam-${String(Math.max(2, index + 1)).padStart(2, '0')}.png`;
const wallScenes = [
  { name: '东门主通道', area: '东门入口' },
  { name: '西门主通道', area: '西门入口' },
  { name: '中心广场', area: '中心活动区' },
  { name: '餐饮南区', area: '南侧美食街' },
  { name: '餐饮北区', area: '北侧美食街' },
  { name: '停车场入口', area: '外围交通区' },
  { name: '停车场出口', area: '外围交通区' },
  { name: '舞台前场', area: '演艺活动区' },
  { name: '舞台后场', area: '演艺活动区' },
  { name: '治安岗亭', area: '综合服务区' },
  { name: '河堤步道', area: '滨水休闲区' },
  { name: '便民服务点', area: '综合服务区' },
  { name: '东侧巷道', area: '东侧商铺区' },
  { name: '西侧巷道', area: '西侧商铺区' },
  { name: '后勤通道', area: '后勤保障区' },
  { name: '河景高位点', area: '滨水观景区' },
];

export function VideoLinkagePage({ onBack }: { onBack: () => void }) {
  const bridge = useBridgeInventory();
  const { message } = App.useApp();
  const root = useRef<HTMLElement>(null);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const cameras = bridge.inventory?.items ?? [];
  const bindings = bridge.inventory?.bindings ?? emptyBindings;
  const selected = cameras.find((device) => device.id === bindings[selectedChannel]);
  const selectedScene = wallScenes[selectedChannel];
  const onlineCount = bridge.available ? cameras.filter((device) => hasFreshFrame(device, bridge.now)).length : null;
  const previewAvailable = bridge.available && !bridge.busy;

  useEffect(() => {
    const previous = document.title;
    document.title = '视频联动 | 实时监控';
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => { document.title = previous; document.removeEventListener('fullscreenchange', sync); };
  }, []);

  const navigate = (view: PlatformView, deviceId?: string) => {
    const target = `${routePath(view)}${deviceId ? `?device=${encodeURIComponent(deviceId)}` : ''}`;
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch { message.error('当前浏览器未允许全屏'); }
  };

  return <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#75a6ff', colorBgBase: '#181a1d', colorBgContainer: '#232629', colorBorder: '#42474c', colorText: '#edf0f5', colorTextSecondary: '#adb6c4', borderRadius: 6, fontSize: 14 } }}>
    <main ref={root} className="monitoring-page bridge-video-page">
      <header className="monitoring-topbar">
        <button className="monitoring-brand" type="button" onClick={onBack} aria-label="返回平台"><ArrowLeft size={18} /><span><ShieldCheck size={21} /></span><strong>视频联动</strong><small>实时监控中心</small></button>
        <nav className="monitoring-desktop-nav" aria-label="工作系统">
          <button type="button" onClick={() => navigate('night-market-command')}>指挥态势</button>
          <button type="button" aria-current="page">视频监控</button>
          <button type="button" onClick={() => navigate('device-bridges')}>设备桥接</button>
        </nav>
        <div className="monitoring-top-actions">
          {onlineCount !== null && cameras.length > 0 && <span className="monitoring-online">实时设备 {onlineCount} / {cameras.length}</span>}
          <Tooltip title="刷新视频状态"><button className="monitoring-icon-button" type="button" aria-label="刷新视频状态" disabled={bridge.refreshing || bridge.busy} onClick={bridge.refresh}><RefreshCw size={16} /></button></Tooltip>
          <Tooltip title={fullscreen ? '退出全屏' : '进入全屏'}><button className="monitoring-icon-button" type="button" aria-label={fullscreen ? '退出全屏' : '进入全屏'} onClick={() => void toggleFullscreen()}><Maximize2 size={16} /></button></Tooltip>
          {bridge.auth?.enabled && !bridge.authRequired && <Tooltip title="锁定访问"><button className="monitoring-icon-button" type="button" aria-label="锁定访问" disabled={bridge.busy} onClick={() => void bridge.lock().catch((error) => message.error(`本地已锁定；${bridgeErrorMessage(error)}`))}><LockKeyhole size={16} /></button></Tooltip>}
          <button className="monitoring-icon-button monitoring-mobile-menu" type="button" aria-label={mobileMenuOpen ? '关闭导航' : '打开导航'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}</button>
        </div>
        {mobileMenuOpen && <nav className="monitoring-mobile-nav" aria-label="移动工作系统">
          <button type="button" onClick={() => navigate('device-bridges')}>设备桥接</button>
          <button type="button" onClick={() => navigate('admin')}>平台治理</button>
          <button type="button" onClick={() => navigate('night-market-command')}>指挥态势</button>
        </nav>}
      </header>
      <section className="monitoring-workspace">
        <div className="monitoring-wall-head">
          <div><span>夜市监控 / 16 路画面</span><h1>实时视频墙</h1></div>
          <div className="monitoring-wall-controls">
            <span className="monitoring-selected-label">当前聚焦 {String(selectedChannel + 1).padStart(2, '0')} 路</span>
            <Button icon={<Cable size={16} />} onClick={() => navigate('device-bridges', selected?.id)}>管理绑定</Button>
            <Tooltip title="当前接入仅提供视频，尚无可用的 AI 研判服务"><span><Button disabled icon={<BrainCircuit size={16} />}>AI 研判</Button></span></Tooltip>
          </div>
        </div>
        {bridge.authRequired ? <BridgeLogin login={bridge.login} busy={bridge.busy} tokenConfigured={bridge.auth?.tokenConfigured} /> : <>
          <section className="monitoring-video-wall" aria-label="十六路监控视频墙">
            {bindings.map((id, index) => {
              const camera = cameras.find((device) => device.id === id);
              const scene = wallScenes[index];
              const focused = selectedChannel === index;
              const fresh = previewAvailable && camera && hasFreshFrame(camera, bridge.now);
              return <article key={`slot-${index}-${id ?? 'empty'}`} className={`monitoring-tile ${focused ? 'selected' : ''}`}>
                <BridgePreview device={camera} available={previewAvailable} authorized={bridge.previewReady} epoch={bridge.previewEpoch} compact placeholderSrc={slotPlaceholder(index)} />
                <div className="monitoring-tile-meta">
                  <span><i className={fresh ? 'online' : ''} />{String(index + 1).padStart(2, '0')} 路</span>
                  <button className="monitoring-feed-name" type="button" aria-label={`聚焦第 ${index + 1} 路 ${camera?.name ?? scene.name}`} aria-pressed={focused} onClick={() => setSelectedChannel(index)}><strong>{camera?.name ?? scene.name}</strong></button>
                  <small>{camera ? bridgeKindLabels[camera.kind] : scene.area}</small>
                </div>
                <div className="bridge-wall-slot-actions">
                  <span>{fresh && camera && typeof camera.fps === 'number' ? `解码 ${Number(camera.fps.toFixed(1))} fps` : `CAM-${String(index + 1).padStart(2, '0')}`}</span>
                  <Tooltip title={`管理第 ${index + 1} 路绑定`}><Button type="text" size="small" aria-label={`管理第 ${index + 1} 路绑定`} icon={<Cable size={14} />} onClick={() => navigate('device-bridges', camera?.id)} /></Tooltip>
                  <Tooltip title={`放大第 ${index + 1} 路`}><Button type="text" size="small" aria-label={`放大第 ${index + 1} 路`} icon={<Maximize2 size={14} />} onClick={() => { setSelectedChannel(index); setFocusOpen(true); }} /></Tooltip>
                </div>
                {focused && <span className="monitoring-focus-mark"><Eye size={13} />聚焦</span>}
              </article>;
            })}
          </section>
          <section className="bridge-wall-focus" aria-label="当前聚焦设备">
            <strong>{String(selectedChannel + 1).padStart(2, '0')} 路 · {selected?.name ?? selectedScene.name}</strong>
            {!selected && <span>{selectedScene.area}</span>}
            {bridge.available && selected?.width && selected.height ? <span>分辨率 {selected.width} × {selected.height}</span> : null}
            {selected && Number.isFinite(frameTime(selected.lastFrameAt)) && <span>最近帧 {new Date(frameTime(selected.lastFrameAt)).toLocaleString('zh-CN', { hour12: false })}</span>}
            <Button size="small" icon={<Maximize2 size={14} />} onClick={() => setFocusOpen(true)}>聚焦画面</Button>
          </section>
        </>}
      </section>
      <Modal open={focusOpen && !bridge.authRequired} onCancel={() => setFocusOpen(false)} footer={null} width={1000} destroyOnHidden
        title={`${String(selectedChannel + 1).padStart(2, '0')} 路 · ${selected?.name ?? selectedScene.name}`} className="bridge-focus-modal" getContainer={() => root.current ?? document.body}>
        <BridgePreview device={selected} available={previewAvailable} authorized={bridge.previewReady} epoch={bridge.previewEpoch} placeholderSrc={slotPlaceholder(selectedChannel)} />
      </Modal>
    </main>
  </ConfigProvider>;
}
