import { useEffect, useRef, useState } from 'react';
import { appBasePath } from '../lib/presentation';
import { gazeFromPointer, sampleMotion, smoothValue, type AssistantPhase, type MotionPose } from '../lib/xiaoan-motion';

const assetRoot = `${appBasePath}/xiaoan-assistant`;
const names = ['head', 'arm', 'relaxed-arm', 'legs', 'body', 'eye-left', 'eye-right', 'mouth'] as const;
type Layer = typeof names[number];
type Layers = Record<Layer, HTMLImageElement>;
let assets: Promise<Layers> | undefined;

function loadLayers() {
  assets ??= Promise.all(names.map(name => new Promise<[Layer, HTMLImageElement]>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([name, image]);
    image.onerror = reject;
    image.src = name === 'mouth' || name.startsWith('eye-')
      ? `${assetRoot}/rig/${name}.webp`
      : `${assetRoot}/matte/rig/${name}.png`;
  }))).then(entries => Object.fromEntries(entries) as Layers).catch(error => {
    assets = undefined;
    throw error;
  });
  return assets;
}

type Props = { phase: AssistantPhase; active: boolean };

export function XiaoanAvatar({ phase, active }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ phase, since: performance.now() });
  const [ready, setReady] = useState(false);

  useEffect(() => { state.current = { phase, since: performance.now() }; }, [phase]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    let disposed = false;
    let frame = 0;
    let last = 0;
    let inView = true;
    let layers: Layers | undefined;
    let gaze = { x: 0, y: 0 };
    let pointerTime = 0;
    let pose = sampleMotion(0, 'idle', 0, gaze, true);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const start = performance.now() - 1500;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = element.clientWidth;
    const height = element.clientHeight;
    element.width = Math.round(width * dpr);
    element.height = Math.round(height * dpr);

    function joint(name: Layer, x: number, y: number, angle = 0, sx = 1, sy = 1) {
      if (!ctx || !layers) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle * Math.PI / 180);
      ctx.scale(sx, sy);
      ctx.drawImage(layers[name], -x, -y);
      ctx.restore();
    }

    function draw(next: MotionPose) {
      if (!ctx || !layers || !element) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(width / 530, height / 1080);
      ctx.translate((width - 371 * scale) / 2, height - 1028 * scale);
      ctx.scale(scale, scale);
      ctx.save();
      ctx.fillStyle = 'rgba(36, 57, 47, .1)';
      ctx.beginPath();
      ctx.ellipse(191, 995, 137, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      joint('legs', 195, 645, next.lean * -.18);
      ctx.translate(195, 645);
      ctx.rotate(next.lean * Math.PI / 180);
      ctx.scale(1, next.breath);
      ctx.translate(-195, -645);
      joint('relaxed-arm', 292, 351, next.relaxedArm);
      joint('body', 195, 645);
      joint('arm', 117, 329, next.arm);
      ctx.translate(195, 285 + next.headY);
      ctx.rotate(next.head * Math.PI / 180);
      ctx.translate(-195, -285);
      joint('head', 195, 285);
      for (const [name, x, y] of [['eye-left', 157, 181], ['eye-right', 231, 180]] as const) {
        ctx.save();
        ctx.translate(next.gazeX, next.gazeY);
        joint(name, x, y, 0, 1, Math.max(.025, next.blink));
        ctx.restore();
        if (next.blink < .18) {
          ctx.strokeStyle = '#704735';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 16, y);
          ctx.quadraticCurveTo(x, y + 5, x + 17, y);
          ctx.stroke();
        }
      }
      joint('mouth', 197, 232, 0, 1 + (next.mouth - .55) * .06, next.mouth);
      ctx.restore();
      element.dataset.blink = next.blink.toFixed(2);
      element.dataset.gazeX = next.gazeX.toFixed(2);
      element.dataset.arm = next.arm.toFixed(2);
      element.dataset.mouth = next.mouth.toFixed(2);
    }

    function tick(now: number) {
      frame = 0;
      if (disposed || !layers || !element) return;
      const running = active && inView && !document.hidden && !reduced.matches;
      const effectiveGaze = now - pointerTime < 3500 ? gaze : { x: 0, y: 0 };
      const target = sampleMotion(now - start, state.current.phase, now - state.current.since, effectiveGaze, reduced.matches);
      if (reduced.matches) pose = target;
      else {
        const dt = last ? Math.min((now - last) / 1000, .05) : .016;
        for (const key of Object.keys(target) as (keyof MotionPose)[]) {
          pose[key] = key === 'blink' ? target[key] : smoothValue(pose[key], target[key], dt);
        }
      }
      last = now;
      draw(pose);
      element.dataset.animation = reduced.matches ? 'reduced' : running ? 'running' : 'paused';
      if (running) frame = requestAnimationFrame(tick);
    }
    function resume() {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      if (!disposed && layers) tick(performance.now());
    }
    const track = (event: globalThis.PointerEvent) => {
      if (event.pointerType === 'touch' || !active) return;
      const rect = element.getBoundingClientRect();
      gaze = gazeFromPointer(event.clientX, event.clientY, rect.x + rect.width / 2, rect.y + rect.height * .23);
      pointerTime = performance.now();
    };
    const resetGaze = () => { gaze = { x: 0, y: 0 }; };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      resume();
    });
    observer.observe(element);
    document.addEventListener('pointermove', track, { passive: true });
    document.addEventListener('pointerleave', resetGaze);
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener('change', resume);
    void loadLayers().then(loaded => {
      if (disposed) return;
      layers = loaded;
      setReady(true);
      resume();
    }).catch(() => { if (!disposed) setReady(false); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('pointermove', track);
      document.removeEventListener('pointerleave', resetGaze);
      document.removeEventListener('visibilitychange', resume);
      reduced.removeEventListener('change', resume);
    };
  }, [active]);

  return <span className="xiaoan-avatar">
    {!ready && <img className="xiaoan-avatar-fallback" src={`${assetRoot}/matte/reference-cutout.png`} alt="" draggable={false} />}
    <canvas ref={canvas} className={ready ? 'is-ready' : ''} role="img" aria-label="小安卡通警务助手" data-testid="xiaoan-avatar" />
  </span>;
}
