import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip,
} from "recharts";
import {
  TrendingUp, BarChart2, Download,
  AlertCircle, ShieldCheck, Target, Activity
} from "lucide-react";
import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { isZeroPort } from "../lib/api";
import {
  useRealSystemStatus,
  useRealTrendData,
  useRealModelInfo,
  useRealRegionalStats,
  useRealFpsStats,
} from "../lib/useRealData";
import { useRealAlerts } from "../lib/useRealAlerts";
import { useToast } from "../components/Toast";
import Prison3D from "../components/Prison3D";
import {
  ANALYSIS_RANGE_OPTIONS,
  AnalysisTimeRange,
  buildAnalysisTrendSummary,
  buildRadarData,
  getAnalysisAccuracy,
  getAverageLatencyLabel,
  getBehaviorMaxValue,
  getConfirmedAlertCount,
  getRegionalMaxValue,
  sumAnalysisAlerts,
  zeroNumber,
  zeroRegionalData,
  zeroString,
  zeroTrendData,
} from "../services/analysis-data";
import { exportAnalysisReport } from "../services/analysis-service";

export default function Analysis() {
  const toast = useToast();
  const [timeRange, setTimeRange] = useState<AnalysisTimeRange>("week");
  const { alerts } = useRealAlerts();
  const status = useRealSystemStatus();
  const modelInfo = useRealModelInfo();
  const regionalData = useRealRegionalStats();
  const fpsStats = useRealFpsStats();
  const trendDataRaw = useRealTrendData(timeRange);

  const { trendData, trendTotals } = useMemo(() => buildAnalysisTrendSummary(trendDataRaw), [trendDataRaw]);

  const totalAlerts = sumAnalysisAlerts(trendTotals);
  const behaviorCounts = trendTotals;
  const confirmedAlerts = getConfirmedAlertCount(alerts);
  const accuracy = getAnalysisAccuracy(alerts.length, confirmedAlerts);
  const avgLatency = getAverageLatencyLabel(fpsStats?.avg);
  const maxVal = getBehaviorMaxValue(behaviorCounts);
  const maxRegionalValue = getRegionalMaxValue(regionalData);

  const zeroedTrendData = useMemo(
    () => zeroTrendData(trendData, isZeroPort),
    [trendData],
  );
  const zeroedRegionalData = useMemo(
    () => zeroRegionalData(regionalData, isZeroPort),
    [regionalData],
  );
  const radarData = useMemo(
    () => buildRadarData(behaviorCounts, maxVal, isZeroPort),
    [behaviorCounts, maxVal],
  );

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-8 animate-fade-in-up">
      <header className="flex justify-between items-end">
        <div className="flex gap-2.5">
          <div className="flex bg-white border border-outline-variant rounded-lg p-0.5 shadow-sm">
            {ANALYSIS_RANGE_OPTIONS.map(option => (
              <button key={option.value} onClick={() => setTimeRange(option.value)}
                className={cn("px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all",
                  timeRange === option.value ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                )}>
                {option.label}
              </button>
            ))}
          </div>
          <button onClick={() => { exportAnalysisReport(); toast.show("已开始导出分析报告"); }} className="bg-gradient-to-r from-primary to-blue-500 text-white px-4 py-2 rounded-lg font-semibold text-[13px] flex items-center gap-2 shadow-md hover:shadow-lg hover:shadow-primary/20 transition-all">
            <Download size={14} /> 导出报告
          </button>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "本周告警", value: zeroString(totalAlerts.toString(), isZeroPort), change: isZeroPort ? "—" : "+12.4%", icon: AlertCircle, color: "text-danger-red", bg: "bg-danger-red/10" },
          { label: "AI 准确率", value: `${zeroNumber(accuracy, isZeroPort)}%`, change: isZeroPort ? "—" : "+0.8%", icon: ShieldCheck, color: "text-success-green", bg: "bg-success-green/10" },
          { label: "识别时延", value: isZeroPort ? "0ms" : avgLatency, change: isZeroPort ? "—" : "正常", icon: Target, color: "text-info-cyan", bg: "bg-info-cyan/10" },
          { label: "设备负载", value: `${zeroString(status.cpuUsage.toString(), isZeroPort)}%`, change: isZeroPort ? "—" : "运行中", icon: Activity, color: "text-primary", bg: "bg-primary/10" },
        ].map((s, i) => (
          <div key={i} className="bg-white p-4 border border-outline-variant rounded-xl shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2.5">
              <span className="text-[11px] font-semibold text-outline uppercase tracking-wider">{s.label}</span>
              <div className={cn("p-1.5 rounded-lg", s.bg)}>
                <s.icon className={s.color} size={15} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[22px] font-bold font-mono tabular-nums tracking-tight">{s.value}</span>
              <span className="text-[11px] text-outline font-medium">{s.change}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <header className="px-4 py-2.5 border-b border-outline-variant/50 bg-surface-container-low/50">
            <h3 className="font-bold text-[14px] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success-green animate-pulse" />
              3D 监区热力图
            </h3>
          </header>
          {isZeroPort ? (
            <div className="h-full flex items-center justify-center text-outline/50">
              <p className="text-[13px]">空数据模式</p>
            </div>
          ) : (
            <div className="h-[360px]"><Prison3D /></div>
          )}
        </section>

        <section className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col">
          <header className="px-4 py-2.5 border-b border-outline-variant/50 bg-surface-container-low/50">
            <h3 className="font-bold text-[14px] flex items-center gap-2"><BarChart2 size={15} className="text-outline" /> 七日告警趋势</h3>
          </header>
          <div className="flex-1 p-4 chart-grid">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={zeroedTrendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="colorAlert" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f6ef7" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f6ef7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#a0a8b8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#a0a8b8" }} />
                <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e4e7ee", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontSize: "12px" }} />
                <Area type="monotone" dataKey="alerts" stroke="#4f6ef7" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAlert)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <header className="px-4 py-2.5 border-b border-outline-variant/50 bg-surface-container-low/50">
            <h3 className="font-bold text-[14px]">AI 识别效能</h3>
          </header>
          <div className="p-4 grid grid-cols-5 gap-4 items-center h-[260px]">
            <div className="col-span-3 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e4e7ee" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fontWeight: 600, fill: "#4a5568" }} />
                  <Radar name="检测数" dataKey="A" stroke="#4f6ef7" fill="#4f6ef7" fillOpacity={0.12} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-2 space-y-4 border-l border-outline-variant/30 pl-4">
              <div>
                <p className="text-[11px] text-outline font-semibold uppercase mb-0.5">总检测数</p>
                <p className="text-[20px] font-mono font-bold text-primary tabular-nums">{zeroNumber(totalAlerts, isZeroPort)}</p>
              </div>
              <div>
                <p className="text-[11px] text-outline font-semibold uppercase mb-0.5">总告警数</p>
                <p className="text-[20px] font-mono font-bold text-detect-purple tabular-nums">{zeroNumber(confirmedAlerts, isZeroPort)}</p>
              </div>
              <div className="pt-3 border-t border-outline-variant/20">
                <p className="text-[11px] font-semibold text-on-surface-variant">YOLOv8n-pose</p>
                <p className="text-[11px] font-semibold mt-0.5 text-outline">{modelInfo?.device} · {modelInfo?.precision}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <header className="px-4 py-2.5 border-b border-outline-variant/50 bg-surface-container-low/50">
            <h3 className="font-bold text-[14px] flex items-center gap-2"><TrendingUp size={15} className="text-outline" /> 各监区告警分布</h3>
          </header>
          <div className="p-4 flex-1 flex flex-col justify-center">
            {zeroedRegionalData.map(item => (
              <div key={item.name} className="flex items-center gap-3 mb-3 last:mb-0">
                <span className="w-10 text-[12px] font-semibold text-right text-on-surface-variant">{item.name}</span>
                <div className="flex-1 h-2.5 bg-surface-container-high rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.value / maxRegionalValue) * 100}%` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                </div>
                <span className="w-8 text-[12px] font-mono font-bold text-on-surface tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
