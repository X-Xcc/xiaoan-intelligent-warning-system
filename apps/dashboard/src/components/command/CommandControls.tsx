import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Image } from 'lucide-react';
import { advanceControl, stages, type ControlState } from '../../lib/command-workflow';

export function CommandControls({ value, onChange }: { value: ControlState; onChange: (state: ControlState) => void }) {
  return <div className="command-controls" data-command-controls tabIndex={0} aria-label="演示控屏画布"
    onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest('input, textarea, select, button, [contenteditable="true"], [role="dialog"]')) return;
      const action = event.key === ' ' ? event.shiftKey ? 'next' : 'pause'
        : event.shiftKey && event.key === 'ArrowLeft' ? 'previous'
          : event.shiftKey && event.key.toLowerCase() === 'r' ? 'reset' : null;
      if (action) { event.preventDefault(); onChange(advanceControl(value, action)); }
      if (event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault(); onChange({ ...value, mode: 'playback', paused: true, reveal: 3, revision: value.revision + 1 });
      }
    }}>
    <nav aria-label="屏台阶段">{stages.map((stage, index) =>
      <button type="button" key={stage} aria-pressed={value.stage === stage}
        onClick={() => onChange({ ...value, stage, reveal: 0, revision: value.revision + 1 })}>
        {index < 4 ? `B${index + 1}` : '移交'}
      </button>)}</nav>
    <div className="command-control-tools">
      <button type="button" aria-label="上一步" title="上一步" onClick={() => onChange(advanceControl(value, 'previous'))}><ArrowLeft size={18} /></button>
      <button type="button" aria-label={value.paused ? '继续' : '暂停'} title={value.paused ? '继续' : '暂停'}
        onClick={() => onChange(advanceControl(value, 'pause'))}>{value.paused ? <Play size={18} /> : <Pause size={18} />}</button>
      <button type="button" aria-label="下一步" title="下一步" onClick={() => onChange(advanceControl(value, 'next'))}><ArrowRight size={18} /></button>
      <button type="button" aria-label="复位画面" title="复位画面" onClick={() => onChange(advanceControl(value, 'reset'))}><RotateCcw size={18} /></button>
      <button type="button" aria-label="教学备用页" title="教学备用页" onClick={() => onChange({
        ...value, mode: 'playback', paused: true, reveal: 3, revision: value.revision + 1,
      })}><Image size={18} /></button>
      <span>{value.reveal + 1} / 4</span>
    </div>
  </div>;
}
