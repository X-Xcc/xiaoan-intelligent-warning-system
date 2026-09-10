import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Download, X, Radio, Loader2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LightboxProps {
  src: string;
  alt?: string;
  cameraId?: string;
  onClose: () => void;
  onDownload: () => void;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 500;

export default function Lightbox({ src, alt, cameraId, onClose, onDownload }: LightboxProps) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [retries, setRetries] = useState(0);
  const [failed, setFailed] = useState(false);

  // 切换图片时重置所有状态
  useEffect(() => {
    setLoaded(false);
    setRetries(0);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleError = () => {
    if (retries < MAX_RETRIES) {
      setRetries(r => r + 1);
      // 延迟后重新加载同一 src，等后端写完文件
      setTimeout(() => {
        const img = document.querySelector<HTMLImageElement>("#lightbox-img");
        if (img) img.src = src;
      }, RETRY_DELAY);
    } else {
      setFailed(true);
      setLoaded(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* 加载中 spinner */}
        {!loaded && !failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center min-w-[300px] min-h-[200px] gap-2">
            <Loader2 size={32} className="text-white/50 animate-spin" />
            {retries > 0 && (
              <span className="text-white/40 text-caption font-mono">
                截图生成中... (重试 {retries}/{MAX_RETRIES})
              </span>
            )}
          </div>
        )}

        {/* 加载失败提示 */}
        {failed && (
          <div className="flex flex-col items-center justify-center min-w-[300px] min-h-[200px] gap-3">
            <RefreshCw size={32} className="text-white/20" />
            <p className="text-white/50 text-body-sm">图片加载失败</p>
            <p className="text-white/30 text-caption">后端截图可能尚未生成</p>
            <button
              onClick={() => { setFailed(false); setLoaded(false); setRetries(0); }}
              className="mt-2 px-4 py-1.5 bg-white/10 text-white/70 rounded-lg text-caption hover:bg-white/20 transition-colors"
            >
              重试
            </button>
          </div>
        )}

        {/* 真实图片 */}
        {src ? (
          <img
            id="lightbox-img"
            key={src}
            src={src}
            alt={alt || "证据截图"}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onLoad={() => { setLoaded(true); setFailed(false); }}
            onError={handleError}
            style={{ opacity: loaded && !failed ? 1 : 0, transition: "opacity 0.2s" }}
          />
        ) : null}

        {/* 关闭按钮 */}
        <button onClick={onClose} aria-label="关闭" className="absolute -top-3 -right-3 bg-white text-black rounded-full p-1.5 shadow-lg hover:bg-gray-100">
          <X size={16} />
        </button>

        {/* 底部操作栏 */}
        <div className="flex justify-center gap-3 mt-3">
          <button onClick={onDownload} className="bg-white/90 text-black px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-white transition-colors">
            <Download size={15} /> 下载
          </button>
          {cameraId && (
            <button onClick={() => navigate(`/monitor?cam=${cameraId}`)} className="bg-primary text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity">
              <Radio size={15} /> 查看直播
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
