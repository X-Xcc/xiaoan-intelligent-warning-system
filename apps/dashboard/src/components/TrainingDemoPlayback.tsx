import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from 'antd';

export function TrainingDemoPlayback({ subject }: { subject: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let animation = 0;
    let previous = 0;
    const draw = (now: number) => {
      if (playing && previous) timeRef.current = (timeRef.current + Math.min(50, now - previous)) % 12000;
      previous = now;
      const t = timeRef.current / 1000;
      ctx.fillStyle = '#ecf2f1';
      ctx.fillRect(0, 0, 960, 540);
      ctx.fillStyle = '#d9e7e3';
      ctx.fillRect(0, 342, 960, 198);
      ctx.strokeStyle = '#b7d0c8';
      ctx.lineWidth = 1;
      for (let x = -480; x < 1440; x += 96) {
        ctx.beginPath(); ctx.moveTo(480 + (x - 480) * .4, 342); ctx.lineTo(x, 540); ctx.stroke();
      }
      for (let y = 352; y < 540; y += 36) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(960, y); ctx.stroke();
      }
      ctx.strokeStyle = '#4e9c85';
      ctx.lineWidth = 3;
      ctx.strokeRect(240, 375, 480, 100);
      const shift = Math.sin(t * 1.4) * 22;
      const lift = Math.sin(t * 2) * 30;
      const cx = 480 + shift;
      const segment = (x1: number, y1: number, x2: number, y2: number, color: string, width: number) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      };
      ctx.fillStyle = '#bdcfc9';
      ctx.beginPath(); ctx.ellipse(cx, 452, 85, 15, 0, 0, Math.PI * 2); ctx.fill();
      segment(cx - 18, 323, cx - 37 - lift * .2, 438, '#3c7778', 23);
      segment(cx + 18, 323, cx + 39 + lift * .2, 438, '#3c7778', 23);
      segment(cx, 232, cx, 323, '#237e6c', 65);
      segment(cx - 38, 237, cx - 79, 282 + lift, '#4a9090', 19);
      segment(cx - 79, 282 + lift, cx - 52, 317 + lift, '#4a9090', 16);
      segment(cx + 38, 237, cx + 76, 274 - lift, '#4a9090', 19);
      segment(cx + 76, 274 - lift, cx + 44, 285 - lift * 2, '#4a9090', 16);
      ctx.fillStyle = '#568b87';
      ctx.beginPath(); ctx.arc(cx, 183, 29, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#edf7f3';
      ctx.fillRect(cx - 19, 257, 38, 8);
      ctx.fillStyle = '#293c42';
      ctx.font = '600 22px sans-serif';
      ctx.fillText('SYNTHETIC TRAINING / DEMO', 35, 46);
      ctx.fillStyle = '#647b78';
      ctx.font = '16px monospace';
      ctx.fillText(`DEMO CLIP   00:${String(Math.floor(t)).padStart(2, '0')} / 00:12`, 35, 77);
      ctx.fillStyle = '#fff';
      ctx.fillRect(742, 156, 177, 155);
      ctx.fillStyle = '#247962';
      ctx.font = '600 17px sans-serif';
      ctx.fillText('SIMULATION', 760, 188);
      ctx.fillStyle = '#56706a';
      ctx.font = '16px monospace';
      ctx.fillText('STEP   03 / 03', 760, 227);
      ctx.fillText('SCORE  091', 760, 259);
      ctx.fillText('STATUS READY', 760, 290);
      ctx.fillStyle = '#147b66';
      ctx.fillRect(0, 535, 960 * t / 12, 5);
      if (playing) animation = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => cancelAnimationFrame(animation);
  }, [playing, frame]);

  return <section className="ot-video-tool">
    <div className="ot-demo-playback">
      <canvas ref={canvasRef} width={960} height={540} role="img" aria-label={`${subject}虚拟训练动画`} />
      <span className="ot-demo-clip-label">合成影像 · 非真实录像</span>
    </div>
    <div className="ot-media-toolbar">
      <button className="ot-button" onClick={() => setPlaying((value) => !value)}>
        {playing ? <Pause size={15} /> : <Play size={15} />}{playing ? '暂停回放' : '播放虚拟影像'}
      </button>
      <Tooltip title="重新播放"><button className="ot-icon-button" aria-label="重新播放虚拟影像" onClick={() => { timeRef.current = 0; setFrame((value) => value + 1); setPlaying(true); }}><RotateCcw size={15} /></button></Tooltip>
      <span className="ot-demo-clip-duration">00:12</span>
    </div>
    <p className="ot-media-note">虚拟动作示意 · 非真人影像 · 无摄像头采集</p>
  </section>;
}
