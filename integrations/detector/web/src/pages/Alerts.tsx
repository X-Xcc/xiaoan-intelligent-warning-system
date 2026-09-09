import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { Alert, AlertLevel, AlertType } from "../types";
import {
  Download,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Loader2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useRealAlerts } from "../lib/useRealAlerts";
import { useImageRetry } from "../hooks/useImageRetry";
import {
  ALERTS_PAGE_SIZE,
  filterAlerts,
  getAlertLevelLabel,
  getAlertStatusLabel,
  getAlertTotalPages,
  getAlertTriggerRule,
  getCriticalAlertCount,
  getPendingAlertCount,
  paginateAlerts,
} from "../services/alerts-data";
import { exportAlertsReport } from "../services/alerts-service";

export default function Alerts() {
  const toast = useToast();
  const navigate = useNavigate();
  const { alerts, updateAlertStatus } = useRealAlerts();
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const resetFilters = () => {
    setFilterType("");
    setFilterStatus("");
    setCurrentPage(0);
  };

  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(0);
  };
  const { onError: onImgError } = useImageRetry(3, 500, (el) => { el.style.display = "none"; });

  const filteredAlerts = useMemo(
    () => filterAlerts(alerts, filterType, filterStatus),
    [alerts, filterType, filterStatus],
  );

  const totalPages = getAlertTotalPages(filteredAlerts.length, ALERTS_PAGE_SIZE);
  const pagedAlerts = paginateAlerts(filteredAlerts, currentPage, ALERTS_PAGE_SIZE);

  const handleUpdateStatus = (status: "confirmed" | "ignored") => {
    if (!selectedAlert) return;
    const alertId = selectedAlert.id;
    setActionLoading(true);
    updateAlertStatus(alertId, status)
      .catch(() => toast.show("操作失败", "error"))
      .finally(() => {
        setActionLoading(false);
        setSelectedAlert(prev => prev && prev.id === alertId ? { ...prev, status } : prev);
      });
  };

  const pendingCount = getPendingAlertCount(alerts);
  const criticalCount = getCriticalAlertCount(alerts);

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden animate-fade-in-up">
      <section className="flex items-center justify-between shrink-0">
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={e => handleFilterChange(setFilterType)(e.target.value)}
            className="bg-white border border-outline-variant rounded-lg h-9 px-3 text-body font-medium focus:ring-1 focus:ring-primary outline-none shadow-sm"
          >
            <option value="">全部类型</option>
            {Object.values(AlertType).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => handleFilterChange(setFilterStatus)(e.target.value)}
            className="bg-white border border-outline-variant rounded-lg h-9 px-3 text-body font-medium focus:ring-1 focus:ring-primary outline-none shadow-sm"
          >
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="confirmed">已确认</option>
            <option value="ignored">已忽略</option>
          </select>
          <button onClick={() => { exportAlertsReport(filterType, filterStatus); toast.show("告警数据已导出"); }} className="bg-primary text-white rounded-lg h-9 px-4 font-semibold flex items-center gap-2 text-body shadow-sm hover:shadow-md transition-all">
            <Download size={15} /> 导出
          </button>
        </div>
        <div className="text-body-sm text-outline">
          待处理 {pendingCount} 条 · 严重 {criticalCount} 条
        </div>
      </section>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        <div className="flex-1 bg-white border border-outline-variant rounded-xl flex flex-col overflow-hidden shadow-sm">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low sticky top-0 z-10 border-b border-outline-variant">
                <tr>
                  <th className="px-4 py-2.5 text-caption font-semibold text-outline uppercase tracking-wider">告警 ID</th>
                  <th className="px-4 py-2.5 text-caption font-semibold text-outline uppercase tracking-wider">设备</th>
                  <th className="px-4 py-2.5 text-caption font-semibold text-outline uppercase tracking-wider">类型</th>
                  <th className="px-4 py-2.5 text-caption font-semibold text-outline uppercase tracking-wider">时间</th>
                  <th className="px-4 py-2.5 text-caption font-semibold text-outline uppercase tracking-wider">置信度</th>
                  <th className="px-4 py-2.5 text-caption font-semibold text-outline uppercase tracking-wider">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50 text-body">
                {pagedAlerts.map((alert) => (
                  <tr
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedAlert?.id === alert.id
                        ? "bg-primary-container/30"
                        : "hover:bg-surface-container-low"
                    )}
                  >
                    <td className="px-4 py-2.5 font-mono text-caption text-on-surface-variant tabular-nums">
                      {alert.id.slice(-8)}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{alert.cameraName}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-caption font-semibold inline-flex items-center gap-1",
                        alert.level === AlertLevel.CRITICAL
                          ? "bg-red-100 text-red-700"
                          : alert.level === AlertLevel.WARNING
                            ? "bg-orange-100 text-orange-700"
                            : alert.level === AlertLevel.MINOR
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                      )}>
                        {alert.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-body-sm tabular-nums text-on-surface-variant">
                      {new Date(alert.time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-body-sm font-semibold tabular-nums text-on-surface">
                        {alert.confidence.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "flex items-center gap-1.5 text-caption font-semibold",
                        alert.status === "pending" ? "text-danger-red" : "text-outline"
                      )}>
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          alert.status === "pending" ? "bg-danger-red animate-pulse" : "bg-outline"
                        )} />
                        {getAlertStatusLabel(alert.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="h-10 border-t border-outline-variant bg-surface-container-low/50 px-4 flex items-center justify-between text-caption text-outline shrink-0">
            <span>共 {filteredAlerts.length} 条 · 第 {currentPage + 1}/{totalPages} 页</span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="h-6 w-6 rounded border border-outline-variant flex items-center justify-center hover:bg-surface-container disabled:opacity-30"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="h-6 w-6 rounded border border-outline-variant flex items-center justify-center hover:bg-surface-container disabled:opacity-30"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </footer>
        </div>

        {selectedAlert && (
          <div className="w-[360px] bg-white border border-outline-variant rounded-xl flex flex-col shadow-sm overflow-hidden shrink-0 animate-fade-in-up">
            <header className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50">
              <div>
                <h3 className="font-bold text-body-lg">告警详情</h3>
                <p className="text-caption text-outline font-mono mt-0.5">{selectedAlert.id}</p>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="p-1 rounded hover:bg-surface-container-high text-outline hover:text-on-surface transition-colors"
              >
                <X size={16} />
              </button>
            </header>

            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div className="rounded-lg overflow-hidden border border-outline-variant bg-dark-bg relative aspect-video flex items-center justify-center">
                {selectedAlert.snapshotUrl ? (
                  <img
                    key={selectedAlert.id}
                    src={selectedAlert.snapshotUrl}
                    alt={`${selectedAlert.type} 快照`}
                    className="w-full h-full object-cover"
                    onError={onImgError}
                  />
                ) : null}
                <div className="text-center absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <Eye size={24} className="text-white/20 mb-2" />
                  <span className="text-white/30 text-body-sm font-mono">{selectedAlert.cameraName} - 告警快照</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2 video-hud flex justify-between items-end">
                  <span className="text-white/70 text-caption font-mono">
                    {new Date(selectedAlert.time).toLocaleString("zh-CN")}
                  </span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-caption font-semibold",
                    selectedAlert.confidence > 90 ? "bg-success-green/30 text-success-green" : "bg-warning-orange/30 text-warning-orange"
                  )}>
                    置信度 {selectedAlert.confidence.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-surface-container-low rounded-lg border border-outline-variant/50">
                <DataField label="检测类型" value={selectedAlert.type} highlight />
                <DataField label="发生位置" value={selectedAlert.cameraName} />
                <DataField label="持续时间" value={selectedAlert.duration ?? "—"} mono />
                <DataField label="告警级别" value={getAlertLevelLabel(selectedAlert.level)} highlight />
              </div>

              <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/50">
                <p className="text-caption font-semibold text-outline uppercase mb-1">触发规则</p>
                <p className="text-body text-on-surface">
                  {getAlertTriggerRule(selectedAlert.type)}
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-outline-variant space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => handleUpdateStatus("ignored")}
                  disabled={selectedAlert.status !== "pending" || actionLoading}
                  className="flex-1 h-10 bg-surface-container border border-outline-variant rounded-lg font-semibold text-body flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors disabled:opacity-40"
                >
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} {actionLoading ? "处理中…" : "忽略误报"}
                </button>
                <button
                  onClick={() => handleUpdateStatus("confirmed")}
                  disabled={selectedAlert.status !== "pending" || actionLoading}
                  className="flex-1 h-10 bg-primary text-white rounded-lg font-semibold text-body flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all disabled:opacity-40"
                >
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {actionLoading ? "处理中…" : "确认告警"}
                </button>
              </div>
              <button onClick={() => navigate(`/monitor?cam=${selectedAlert.cameraId}&time=${selectedAlert.time}`)} className="w-full h-9 border border-primary/20 text-primary text-body font-medium rounded-lg flex items-center justify-center gap-1.5 hover:bg-primary/5 transition-colors">
                <Eye size={14} /> 查看录像回放
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DataField({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div>
      <p className="text-caption text-outline font-semibold mb-0.5">{label}</p>
      <p className={cn(
        "text-body font-medium",
        mono && "font-mono",
        highlight ? "text-danger-red" : "text-on-surface"
      )}>
        {value}
      </p>
    </div>
  );
}
