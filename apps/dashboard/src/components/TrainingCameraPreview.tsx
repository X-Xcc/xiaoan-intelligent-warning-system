import { Camera, Maximize2, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBridgeInventory } from '../lib/device-bridges-api';
import { resolveTrainingCameras, type TrainingCamera } from '../lib/training-camera-sources';
import { BridgePreview } from './BridgePreview';
import { ThermalMonitor, type ThermalDisplayMode } from './ThermalMonitor';
import '../styles/device-bridges.css';

export function TrainingCameraPreview({ officer, teamName, subject }: {
  taskId: string; officer: string; teamName: string; subject?: string;
}) {
  const bridge = useBridgeInventory();
  const [retry, setRetry] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [mode, setMode] = useState<ThermalDisplayMode>('thermal');
  const [edges, setEdges] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const channels = resolveTrainingCameras(bridge.inventory, subject);
  const expandedChannel = channels.find(channel => channel.number === expanded);

  useEffect(() => {
    if (expanded !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [expanded]);

  function renderFeed(channel: TrainingCamera, enlarged = false) {
    const { device, number } = channel;
    if (channel.thermal) {
      return <>
        <ThermalMonitor key={`${device?.id ?? 'unbound'}:${retry[number] ?? 0}`}
          device={device} available={bridge.available && !bridge.busy} authorized={bridge.previewReady}
          epoch={`${bridge.previewEpoch}:${retry[number] ?? 0}`} compact={!enlarged}
          mode={mode} onModeChange={setMode} edges={edges} onEdgesChange={setEdges} />
        <p className="ot-monitor-caption">{channel.caption} · {mode === 'thermal' ? '伪彩热成像（模拟）' : '原始画面'}</p>
      </>;
    }

    return <>
      <BridgePreview key={`${device?.id ?? 'unbound'}:${retry[number] ?? 0}`}
        device={device} available={bridge.available && !bridge.busy}
        authorized={bridge.previewReady} epoch={bridge.previewEpoch} compact={!enlarged} />
      <p className="ot-monitor-caption">{channel.caption}</p>
    </>;
  }

  return <section className="ot-video-tool ot-training-monitors" aria-label="训练双路监控">
    <div className="ot-camera-identity"><Camera size={16} /><strong>{officer}</strong><span>{teamName}</span></div>
    {bridge.error && <p className="ot-inline-error" role="status">{bridge.error}</p>}
    <div className="ot-monitor-grid">
      {channels.map(channel => <section className="ot-monitor" key={channel.number} aria-label={channel.title}
        data-training-channel={channel.number} data-bridge-slot={channel.bindingSlot} data-source-device={channel.device?.id}>
        <header className="ot-monitor-heading">
          <h3><Camera size={16} />{channel.title}</h3>
          <div>
            <button type="button" className="ui-icon-button" title={`重连${channel.title}`} aria-label={`重连${channel.title}`}
              disabled={bridge.busy || bridge.refreshing}
              onClick={() => {
                setRetry(value => ({ ...value, [channel.number]: (value[channel.number] ?? 0) + 1 }));
                bridge.refresh();
              }}><RefreshCw size={15} /></button>
            <button type="button" className="ui-icon-button" title={`放大${channel.title}`} aria-label={`放大${channel.title}`}
              onClick={() => setExpanded(channel.number)}><Maximize2 size={15} /></button>
          </div>
        </header>
        {expanded === channel.number
          ? <div className="ot-monitor-locked">已在放大窗口显示</div>
          : renderFeed(channel)}
      </section>)}
    </div>
    <dialog ref={dialog} className="ot-monitor-dialog" aria-labelledby="ot-monitor-dialog-title"
      onCancel={() => setExpanded(null)} onClose={() => setExpanded(null)}>
      <header className="ot-monitor-heading">
        <h3 id="ot-monitor-dialog-title">{expandedChannel?.title}</h3>
        <button type="button" className="ui-icon-button" title="关闭画面" aria-label="关闭画面" onClick={() => setExpanded(null)}><X size={18} /></button>
      </header>
      {expandedChannel && renderFeed(expandedChannel, true)}
    </dialog>
  </section>;
}
