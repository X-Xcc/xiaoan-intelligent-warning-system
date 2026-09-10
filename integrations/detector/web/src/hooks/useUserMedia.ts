import { useState, useEffect, useRef } from "react";

/**
 * 请求浏览器摄像头权限，返回 video ref 和状态。
 * 卸载时自动释放摄像头。
 */
export function useUserMedia() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setActive(true);
        setError(null);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error && e.name === "NotAllowedError" ? "摄像头权限被拒绝" : "无法访问摄像头";
          setError(msg);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, active, error };
}
