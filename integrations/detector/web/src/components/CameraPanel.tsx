import React from "react";
import { Users, VideoOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Camera, CameraStatus } from "../types";
import { cn, sanitizeImageUrl } from "../lib/utils";

const CameraPanel = React.memo(function CameraPanel({
  camera,
  personCount,
}: {
  camera: Camera;
  personCount: number;
}) {
  const navigate = useNavigate();

  return (
    <div className="relative group bg-black overflow-hidden flex flex-col border border-white/5">
      {/* Scanline Effect Overlay (CSS-only) */}
      <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-b from-transparent via-primary/5 to-transparent h-1/4 animate-[shimmer_3s_infinite]" />

      {camera.streamUrl ? (
        <img
          src={sanitizeImageUrl(camera.streamUrl)}
          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-500"
          alt={`摄像头 ${camera.name} 实时画面`}
        />
      ) : (
        <div className="w-full h-full bg-zinc-900/50 flex flex-col items-center justify-center gap-sm cursor-pointer group"
             onClick={() => navigate('/devices')}>
          <VideoOff size={32} className="text-white/10 group-hover:text-primary/50 transition-colors" />
          <span className="text-body-lg font-mono text-white/15">NO SIGNAL</span>
          <span className="text-body-sm text-primary/0 group-hover:text-primary/70 transition-all">点击接入摄像头</span>
        </div>
      )}

      {/* HUD Info Overlay */}
      <div className="absolute inset-0 flex flex-col justify-between p-sm pointer-events-none">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-xs px-1.5 py-1 bg-black/60 backdrop-blur rounded border border-white/10">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                camera.status === CameraStatus.ONLINE
                  ? "bg-success-green box-shadow-[0_0_8px_#1a7f37]"
                  : "bg-error animate-pulse"
              )}
            />
            <span className="text-body-lg font-mono font-bold text-white/90">
              CAM {camera.id.slice(-4).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-sm">
            {camera.status === CameraStatus.ONLINE && (
              <div className="px-1.5 py-1 bg-primary/20 backdrop-blur rounded border border-primary/20 flex items-center gap-1">
                <Users size={10} className="text-primary" />
                <span className="text-body-lg font-mono font-bold text-primary">
                  {personCount.toString().padStart(2, "0")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-end bg-gradient-to-t from-black/80 via-black/40 to-transparent p-xs -m-sm">
          <div className="flex flex-col">
            <span className="text-body-lg font-bold text-white/80">
              {camera.name}
            </span>
            <span className="text-body-lg font-mono text-white/40 uppercase">
              {camera.name}
            </span>
          </div>
          <span
            className={cn(
              "text-body-lg font-black uppercase tracking-widest",
              camera.status === CameraStatus.ONLINE
                ? "text-success-green"
                : "text-error"
            )}
          >
            {camera.status}
          </span>
        </div>
      </div>
    </div>
  );
});

export default CameraPanel;
