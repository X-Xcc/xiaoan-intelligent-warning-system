import { useState } from "react";
import {
  ShieldCheck,
  RefreshCcw,
  Activity,
  Terminal,
  CloudDownload,
  Clock,
  Server,
  Cpu,
  HardDrive,
  Zap,
  Loader2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useRealSystemStatus, useRealModelInfo } from "../lib/useRealData";
import { useToast } from "../components/Toast";
import { buildFallbackServices, buildMaintenanceGauges, buildVersionInfo } from "../services/maintenance-data";
import { simulateMaintenanceUpdateCheck } from "../services/maintenance-service";

const ICONS = {
  cpu: Cpu,
  memory: HardDrive,
  storage: Server,
  gpu: Zap,
} as const;

const Gauge = ({ value, label, sub, color, icon: Icon }: { value: number; label: string; sub: string; color: string; icon: React.ComponentType<{ size?: number; className?: string }> }) => {
  const dashArray = (value / 100) * 100;
  return (
    <div className="bg-white border border-outline-variant rounded-xl p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-1.5">
        <Icon size={14} className="text-outline" />
        <span className="text-caption font-semibold text-outline uppercase tracking-wider">{label}</span>
      </div>
      <div className="relative w-[100px] h-[100px] flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f3f4f6" strokeWidth="2.5" />
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeDasharray={`${dashArray} 100`}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-heading font-mono font-bold leading-tight tabular-nums">{value}%</span>
        </div>
      </div>
      <span className={cn("text-caption font-semibold", color)}>{sub}</span>
    </div>
  );
};

export default function Maintenance() {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const status = useRealSystemStatus();
  const modelInfo = useRealModelInfo();
  const gauges = buildMaintenanceGauges(status);
  const versionInfo = buildVersionInfo(status, modelInfo);
  const fallbackServices = buildFallbackServices();

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 h-full flex flex-col min-h-0 animate-fade-in-up">
      <header className="flex justify-between items-center shrink-0">
        <button onClick={() => toast.show("数据已刷新")} className="bg-primary text-white px-4 py-2 rounded-lg font-semibold text-body flex items-center gap-2 shadow-sm">
          <RefreshCcw size={15} /> 全局刷新
        </button>
      </header>

      <div className="grid grid-cols-4 gap-3 shrink-0">
        {gauges.map(gauge => {
          const Icon = ICONS[gauge.key];
          return <Gauge key={gauge.key} value={gauge.value} label={gauge.label} sub={gauge.sub} color={gauge.color} icon={Icon} />;
        })}
      </div>

      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        <section className="col-span-8 bg-white border border-outline-variant rounded-xl flex flex-col overflow-hidden shadow-sm">
          <header className="px-4 py-2.5 border-b border-outline-variant bg-surface-container-low/50 flex justify-between items-center">
            <h3 className="font-bold text-body-lg flex items-center gap-2"><Activity size={16} className="text-outline" /> 核心服务节点</h3>
            <span className="text-caption text-outline font-mono">同步间隔: 2s</span>
          </header>
          <div className="flex-1 overflow-auto divide-y divide-outline-variant/30">
            {status.services.length === 0 && (
              <>
                {fallbackServices.map(service => (
                  <div key={service.name} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-success-green" />
                      <span className="font-semibold text-body text-on-surface">{service.name}</span>
                    </div>
                    <span className="text-caption font-semibold uppercase px-2 py-0.5 rounded text-success-green bg-success-green/10">Running</span>
                  </div>
                ))}
              </>
            )}
            {status.services.map(s => (
              <div key={s.name} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    s.health === "healthy" ? "bg-success-green" : "bg-warning-orange animate-pulse"
                  )} />
                  <div>
                    <span className="font-semibold text-body text-on-surface">{s.name}</span>
                    <div className="flex items-center gap-3 text-caption text-outline mt-0.5">
                      <span className="flex items-center gap-1"><Clock size={9} /> {s.uptime}</span>
                      <span className="flex items-center gap-1"><Terminal size={9} /> Node</span>
                    </div>
                  </div>
                </div>
                <span className={cn(
                  "text-caption font-semibold uppercase px-2 py-0.5 rounded",
                  s.health === "healthy"
                    ? "text-success-green bg-success-green/10"
                    : "text-warning-orange bg-warning-orange/10"
                )}>
                  {s.health === "healthy" ? "Running" : "Degraded"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="col-span-4 space-y-4">
          <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm">
            <h3 className="font-bold text-body-lg mb-3 flex items-center gap-2 text-primary"><ShieldCheck size={16} /> 系统版本</h3>
            <div className="space-y-2.5">
              {versionInfo.map(item => (
                <div key={item.label} className="flex justify-between items-center text-body-sm">
                  <span className="text-outline font-medium">{item.label}</span>
                  <span className="font-mono font-semibold tabular-nums">{item.value}</span>
                </div>
              ))}
              <button disabled={checking} onClick={() => {
                setChecking(true);
                simulateMaintenanceUpdateCheck().then((message) => {
                  toast.show(message);
                }).finally(() => {
                  setChecking(false);
                });
              }} className="w-full mt-3 bg-primary text-white h-9 rounded-lg font-semibold text-body flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
                {checking ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} />}
                {checking ? "检查中..." : "检查系统更新"}
              </button>
            </div>
          </div>

          <div className="gradient-primary p-4 rounded-xl shadow-md text-white">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={22} className="opacity-80" />
              <h3 className="text-heading font-bold">Security Status</h3>
            </div>
            <p className="text-body opacity-80 leading-relaxed mb-3">
              系统受保护状态。数据目录 {status.dataDirSizeMb ?? 0}MB，累计检测 {status.detectionCount ?? 0} 次。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/10 p-2.5 rounded-lg backdrop-blur-sm">
                <p className="text-caption font-semibold opacity-60 uppercase mb-0.5">数据目录</p>
                <p className="text-heading font-mono font-bold tabular-nums">{status.dataDirSizeMb ?? 0} MB</p>
              </div>
              <div className="bg-white/10 p-2.5 rounded-lg backdrop-blur-sm">
                <p className="text-caption font-semibold opacity-60 uppercase mb-0.5">检测总数</p>
                <p className="text-heading font-mono font-bold tabular-nums">{status.detectionCount ?? 0}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="mt-auto pt-3 border-t border-outline-variant/30 flex justify-between items-center text-caption font-semibold text-outline uppercase tracking-wider shrink-0 pb-6">
        <span>Build: {status.version}</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success-green" /> 核心维护控制台已就绪</span>
      </footer>
    </div>
  );
}
