import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, Square, Volume2, VolumeX } from 'lucide-react';
import { DOCUMENT_VOICE_CUES, type XiaoanCue } from '../lib/xiaoan-voice-rules';

type Voice = {
  enabled: boolean;
  playing: boolean;
  caption: string;
  error: string;
  setEnabled: (enabled: boolean) => void;
  speak: (cue: XiaoanCue, eventKey: string) => Promise<boolean>;
  stop: () => void;
  replay: () => void;
};
const VoiceContext = createContext<Voice>({
  enabled: false, playing: false, caption: '', error: '',
  setEnabled() {}, speak: async () => false, stop() {}, replay() {},
});

export function XiaoanVoiceProvider({ children }: { children: ReactNode }) {
  const [enabled, updateEnabled] = useState(false);
  const enabledRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
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
  const value = useMemo(() => ({ enabled, playing, caption, error, setEnabled, speak, stop, replay }),
    [enabled, playing, caption, error, setEnabled, speak, stop, replay]);
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
