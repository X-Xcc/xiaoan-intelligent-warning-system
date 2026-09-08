import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, Square, Volume2, VolumeX } from 'lucide-react';
import { DOCUMENT_VOICE_CUES, type XiaoanCue } from '../lib/xiaoan-voice-rules';
import { DEMO_STAGES, demoStage, initialDemoState, nextDemoStage, previousDemoStage, type DemoStageId, type DemoState } from '../lib/demo-mode';

type Voice = {
  enabled: boolean;
  playing: boolean;
  caption: string;
  error: string;
  setEnabled: (enabled: boolean) => void;
  speak: (cue: XiaoanCue, eventKey: string) => Promise<boolean>;
  stop: () => void;
  replay: () => void;
  demo: DemoState & { current: ReturnType<typeof demoStage>; trigger: (stage: DemoStageId) => void; next: () => void; previous: () => void; toggle: () => void; reset: () => void };
};
const VoiceContext = createContext<Voice>({
  enabled: false, playing: false, caption: '', error: '',
  setEnabled() {}, speak: async () => false, stop() {}, replay() {}, demo: { ...initialDemoState(), current: demoStage('A1'), trigger() {}, next() {}, previous() {}, toggle() {}, reset() {} },
});

export function XiaoanVoiceProvider({ children }: { children: ReactNode }) {
  const [enabled, updateEnabled] = useState(false);
  const enabledRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(initialDemoState);
  const active = useRef<{ audio: HTMLAudioElement; settle: (ended: boolean) => void } | null>(null);
  const last = useRef<XiaoanCue | null>(null);
  const seen = useRef(new Set<string>());
  const channel = useRef<BroadcastChannel | null>(null);
  const stop = useCallback(() => {
    const current = active.current;
    if (current) {
      current.audio.pause();
      current.settle(false);
    }
    last.current = null;
    setCaption('');
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const bus = new BroadcastChannel('cicsic-xiaoan-voice');
      channel.current = bus;
      bus.onmessage = (event) => { if (event.data?.type === 'claim') stop(); };
    }
    return () => {
      active.current?.audio.pause();
      active.current?.settle(false);
      channel.current?.close();
      channel.current = null;
    };
  }, [stop]);

  const setEnabled = useCallback((value: boolean) => {
    enabledRef.current = value;
    updateEnabled(value);
    if (!value) stop();
  }, [stop]);

  const speak = useCallback((cue: XiaoanCue, eventKey: string): Promise<boolean> => {
    if (!enabledRef.current || !Object.prototype.hasOwnProperty.call(DOCUMENT_VOICE_CUES, cue)) return Promise.resolve(false);
    const key = `${cue}:${eventKey}`;
    if (seen.current.has(key)) return Promise.resolve(false);
    seen.current.add(key);
    if (seen.current.size > 256) seen.current.delete(seen.current.values().next().value!);
    stop();
    setError('');
    last.current = cue;
    setCaption(DOCUMENT_VOICE_CUES[cue]);
    channel.current?.postMessage({ type: 'claim' });
    return new Promise((resolve) => {
      let audio: HTMLAudioElement;
      try {
        audio = new Audio(`${import.meta.env.BASE_URL}command/voice/yaoyao/${cue}.wav`);
      } catch {
        setError('小安语音未能播放');
        resolve(false);
        return;
      }
      let settled = false;
      const settle = (ended: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        if (active.current?.audio === audio) active.current = null;
        setPlaying(false);
        resolve(ended);
      };
      const fail = () => {
        if (settled) return;
        setError('小安语音未能播放，请重试');
        settle(false);
      };
      const timeout = window.setTimeout(fail, 12000);
      active.current = { audio, settle };
      audio.playbackRate = 1.1;
      audio.volume = 0.85;
      audio.onended = () => settle(true);
      audio.onerror = fail;
      setPlaying(true);
      try { void audio.play().catch(fail); } catch { fail(); }
    });
  }, [stop]);
  const replay = useCallback(() => {
    if (last.current) void speak(last.current, `manual:${Date.now()}`);
  }, [speak]);
  const triggerDemo = useCallback((stage: DemoStageId) => {
    const item = demoStage(stage);
    setDemo((state) => ({ ...state, stage, revision: state.revision + 1 }));
    if (item.cue && Object.prototype.hasOwnProperty.call(DOCUMENT_VOICE_CUES, item.cue)) void speak(item.cue as XiaoanCue, `demo:${stage}:${demo.revision + 1}`);
  }, [demo.revision, speak]);
  const next = useCallback(() => triggerDemo(nextDemoStage(demo.stage)), [demo.stage, triggerDemo]);
  const previous = useCallback(() => triggerDemo(previousDemoStage(demo.stage)), [demo.stage, triggerDemo]);
  const toggle = useCallback(() => setDemo((state) => ({ ...state, running: !state.running })), []);
  const reset = useCallback(() => { stop(); setDemo(initialDemoState()); }, [stop]);
  useEffect(() => {
    const onDemoTrigger = (event: Event) => {
      const stage = (event as CustomEvent<DemoStageId>).detail;
      if (stage) triggerDemo(stage);
    };
    window.addEventListener('xiaoan-demo-trigger', onDemoTrigger);
    return () => window.removeEventListener('xiaoan-demo-trigger', onDemoTrigger);
  }, [triggerDemo]);
  useEffect(() => {
    if (!demo.running) return;
    const timer = window.setTimeout(() => {
      if (demo.stage === DEMO_STAGES[DEMO_STAGES.length - 1]?.id) { setDemo((state) => ({ ...state, running: false })); return; }
      next();
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [demo.running, demo.stage, next]);
  const value = useMemo(() => ({ enabled, playing, caption, error, setEnabled, speak, stop, replay,
    demo: { ...demo, current: demoStage(demo.stage), trigger: triggerDemo, next, previous, toggle, reset } }),
    [enabled, playing, caption, error, setEnabled, speak, stop, replay, demo, triggerDemo, next, previous, toggle, reset]);
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export const useXiaoanVoice = () => useContext(VoiceContext);

export function XiaoanVoiceControls() {
  const voice = useXiaoanVoice();
  return <div className="xiaoan-voice-controls" role="group" aria-label="小安语音">
    <button type="button" role="switch" aria-checked={voice.enabled}
      aria-label="小安语音开关" title={voice.enabled ? '关闭小安语音（瑶瑶）' : '开启小安语音（瑶瑶）'}
      onClick={() => voice.setEnabled(!voice.enabled)}>
      {voice.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
    </button>
    <button type="button" aria-label="停止小安语音" title="停止小安语音" disabled={!voice.playing} onClick={voice.stop}><Square size={14} /></button>
    <button type="button" aria-label="重播小安语音" title="重播小安语音" disabled={!voice.enabled || !voice.caption} onClick={voice.replay}><RotateCcw size={16} /></button>
    <span role="status" title={voice.error || voice.caption}>{voice.error || voice.caption}</span>
  </div>;
}

export function DemoModeControls({ onNavigate }: { onNavigate: (route: DemoStageId) => void }) {
  const { demo } = useXiaoanVoice();
  const move = (direction: 'previous' | 'next') => {
    const target = direction === 'next' ? nextDemoStage(demo.stage) : previousDemoStage(demo.stage);
    demo.trigger(target);
    onNavigate(target);
  };
  return <div className="xiaoan-demo-controls" role="group" aria-label="演示模式控制">
    <span className="xiaoan-demo-badge">演示</span>
    <span className="xiaoan-demo-stage" aria-live="polite">{demo.stage} · {demo.current.label}</span>
    <button type="button" aria-label="上一演示节点" title="上一节点" onClick={() => move('previous')}>‹</button>
    <button type="button" aria-label={demo.running ? '暂停演示' : '播放演示'} title={demo.running ? '暂停演示' : '播放演示'} onClick={demo.toggle}>{demo.running ? 'Ⅱ' : '▶'}</button>
    <button type="button" aria-label="下一演示节点" title="下一节点" onClick={() => move('next')}>›</button>
    <button type="button" aria-label="重置演示" title="重置演示" onClick={() => { demo.reset(); onNavigate('A1'); }}>↺</button>
  </div>;
}

export function XiaoanDemoStrip() {
  const { demo, caption } = useXiaoanVoice();
  return <div className="xiaoan-demo-strip" role="status" aria-live="polite">
    <span className="xiaoan-demo-strip-dot" />
    <strong>演示 {demo.stage}</strong>
    <span>{demo.current.label}</span>
    {caption && <b>{caption}</b>}
  </div>;
}
