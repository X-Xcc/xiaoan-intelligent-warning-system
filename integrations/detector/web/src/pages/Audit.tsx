import { useState, useMemo } from "react";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Cell
} from "recharts";
import {
  Activity, ShieldAlert, Search, Download, CheckCircle2, AlertTriangle,
  ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  useRealAuditLogs,
  useRealAutomationRate,
  useRealAuditTrend,
} from "../lib/useRealData";
import { useToast } from "../components/Toast";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_TIME_OPTIONS,
  AUDIT_TREND_OPTIONS,
  AuditTimeFilter,
  AuditTrendRange,
  buildAuditCategories,
  buildAuditTrend,
  filterAuditLogs,
  getAuditRiskLabel,
  getAuditTotalPages,
  getHighRiskAuditCount,
  hasActiveAuditFilter,
  paginateAuditLogs,
} from "../services/audit-data";
import { exportAuditReport } from "../services/audit-service";

const OPERATOR_OPTIONS = ["用户1", "用户2", "用户3", "用户4"];
const CATEGORY_OPTIONS = ["登录管理", "设备配置", "告警处理", "系统设置", "数据导出", "用户管理"];
const ACTION_OPTIONS = [
  "用户登录系统", "修改摄像头配置", "确认打架告警", "调整AI灵敏度",
  "导出月度报表", "添加新设备", "删除过期数据", "修改通知策略",
  "重置密码", "查看监控回放", "批量确认告警", "更新系统固件",
];
const RISK_OPTIONS = [
  { value: "high", label: "高危" },
  { value: "medium", label: "中危" },
  { value: "low", label: "低危" },
];

