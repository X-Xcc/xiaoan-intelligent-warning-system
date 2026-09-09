import { Alert, App, Button, ConfigProvider, Modal, Tooltip, theme } from 'antd';
import { ArrowLeft, BrainCircuit, Cable, Eye, LockKeyhole, Maximize2, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BridgeLogin, BridgePreview } from '../components/BridgePreview';
import { bridgeErrorMessage, bridgeKindLabels, frameTime, hasFreshFrame, useBridgeInventory } from '../lib/device-bridges-api';
import { routePath, type PlatformView } from '../lib/presentation';
import '../styles/device-bridges.css';

const emptyBindings: Array<string | null> = Array(16).fill(null);

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
          <span className={`monitoring-service ${bridge.available ? 'online' : ''}`} role="status">{bridge.authRequired ? '需要管理员授权' : bridge.available ? '设备服务已连接' : '设备服务未确认'}</span>
          <span className="monitoring-online">实时设备 {onlineCount === null ? '未确认' : `${onlineCount} / ${cameras.length}`}</span>
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
          <div><span>视频监控 / 16 路槽位</span><h1>实时视频墙</h1></div>
          <div className="monitoring-wall-controls">
            <span className="monitoring-selected-label">当前聚焦 {String(selectedChannel + 1).padStart(2, '0')} 路</span>
            <Button icon={<Cable size={16} />} onClick={() => navigate('device-bridges', selected?.id)}>管理绑定</Button>
            <Tooltip title="当前接入仅提供视频，尚无可用的 AI 研判服务"><span><Button disabled icon={<BrainCircuit size={16} />}>AI 研判</Button></span></Tooltip>
          </div>
        </div>
        {bridge.authRequired ? <BridgeLogin login={bridge.login} busy={bridge.busy} tokenConfigured={bridge.auth?.tokenConfigured} /> : <>
          {(bridge.error || (bridge.updatedAt > 0 && !bridge.available)) && <Alert className="bridge-video-alert" type="warning" showIcon title={bridge.error || '设备状态已过期，视频预览已暂停'} />}
          <section className="monitoring-video-wall" aria-label="十六路监控视频墙">
            {bindings.map((id, index) => {
              const camera = cameras.find((device) => device.id === id);
              const focused = selectedChannel === index;
              const fresh = previewAvailable && camera && hasFreshFrame(camera, bridge.now);
              return <article key={`slot-${index}-${id ?? 'empty'}`} className={`monitoring-tile ${focused ? 'selected' : ''}`}>
                <BridgePreview device={camera} available={previewAvailable} authorized={bridge.previewReady} epoch={bridge.previewEpoch} compact />
                <div className="monitoring-tile-meta">
                  <span><i className={fresh ? 'online' : ''} />{String(index + 1).padStart(2, '0')} 路</span>
                  <button className="monitoring-feed-name" type="button" aria-label={`聚焦第 ${index + 1} 路${camera ? ` ${camera.name}` : ''}`} aria-pressed={focused} onClick={() => setSelectedChannel(index)}><strong>{camera?.name ?? (id ? '绑定设备不可用' : bridge.inventory ? '未绑定' : '槽位尚未读取')}</strong></button>
                  <small>{camera ? bridgeKindLabels[camera.kind] : id ? '配置待确认' : '无视频源'}</small>
                </div>
                <div className="bridge-wall-slot-actions">
                  <span>{fresh && camera && typeof camera.fps === 'number' ? `解码 ${Number(camera.fps.toFixed(1))} fps` : '解码帧率未测得'}</span>
                  <Tooltip title={`管理第 ${index + 1} 路绑定`}><Button type="text" size="small" aria-label={`管理第 ${index + 1} 路绑定`} icon={<Cable size={14} />} onClick={() => navigate('device-bridges', camera?.id)} /></Tooltip>
                  <Tooltip title={`放大第 ${index + 1} 路`}><Button type="text" size="small" disabled={!camera} aria-label={`放大第 ${index + 1} 路`} icon={<Maximize2 size={14} />} onClick={() => { setSelectedChannel(index); setFocusOpen(true); }} /></Tooltip>
                </div>
                {focused && <span className="monitoring-focus-mark"><Eye size={13} />聚焦</span>}
              </article>;
            })}
          </section>
          <section className="bridge-wall-focus" aria-label="当前聚焦设备">
            <strong>{String(selectedChannel + 1).padStart(2, '0')} 路 · {selected?.name ?? (bindings[selectedChannel] ? '绑定设备不可用' : '未绑定设备')}</strong>
            <span>分辨率 {bridge.available && selected?.width && selected.height ? `${selected.width} × ${selected.height}` : '未测得'}</span>
            <span>最近帧 {selected && Number.isFinite(frameTime(selected.lastFrameAt)) ? new Date(frameTime(selected.lastFrameAt)).toLocaleString('zh-CN', { hour12: false }) : '未记录'}</span>
            <Button size="small" disabled={!selected} icon={<Maximize2 size={14} />} onClick={() => setFocusOpen(true)}>聚焦画面</Button>
          </section>
        </>}
      </section>
      <Modal open={focusOpen && !bridge.authRequired} onCancel={() => setFocusOpen(false)} footer={null} width={1000} destroyOnHidden
        title={`${String(selectedChannel + 1).padStart(2, '0')} 路 · ${selected?.name ?? '设备不可用'}`} className="bridge-focus-modal" getContainer={() => root.current ?? document.body}>
        <BridgePreview device={selected} available={previewAvailable} authorized={bridge.previewReady} epoch={bridge.previewEpoch} />
      </Modal>
    </main>
  </ConfigProvider>;
}
