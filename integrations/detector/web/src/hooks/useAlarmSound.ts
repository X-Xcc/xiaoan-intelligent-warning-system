import { useEffect, useRef } from "react";

let alarmCtx: AudioContext | null = null;
let alarmTimer: ReturnType<typeof setInterval> | null = null;

function playAlarmTone(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.15);
  osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
}

export function startAlarmSound() {
  try {
    stopAlarmSound();
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    alarmCtx = new AudioCtx();
    if (alarmCtx.state === "suspended") {
      alarmCtx.resume();
    }
    playAlarmTone(alarmCtx);
    alarmTimer = setInterval(() => {
      if (alarmCtx) playAlarmTone(alarmCtx);
    }, 800);
  } catch { /* audio not supported */ }
}

export function stopAlarmSound() {
  if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
  if (alarmCtx) { alarmCtx.close().catch(() => {}); alarmCtx = null; }
}

/**
 * 声音报警 hook — isAlarming 变化时自动启停，unmount 时自动清理。
 * 和 Training.tsx ComparisonWindow 的 useEffect 模式一致。
 */
export function useAlarmSound(isAlarming: boolean) {
  const prev = useRef(false);
  useEffect(() => {
    if (isAlarming && !prev.current) startAlarmSound();
    if (!isAlarming && prev.current) stopAlarmSound();
    prev.current = isAlarming;
  }, [isAlarming]);
  useEffect(() => { return () => { stopAlarmSound(); }; }, []);
}
