import {
  ArrowUp, ArrowUpRight, BookOpenText, Check, ChevronDown, ClipboardList,
  Info, MessageCircle, RotateCcw, ShieldCheck, Sparkles, Square, Volume2, VolumeX, X,
} from 'lucide-react';
import { Popover, Tooltip } from 'antd';
import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent, type PointerEvent,
} from 'react';
import { XiaoanAvatar } from './XiaoanAvatar';
import { nextStreamStep, type AssistantPhase } from '../lib/xiaoan-motion';
import { trainingEntryPath } from '../lib/training-navigation';
import {
  ASSISTANT_PROMPTS, ASSISTANT_SIZE, ASSISTANT_STORAGE_KEY,
  clampPosition, demoReply, parsePosition, snapPosition,
  type AssistantPosition, type AssistantReply,
} from '../lib/xiaoan-assistant';
import '../styles/xiaoan-assistant.css';

type Message = { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; reply: AssistantReply; shown: number; status: 'streaming' | 'complete' | 'stopped' };
type Drag = {
  id: number; startX: number; startY: number;
  origin: AssistantPosition; latest: AssistantPosition; moved: boolean;
};
type Props = { visible: boolean; onVisibilityChange: (visible: boolean) => void };

const promptIcons = [ClipboardList, BookOpenText, ShieldCheck];
const phaseLabels: Record<AssistantPhase, string> = {
  idle: '小安', greeting: '你好呀', dragging: '慢慢来',
  thinking: '让我想想', answering: '正在回答', listening: '我在听',
};
const fullReply = (reply: AssistantReply) => [reply.title, ...reply.lines].join('\n\n');
const disclosure = <p className="xiaoan-about">当前为本地交互原型。对话由预设规则模拟，未连接 AI 模型，也不读取或修改真实业务数据。</p>;
const welcomeSpeech = '你好，我是小安，有什么可以帮您？';

function initialPosition(): AssistantPosition {
  try {
    const saved = parsePosition(localStorage.getItem(ASSISTANT_STORAGE_KEY), innerWidth, innerHeight);
    if (saved) return saved;
  } catch { /* Storage can be unavailable in embedded or private contexts. */ }
  return clampPosition({ x: innerWidth - ASSISTANT_SIZE.width - 24, y: innerHeight - ASSISTANT_SIZE.height - 28 }, innerWidth, innerHeight);
}

function storePosition(position: AssistantPosition) {
  try { localStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(position)); } catch { /* Keep the pet usable without persistence. */ }
}

