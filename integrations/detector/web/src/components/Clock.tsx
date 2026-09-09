import { useState, useEffect, useRef } from "react";

export default function Clock() {
  const [time, setTime] = useState(new Date());
  const rafRef = useRef<number>(0);
  const lastRef = useRef(0);

  useEffect(() => {
    const tick = (now: number) => {
      // 每秒更新一次，避免过度渲染
      if (now - lastRef.current >= 1000) {
        lastRef.current = now;
        setTime(new Date());
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="px-3 py-1.5 bg-surface-container-low rounded-lg">
      <span className="text-[12px] font-mono text-on-surface-variant tabular-nums font-medium">
        {time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  );
}
