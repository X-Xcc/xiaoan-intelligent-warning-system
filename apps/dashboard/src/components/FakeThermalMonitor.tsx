import { useEffect, useState } from 'react';

export function FakeThermalMonitor({ compact = true, animationKey = 0 }: {
  compact?: boolean;
  animationKey?: number;
}) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timestamp = new Date(now).toLocaleTimeString('zh-CN', { hour12: false });

  return (
    <div
      className={`ot-fake-thermal ${compact ? 'compact' : ''}`}
      data-preview-mode="demo"
      data-preview-state="live"
      data-animation-key={animationKey}
      role="img"
      aria-label="机械狗热成像演示画面"
    >
      <div className="ot-fake-thermal__terrain" aria-hidden="true" />
      <div className="ot-fake-thermal__grid" aria-hidden="true" />
      <div className="ot-fake-thermal__noise" aria-hidden="true" />
      <div className="ot-fake-thermal__scan" aria-hidden="true" />
      <div className="ot-fake-thermal__reticle" aria-hidden="true"><span /></div>
      <div className="ot-fake-thermal__dog" aria-hidden="true">
        <span className="ot-fake-thermal__head" />
        <span className="ot-fake-thermal__leg ot-fake-thermal__leg--front" />
        <span className="ot-fake-thermal__leg ot-fake-thermal__leg--rear" />
      </div>
      <span className="ot-fake-thermal__rec">REC</span>
      <span className="ot-fake-thermal__device">DOG-02</span>
      <span className="ot-fake-thermal__time">{timestamp}</span>
      <span className="ot-fake-thermal__label">机械狗巡检视角 · 热成像</span>
      <span className="ot-fake-thermal__demo">演示画面</span>
      <div className="ot-fake-thermal__scale" aria-hidden="true">
        <span>HIGH</span><i /><i /><i /><i /><i /><span>LOW</span>
      </div>
      <span className="ot-fake-thermal__status">信号稳定</span>
    </div>
  );
}