export function XiaoanAssistant({ visible, onVisibilityChange }: Props) {
  const [position, setPosition] = useState(initialPosition);
  const positionRef = useRef(position);
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight });
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<AssistantPhase>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem('xiaoan-assistant:muted:v1') === '1'; } catch { return false; }
  });
  const mutedRef = useRef(muted);
  const [greetingVisible, setGreetingVisible] = useState(false);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const busyRef = useRef(false);
  const responsePhase = useRef<AssistantPhase>('thinking');
  const replyGeneration = useRef(0);
  const replyTimer = useRef<number | null>(null);
  const phaseTimer = useRef<number | null>(null);
  const welcomeSpeechTimer = useRef<number | null>(null);
  const nextId = useRef(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);

  const move = useCallback((next: AssistantPosition, persist = false) => {
    const clamped = clampPosition(next, innerWidth, innerHeight);
    positionRef.current = clamped;
    setPosition(clamped);
    if (persist) storePosition(clamped);
  }, []);

  const animate = useCallback((next: AssistantPhase, duration = 0) => {
    if (phaseTimer.current !== null) clearTimeout(phaseTimer.current);
    phaseTimer.current = null;
    setPhase(next);
    if (duration) phaseTimer.current = window.setTimeout(() => {
      setPhase(busyRef.current ? responsePhase.current : 'idle');
      phaseTimer.current = null;
    }, duration);
  }, []);

  const cancelReply = useCallback(() => {
    replyGeneration.current++;
    if (replyTimer.current !== null) clearTimeout(replyTimer.current);
    replyTimer.current = null;
    busyRef.current = false;
    setBusy(false);
    setMessages(current => current.map(message => message.role === 'assistant' && message.status === 'streaming'
      ? { ...message, status: 'stopped' } : message));
  }, []);

  const cancelWelcomeSpeech = useCallback(() => {
    if (welcomeSpeechTimer.current !== null) clearTimeout(welcomeSpeechTimer.current);
    welcomeSpeechTimer.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      try { localStorage.setItem('xiaoan-assistant:muted:v1', next ? '1' : '0'); } catch { /* Storage is optional. */ }
      if (next) window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  useEffect(() => {
    const resize = () => {
      setViewport({ width: innerWidth, height: innerHeight });
      move(positionRef.current, true);
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [move]);

  useEffect(() => () => {
    replyGeneration.current++;
    if (replyTimer.current !== null) clearTimeout(replyTimer.current);
    if (phaseTimer.current !== null) clearTimeout(phaseTimer.current);
    cancelWelcomeSpeech();
  }, [cancelWelcomeSpeech]);

  useEffect(() => {
    if (!visible) {
      cancelReply();
      setOpen(false);
      setGreetingVisible(false);
      drag.current = null;
      animate('idle');
    }
  }, [visible, cancelReply, animate]);

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) { setGreetingVisible(false); cancelWelcomeSpeech(); return; }
    welcomeSpeechTimer.current = window.setTimeout(() => {
      welcomeSpeechTimer.current = null;
      setGreetingVisible(true);
      if (mutedRef.current) return;
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
      const utterance = new SpeechSynthesisUtterance(welcomeSpeech);
      utterance.lang = 'zh-CN';
      utterance.rate = .95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }, 1000);
    return cancelWelcomeSpeech;
  }, [open, cancelWelcomeSpeech]);

  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, busy, open]);

  const closePanel = useCallback(() => {
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closePanel(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, closePanel]);

  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    suppressClick.current = false;
    drag.current = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      origin: positionRef.current, latest: positionRef.current, moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    current.moved = true;
    current.latest = clampPosition({
      x: current.origin.x + dx, y: current.origin.y + dy,
    }, innerWidth, innerHeight);
    animate('dragging');
    move(current.latest);
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    suppressClick.current = current.moved || cancelled;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.moved) move(snapPosition(current.latest, innerWidth, innerHeight), true);
    animate(busyRef.current ? responsePhase.current : 'idle');
  };

  const launcherKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    move({ x: positionRef.current.x + delta[0], y: positionRef.current.y + delta[1] }, true);
  };

  const submit = (value: string) => {
    const text = value.trim().slice(0, 200);
    if (!text || busyRef.current) return;
    busyRef.current = true;
    responsePhase.current = 'thinking';
    const generation = ++replyGeneration.current;
    setBusy(true);
    setDraft('');
    setMessages(current => [...current.slice(-18), { id: ++nextId.current, role: 'user', text }]);
    animate('thinking');
    const previous = [...messages].reverse().find(message => message.role === 'assistant');
    const reply = demoReply(text, previous?.role === 'assistant' ? previous.reply : undefined);
    const total = fullReply(reply).length;
    replyTimer.current = window.setTimeout(() => {
      if (generation !== replyGeneration.current) return;
      const id = ++nextId.current;
      let cursor = 0;
      responsePhase.current = 'answering';
      animate('answering');
      setMessages(current => [...current, { id, role: 'assistant', reply, shown: 0, status: 'streaming' }]);
      const stream = () => {
        if (generation !== replyGeneration.current) return;
        cursor = nextStreamStep(cursor, total);
        const finished = cursor === total;
        setMessages(current => current.map(message => message.id === id && message.role === 'assistant'
          ? { ...message, shown: cursor, status: finished ? 'complete' : 'streaming' } : message));
        if (finished) {
          replyTimer.current = null;
          busyRef.current = false;
          setBusy(false);
          animate('greeting', 1800);
        } else {
          const punctuation = /[。！？：\n]/.test(fullReply(reply)[cursor - 1]);
          replyTimer.current = window.setTimeout(stream, punctuation ? 130 : 42);
        }
      };
      stream();
    }, 620 + Math.min(text.length * 9, 400));
  };

  const reset = () => {
    cancelReply();
    setMessages([]);
    setDraft('');
    animate('greeting', 1100);
    input.current?.focus();
  };

  if (!visible) return null;
  const compact = viewport.width < 600;
  const avatarPhase = phase === 'idle' && open && inputFocused ? 'listening' : phase;
  const panelWidth = Math.min(368, viewport.width - 24);
  const proposedLeft = position.x > viewport.width / 2
    ? position.x - panelWidth - 14 : position.x + ASSISTANT_SIZE.width + 14;
  const panelLeft = compact ? 12 : Math.max(12, Math.min(proposedLeft, viewport.width - panelWidth - 12));
  const panelHeight = Math.min(546, Math.max(0, viewport.height - 96));
  const panelBottom = compact ? 12 : Math.max(12, Math.min(
    viewport.height - position.y - ASSISTANT_SIZE.height,
    viewport.height - panelHeight - 76,
  ));
  const panelStyle: CSSProperties = { left: panelLeft, bottom: panelBottom, width: panelWidth };

  return <>
    <div
      className={`xiaoan-assistant-pet ${open && compact ? 'is-concealed' : ''} ${greetingVisible ? 'is-greeting' : ''}`}
      data-testid="xiaoan-pet" data-phase={avatarPhase} data-artwork-mode="reference-derived-cutout-rig"
      style={{ left: position.x, top: position.y, width: ASSISTANT_SIZE.width, height: ASSISTANT_SIZE.height }}
    >
      <div className="xiaoan-pet-tools">
        <Tooltip title="收起小安"><button type="button" aria-label="收起小安" onClick={() => onVisibilityChange(false)}><X size={13} /></button></Tooltip>
      </div>
      <button
        ref={launcher} type="button" className="xiaoan-pet-launcher"
        aria-label={open ? '收起小安对话' : '打开小安助手'} aria-expanded={open}
        aria-controls="xiaoan-assistant-dialog" title="小安助手 · 拖动调整位置"
        onPointerDown={beginDrag} onPointerMove={continueDrag}
        onPointerUp={event => endDrag(event)}
        onPointerCancel={event => endDrag(event, true)}
        onLostPointerCapture={event => { if (drag.current) endDrag(event, true); }}
        onKeyDown={launcherKey}
        onClick={event => {
          if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; }
          setOpen(value => !value);
          if (!busyRef.current) animate('greeting', 1800);
        }}
      >
        <XiaoanAvatar phase={avatarPhase} active={!(open && compact)} />
        <span className="xiaoan-pet-caption"><i /><strong>{phaseLabels[avatarPhase]}</strong><MessageCircle size={12} /></span>
      </button>
      <Tooltip title={muted ? '打开小安语音' : '静音小安语音'}>
        <button type="button" className="xiaoan-pet-mute" aria-label={muted ? '打开小安语音' : '静音小安语音'} aria-pressed={muted} onClick={toggleMute}>
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
      </Tooltip>
      {greetingVisible && <div className="xiaoan-greeting-bubble" role="status">{welcomeSpeech}</div>}
    </div>

    {open && <section
      id="xiaoan-assistant-dialog" className="xiaoan-assistant-panel"
      role="dialog" aria-modal="false" aria-labelledby="xiaoan-dialog-title" style={panelStyle}
    >
      <header className="xiaoan-panel-header">
        <span className="xiaoan-panel-brand"><ShieldCheck size={20} /></span>
        <div className="xiaoan-header-copy"><h2 id="xiaoan-dialog-title">小安 <span>智能助手</span></h2><p><i />{busy ? phase === 'thinking' ? '正在整理思路' : '正在回答你的问题' : draft ? '我在，慢慢说' : '有什么我可以帮你？'}</p></div>
        <Popover title="关于小安" content={disclosure} trigger="click">
          <button type="button" className="xiaoan-icon-button" aria-label="关于小安" title="关于小安"><Info size={15} /></button>
        </Popover>
        <Tooltip title="重新开始"><button type="button" className="xiaoan-icon-button" aria-label="重新开始小安对话" onClick={reset}><RotateCcw size={15} /></button></Tooltip>
        <Tooltip title="收起对话"><button type="button" className="xiaoan-icon-button" aria-label="收起小安对话面板" onClick={closePanel}><ChevronDown size={18} /></button></Tooltip>
      </header>

      <div ref={transcript} className="xiaoan-transcript" role="log" aria-label="小安对话" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
        {!messages.length && <div className="xiaoan-welcome">
          <span className="xiaoan-welcome-kicker">很高兴见到你</span>
          <h3>你好，我是小安。</h3>
          <p>从一份概览开始，<br />让今天的工作更有条理。</p>
          <div className="xiaoan-suggestions">
            {ASSISTANT_PROMPTS.map((prompt, index) => {
              const Icon = promptIcons[index];
              return <button type="button" key={prompt} onClick={() => submit(prompt)} disabled={busy}>
                <Icon size={17} /><span>{prompt}</span><ArrowUpRight size={15} />
              </button>;
            })}
          </div>
        </div>}
        {messages.map(message => {
          if (message.role === 'user') return <div className="xiaoan-message-user" key={message.id}><p>{message.text}</p></div>;
          const [title, ...paragraphs] = fullReply(message.reply).slice(0, message.shown).split('\n\n');
          return <article className="xiaoan-message-answer" key={message.id} data-status={message.status}>
            <span className="xiaoan-answer-author"><ShieldCheck size={14} />小安{message.status === 'complete' && <Check size={13} />}</span>
            <div className="xiaoan-answer-text"><h3>{title}</h3>
              {paragraphs.map((line, index) => <p key={index}>{line}</p>)}
            </div>
            {message.status === 'complete' && message.reply.trainingLinks?.length && <nav className="xiaoan-training-links" aria-label="推荐训练课程">
              {message.reply.trainingLinks.map(link => <a key={link.taskId} href={trainingEntryPath(link.taskId)}>
                <span>{link.label}</span><ArrowUpRight size={14} aria-hidden="true" />
              </a>)}
            </nav>}
            {message.status === 'stopped' && <small className="xiaoan-stopped">已停止回复</small>}
          </article>;
        })}
        {busy && phase === 'thinking' && <div className="xiaoan-thinking" role="status"><span><i /><i /><i /></span>正在整理思路</div>}
        <span className="xiaoan-sr-only" role="status">{busy ? phase === 'thinking' ? '' : '小安正在回复' : ''}</span>
      </div>

      {messages.length > 0 && <div className="xiaoan-followups" aria-label="继续对话">
        {['展开说说', '再简短一点', '今日训练方案'].map(prompt => <button type="button" key={prompt} disabled={busy} onClick={() => submit(prompt)}>{prompt}<ArrowUpRight size={11} /></button>)}
      </div>}
      <form className="xiaoan-composer" onSubmit={event => { event.preventDefault(); submit(draft); }}>
        <textarea
          ref={input} aria-label="给小安留言" placeholder="和小安说点什么…"
          value={draft} rows={2} maxLength={200} onChange={event => setDraft(event.target.value)}
          onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(draft);
            }
          }}
        />
        <div className="xiaoan-composer-actions">
          <span><Sparkles size={12} />{busy ? '正在回复' : '小安'}</span>
          {draft.length > 160 && <small aria-live="polite">{draft.length}/200</small>}
          {busy ? <Tooltip title="停止回复"><button type="button" className="xiaoan-send" aria-label="停止小安回复" onClick={() => { cancelReply(); animate('idle'); }}><Square size={13} /></button></Tooltip>
            : <Tooltip title="发送"><button type="submit" className="xiaoan-send" aria-label="发送给小安" disabled={!draft.trim()}><ArrowUp size={17} /></button></Tooltip>}
        </div>
      </form>
      <footer className="xiaoan-panel-footer">内容仅供参考，重要信息请核对</footer>
    </section>}
  </>;
}
