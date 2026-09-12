import { Camera, Maximize2, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBridgeInventory } from '../lib/device-bridges-api';
import { BridgePreview } from './BridgePreview';
import '../styles/device-bridges.css';

const channels = [
  { slot: 1, title: '02路监控' },
  { slot: 2, title: '03路监控' },
];

export function TrainingCameraPreview({ officer, teamName }: { taskId: string; officer: string; teamName: string }) {
  const bridge = useBridgeInventory();
  const [retry, setRetry] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (expanded !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [expanded]);

  function renderFeed(slot: number, enlarged = false) {
    const id = bridge.inventory?.bindings[slot];
    const device = bridge.inventory?.items.find(item => item.id === id);
    return <>
      {<BridgePreview key={`${slot}:${retry[slot] ?? 0}`}
        device={device} available={bridge.available && !bridge.busy}
        authorized={bridge.previewReady} epoch={bridge.previewEpoch} compact={!enlarged} />}
      <p className="ot-monitor-caption">{device?.name ?? (!bridge.inventory ? '槽位尚未读取' : id ? '绑定设备不可用' : '未绑定设备')}</p>
    </>;
  }

  return <section className="ot-video-tool ot-training-monitors" aria-label="训练双路监控">
    <div className="ot-camera-identity"><Camera size={16} /><strong>{officer}</strong><span>{teamName}</span></div>
    {bridge.error && <p className="ot-inline-error" role="status">{bridge.error}</p>}
    <div className="ot-monitor-grid">
      {channels.map(channel => <section className="ot-monitor" key={channel.slot} aria-label={channel.title} data-bridge-slot={channel.slot + 1}>
        <header className="ot-monitor-heading">
          <h3><Camera size={16} />{channel.title}</h3>
          <div>
            <button type="button" className="ui-icon-button" title={`重连${channel.title}`} aria-label={`重连${channel.title}`}
              disabled={bridge.busy || bridge.refreshing}
              onClick={() => { setRetry(value => ({ ...value, [channel.slot]: (value[channel.slot] ?? 0) + 1 })); bridge.refresh(); }}><RefreshCw size={15} /></button>
            <button type="button" className="ui-icon-button" title={`放大${channel.title}`} aria-label={`放大${channel.title}`}
              onClick={() => setExpanded(channel.slot)}><Maximize2 size={15} /></button>
          </div>
        </header>
        {renderFeed(channel.slot)}
      </section>)}
    </div>
    <dialog ref={dialog} className="ot-monitor-dialog" onCancel={() => setExpanded(null)} onClose={() => setExpanded(null)}>
      <header className="ot-monitor-heading">
        <h3>{channels.find(channel => channel.slot === expanded)?.title}</h3>
        <button type="button" className="ui-icon-button" title="关闭画面" aria-label="关闭画面" onClick={() => setExpanded(null)}><X size={18} /></button>
      </header>
      {expanded !== null && renderFeed(expanded, true)}
    </dialog>
  </section>;
}
