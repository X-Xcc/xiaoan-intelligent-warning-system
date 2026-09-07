import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Slider, Switch, Tooltip } from 'antd';
import { Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import type { CommandEvent, CommandResponse, CommandStage } from '../../lib/command-workflow';
import { stageVoice, voiceChanges, voiceTexts, type VoiceCue } from '../../lib/command-voice';

export function CommandVoice({ snapshot, events, stage, playback, online, eventId }: {
  snapshot: CommandResponse | null; events: CommandEvent[]; stage: CommandStage;
  playback: boolean; online: boolean; eventId?: string | null;
}) {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [caption, setCaption] = useState('');
  const [issue, setIssue] = useState('');
  const [volume, setVolume] = useState(80);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<VoiceCue[]>([]);
  const last = useRef<VoiceCue | null>(null);
  const previous = useRef<CommandResponse | null>(snapshot);
  const queueIds = useRef<Set<string> | null>(null);
  const release = useRef<(() => void) | null>(null);
  const fallbackChannel = useRef<BroadcastChannel | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const stop = useCallback(() => {
    generation.current++;
    queue.current = [];
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current.removeAttribute('src');
      audio.current = null;
    }
    setPlaying(false); setPaused(false);
  }, []);
  const disable = useCallback(() => {
    active.current = false; stop(); release.current?.(); release.current = null;
    setEnabled(false);
  }, [stop]);
  const playNext = useCallback(function next() {
    if (!active.current || audio.current) return;
    const cue = queue.current.shift();
    if (!cue) { setPlaying(false); return; }
    const player = new Audio(`${import.meta.env.BASE_URL}command/voice-preview/yaoyao/${cue}.wav`);
    audio.current = player;
    const version = generation.current;
    player.volume = volumeRef.current / 100;
    last.current = cue; setCaption(voiceTexts[cue]); setIssue(''); setPlaying(true); setPaused(false);
    const failed = () => {
      if (version !== generation.current || !mounted.current) return;
      queue.current = []; audio.current = null; player.pause();
      setPlaying(false); setIssue('语音未能播放，请点击重播；字幕已保留');
    };
    player.onerror = failed;
    player.onended = () => {
      if (version !== generation.current || !mounted.current) return;
      audio.current = null; next();
    };
    void player.play().catch(failed);
  }, []);
  const enqueue = useCallback((cues: VoiceCue[]) => {
    if (!active.current) return;
    queue.current.push(...cues);
    // Keep delayed speech bounded instead of reading an old backlog indefinitely.
    queue.current = queue.current.slice(-8);
    playNext();
  }, [playNext]);
  const enable = () => {
    if (pending) return;
    if (!navigator.locks) {
      if (!fallbackChannel.current) { setIssue('当前浏览器无法协调语音窗口，请使用新版 Edge 或 Chrome'); return; }
      // HTTP cannot use Web Locks. Ask other same-origin players to stop.
      // This is cooperative coordination, not a cross-tab atomic lock.
      fallbackChannel.current.postMessage({ type: 'claim' });
      active.current = true; setEnabled(true); setIssue('');
      previous.current = snapshot;
      queueIds.current = online ? new Set(events.map((event) => event.id)) : null;
      if (playback) { const cue = stageVoice(stage); if (cue) enqueue([cue]); }
      return;
    }
    setPending(true); setIssue('');
    void navigator.locks.request('cicsic-command-voice', { ifAvailable: true }, async (lock) => {
      if (!mounted.current) return;
      setPending(false);
      if (!lock) { setIssue('另一个工作台已启用语音，请先在那里关闭'); return; }
      active.current = true; setEnabled(true);
      previous.current = snapshot;
      queueIds.current = online ? new Set(events.map((event) => event.id)) : null;
      if (playback) { const cue = stageVoice(stage); if (cue) enqueue([cue]); }
      await new Promise<void>((resolve) => { release.current = resolve; });
    }).catch(() => {
      if (mounted.current) { setPending(false); setIssue('语音控制启动失败，请重试'); }
    });
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current = false; stop(); release.current?.(); };
  }, [stop]);
  useEffect(() => {
    if (navigator.locks || typeof BroadcastChannel === 'undefined') return;
    const connection = new BroadcastChannel('cicsic-command-voice-http');
    fallbackChannel.current = connection;
    connection.onmessage = (message) => {
      if (message.data?.type === 'claim' && active.current) {
        disable(); setIssue('语音已切换到另一个工作台');
      }
    };
    return () => { connection.close(); fallbackChannel.current = null; };
  }, [disable]);
  useEffect(() => {
    window.addEventListener('pagehide', disable);
    return () => window.removeEventListener('pagehide', disable);
  }, [disable]);
  useEffect(() => {
    stop(); last.current = null; setCaption(''); setIssue('');
    previous.current = null;
  }, [eventId, stop]);
  useEffect(() => { if (audio.current) audio.current.volume = volume / 100; }, [volume]);
  useEffect(() => {
    if (!snapshot || snapshot.event.id !== eventId || playback || !online) return;
    const cues = voiceChanges(previous.current, snapshot);
    previous.current = snapshot;
    enqueue(cues);
  }, [snapshot, eventId, playback, online, enqueue]);
  useEffect(() => {
    if (playback || !online) return;
    const ids = new Set(events.map((event) => event.id));
    if (queueIds.current && events.some((event) => !queueIds.current!.has(event.id) && event.status === '已提交'))
      enqueue(['new-incident']);
    queueIds.current = ids;
  }, [events, playback, online, enqueue]);
  useEffect(() => {
    if (!playback) return;
    stop(); last.current = null; setCaption('');
    const cue = stageVoice(stage);
    if (cue) enqueue([cue]);
  }, [stage, playback, enqueue, stop]);
  useEffect(() => {
    if (!online && !playback) { stop(); previous.current = null; queueIds.current = null; }
  }, [online, playback, stop]);
  const replay = () => {
    const cue = last.current || (playback ? stageVoice(stage) : null);
    if (cue) { stop(); enqueue([cue]); }
  };
  return <section className="command-voice" aria-label="小安瑶瑶语音">
    <Volume2 size={18} /><strong>小安 · 瑶瑶</strong>
    <Switch aria-label="启用小安语音" checked={enabled} loading={pending} onChange={(on) => on ? enable() : disable()} />
    <Tooltip title={paused ? '继续播报' : '暂停播报'}><Button aria-label={paused ? '继续播报' : '暂停播报'}
      disabled={!playing} icon={paused ? <Play size={16} /> : <Pause size={16} />} onClick={() => {
        if (!audio.current) return;
        if (paused) void audio.current.play().then(() => setPaused(false)).catch(() => setIssue('无法继续，请重播'));
        else { audio.current.pause(); setPaused(true); }
      }} /></Tooltip>
    <Tooltip title="停止当前播报"><Button aria-label="停止当前播报" icon={<Square size={16} />} disabled={!playing} onClick={stop} /></Tooltip>
    <Tooltip title="重播"><Button aria-label="重播小安语音" icon={<RotateCcw size={16} />} disabled={!enabled || (!last.current && !(playback && stageVoice(stage)))} onClick={replay} /></Tooltip>
    <Slider aria-label="小安语音音量" min={0} max={100} value={volume} onChange={setVolume} />
    <span className="command-voice-mode">{playback ? '教学台词' : '业务回执'} · {enabled ? '已启用' : '已关闭'}{!navigator.locks && ' · HTTP兼容'}</span>
    <p role="status" aria-live="polite">{issue || caption || (playback && stage === 'b4' ? '现场清点' : '待播报')}</p>
  </section>;
}