export default function Audit() {
  const toast = useToast();
  const auditLogs = useRealAuditLogs();
  const automationRate = useRealAutomationRate();
  const [trendRange, setTrendRange] = useState<AuditTrendRange>("week");
  const auditTrendRaw = useRealAuditTrend(trendRange);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOperator, setFilterOperator] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterRisk, setFilterRisk] = useState("");
  const [filterTime, setFilterTime] = useState<AuditTimeFilter>("all");
  const [currentPage, setCurrentPage] = useState(0);

  const auditTrend = useMemo(() => buildAuditTrend(auditTrendRaw), [auditTrendRaw]);

  const filteredLogs = useMemo(() => filterAuditLogs(auditLogs, {
    searchTerm,
    filterTime,
    filterOperator,
    filterCategory,
    filterAction,
    filterRisk,
  }), [auditLogs, searchTerm, filterTime, filterOperator, filterCategory, filterAction, filterRisk]);

  const hasActiveFilter = hasActiveAuditFilter({ filterOperator, filterCategory, filterAction, filterRisk, filterTime });

  function clearFilters() {
    setFilterOperator("");
    setFilterCategory("");
    setFilterAction("");
    setFilterRisk("");
    setFilterTime("all");
    setCurrentPage(0);
  }

  const totalPages = getAuditTotalPages(filteredLogs.length, AUDIT_PAGE_SIZE);
  const pagedLogs = paginateAuditLogs(filteredLogs, currentPage, AUDIT_PAGE_SIZE);
  const highRiskCount = getHighRiskAuditCount(filteredLogs);
  const categories = useMemo(() => buildAuditCategories(filteredLogs), [filteredLogs]);

  return (
    <div className="space-y-4 flex flex-col h-full overflow-hidden animate-fade-in-up">
      <section className="grid grid-cols-3 gap-4 shrink-0">
        {[
          { label: "操作总量", value: filteredLogs.length.toLocaleString(), change: "总计", icon: Activity, color: "text-primary", bg: "bg-primary/10" },
          { label: "高危预警", value: highRiskCount.toString(), change: "当前筛选", icon: ShieldAlert, color: "text-danger-red", bg: "bg-error-container/30" },
          { label: "系统自动化率", value: `${automationRate.rate}%`, change: "核心稳定", icon: CheckCircle2, color: "text-success-green", bg: "bg-success-green/10" },
        ].map(s => (
          <div key={s.label} className="bg-white p-3 border border-outline-variant rounded-xl shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-caption font-semibold text-outline uppercase tracking-wider mb-0.5">{s.label}</p>
                <h3 className={cn("text-heading font-bold font-mono tabular-nums", s.color)}>{s.value}</h3>
              </div>
              <div className={cn("p-1.5 rounded-lg", s.bg)}>
                <s.icon className={s.color} size={16} />
              </div>
            </div>
            <div className="text-caption text-outline font-medium">{s.change}</div>
            {s.label === "系统自动化率" && (
              <div className="mt-2 w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
                <div className="bg-success-green h-full rounded-full" style={{ width: `${automationRate.rate}%` }} />
              </div>
            )}
          </div>
        ))}
      </section>

      <div className="grid grid-cols-12 gap-4 shrink-0">
        <section className="col-span-8 bg-white border border-outline-variant rounded-xl p-4 shadow-sm flex flex-col h-[260px]">
          <header className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-body-lg">管理人员活跃趋势</h3>
            <div className="flex bg-surface-container-high rounded-lg p-0.5">
              {AUDIT_TREND_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setTrendRange(option.value)}
                  className={cn("px-3 py-1 rounded-md text-caption font-semibold", trendRange === option.value ? "bg-white text-primary shadow-sm" : "text-on-surface-variant")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </header>
          <div className="flex-1 chart-grid rounded-lg">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={auditTrend.length > 0 ? auditTrend : [{ name: "暂无", value: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="name" interval={trendRange === "day" ? 1 : 0}
                  tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={{ backgroundColor: "#111928", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} cursor={{ fill: "rgba(26,86,219,0.05)" }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {auditTrend.map((_, index) => (
                    <Cell key={index} fill={index === auditTrend.length - 1 ? "#1a56db" : "#a4c2f5"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="col-span-4 bg-white border border-outline-variant rounded-xl p-4 shadow-sm flex flex-col h-[260px]">
          <h3 className="font-bold text-body-lg mb-3">类别分布</h3>
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {categories.map(([cat, count]) => {
              const maxCount = categories[0]?.[1] || 1;
              return (
                <div key={cat} className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/50">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-semibold text-body">{cat}</span>
                    <span className="font-mono text-caption font-bold tabular-nums">{count} 次</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="flex-1 bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
        <header className="px-4 py-2.5 border-b border-outline-variant bg-surface-container-low/50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-body-lg">操作审计日志</h3>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline" size={14} />
              <input type="text" placeholder="搜索日志..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(0); }}
                className="bg-surface-container-high border border-outline-variant rounded-lg h-8 pl-8 pr-3 text-body w-48 focus:w-56 transition-all outline-none" />
            </div>
            <button onClick={() => { exportAuditReport({ searchTerm, filterCategory, filterRisk, filterTime }); toast.show("审计日志已导出"); }} className="bg-primary text-white px-3 h-8 rounded-lg font-semibold text-body flex items-center gap-1.5">
              <Download size={14} /> 导出
            </button>
          </div>
        </header>
        <div className="overflow-auto flex-1">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low sticky top-0 z-10 border-b border-outline-variant">
              <tr>
                {[
                  {
                    label: "时间",
                    node: (
                      <select value={filterTime} onChange={e => { setFilterTime(e.target.value as AuditTimeFilter); setCurrentPage(0); }}
                        className="bg-white border border-outline-variant rounded text-caption h-6 px-1 outline-none">
                        {AUDIT_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ),
                  },
                  {
                    label: "操作员",
                    node: (
                      <select value={filterOperator} onChange={e => { setFilterOperator(e.target.value); setCurrentPage(0); }}
                        className="bg-white border border-outline-variant rounded text-caption h-6 px-1 outline-none">
                        <option value="">全部</option>
                        {OPERATOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ),
                  },
                  {
                    label: "类别",
                    node: (
                      <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setCurrentPage(0); }}
                        className="bg-white border border-outline-variant rounded text-caption h-6 px-1 outline-none">
                        <option value="">全部</option>
                        {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ),
                  },
                  {
                    label: "详细",
                    node: (
                      <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setCurrentPage(0); }}
                        className="bg-white border border-outline-variant rounded text-caption h-6 px-1 outline-none">
                        <option value="">全部</option>
                        {ACTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ),
                  },
                  {
                    label: "风险",
                    node: (
                      <select value={filterRisk} onChange={e => { setFilterRisk(e.target.value); setCurrentPage(0); }}
                        className="bg-white border border-outline-variant rounded text-caption h-6 px-1 outline-none">
                        <option value="">全部</option>
                        {RISK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ),
                  },
                  { label: "状态", node: null },
                ].map(col => (
                  <th key={col.label} className={cn(
                    "px-4 py-2 text-caption font-semibold text-outline uppercase tracking-wider",
                    col.label === "状态" && "text-right"
                  )}>
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      {col.node}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 text-body-sm">
              {pagedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-2.5 font-mono text-caption text-on-surface-variant tabular-nums">
                    {new Date(log.timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{log.operatorName}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-surface-container-high rounded text-caption font-semibold text-outline">{log.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant">{log.action}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("flex items-center gap-1 text-caption font-semibold",
                      log.riskLevel === "high" ? "text-danger-red" : log.riskLevel === "medium" ? "text-warning-orange" : "text-info-cyan"
                    )}>
                      <span className={cn("w-1.5 h-1.5 rounded-full",
                        log.riskLevel === "high" ? "bg-danger-red" : log.riskLevel === "medium" ? "bg-warning-orange" : "bg-info-cyan"
                      )} />
                      {getAuditRiskLabel(log.riskLevel)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {log.status
                      ? <CheckCircle2 size={16} className="text-success-green inline" />
                      : <AlertTriangle size={16} className="text-warning-orange inline" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="h-9 border-t border-outline-variant bg-surface-container-low/50 px-4 flex items-center justify-between text-caption text-outline shrink-0">
          <div className="flex items-center gap-2">
            <span>共 {filteredLogs.length} 条 · 第 {currentPage + 1}/{totalPages} 页</span>
            {hasActiveFilter && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 text-primary hover:text-primary/80 font-semibold">
                <X size={12} /> 清除筛选
              </button>
            )}
          </div>
          <div className="flex gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}
              className="h-6 w-6 rounded border border-outline-variant flex items-center justify-center hover:bg-surface-container disabled:opacity-30">
              <ChevronLeft size={13} />
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}
              className="h-6 w-6 rounded border border-outline-variant flex items-center justify-center hover:bg-surface-container disabled:opacity-30">
              <ChevronRight size={13} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
