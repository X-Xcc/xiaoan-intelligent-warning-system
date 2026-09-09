import { AuditLog } from '../types';

export type AuditTrendRange = 'day' | 'week';
export type AuditTimeFilter = 'all' | 'today' | 'week' | 'month';

export const AUDIT_PAGE_SIZE = 15;
export const AUDIT_TREND_OPTIONS = [
  { value: 'day' as const, label: '按日' },
  { value: 'week' as const, label: '按周' },
];
export const AUDIT_TIME_OPTIONS = [
  { value: 'all' as const, label: '全部' },
  { value: 'today' as const, label: '今天' },
  { value: 'week' as const, label: '近7天' },
  { value: 'month' as const, label: '近30天' },
];

export function buildAuditTrend(auditTrendRaw?: { labels: string[]; data: Record<string, number[]> | number[] }) {
  if (!auditTrendRaw?.labels) return [];
  const values = Array.isArray(auditTrendRaw.data)
    ? auditTrendRaw.data
    : Object.values(auditTrendRaw.data)[0] ?? [];
  return auditTrendRaw.labels.map((label, index) => ({ name: label, value: values[index] ?? 0 }));
}

export function filterAuditLogs(
  logs: AuditLog[],
  filters: {
    searchTerm: string;
    filterTime: AuditTimeFilter;
    filterOperator: string;
    filterCategory: string;
    filterAction: string;
    filterRisk: string;
  },
  nowMs = Date.now(),
) {
  let result = logs;
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    result = result.filter(log =>
      log.action.toLowerCase().includes(term) ||
      log.category.toLowerCase().includes(term) ||
      log.operatorName.toLowerCase().includes(term),
    );
  }
  if (filters.filterTime !== 'all') {
    const cutoff = filters.filterTime === 'today'
      ? nowMs - 24 * 60 * 60 * 1000
      : filters.filterTime === 'week'
        ? nowMs - 7 * 24 * 60 * 60 * 1000
        : nowMs - 30 * 24 * 60 * 60 * 1000;
    result = result.filter(log => new Date(log.timestamp).getTime() >= cutoff);
  }
  if (filters.filterOperator) result = result.filter(log => log.operatorName === filters.filterOperator);
  if (filters.filterCategory) result = result.filter(log => log.category === filters.filterCategory);
  if (filters.filterAction) result = result.filter(log => log.action === filters.filterAction);
  if (filters.filterRisk) result = result.filter(log => log.riskLevel === filters.filterRisk);
  return result;
}

export function paginateAuditLogs(logs: AuditLog[], currentPage: number, pageSize = AUDIT_PAGE_SIZE) {
  return logs.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
}

export function getAuditTotalPages(totalItems: number, pageSize = AUDIT_PAGE_SIZE) {
  return Math.ceil(totalItems / pageSize) || 1;
}

export function getHighRiskAuditCount(logs: AuditLog[]) {
  return logs.filter(log => log.riskLevel === 'high').length;
}

export function buildAuditCategories(logs: AuditLog[]) {
  const counts: Record<string, number> = {};
  logs.forEach(log => {
    counts[log.category] = (counts[log.category] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
}

export function hasActiveAuditFilter(filters: {
  filterOperator: string;
  filterCategory: string;
  filterAction: string;
  filterRisk: string;
  filterTime: AuditTimeFilter;
}) {
  return Boolean(
    filters.filterOperator ||
    filters.filterCategory ||
    filters.filterAction ||
    filters.filterRisk ||
    filters.filterTime !== 'all',
  );
}

export function getAuditRiskLabel(riskLevel: string) {
  return riskLevel === 'high' ? '高危' : riskLevel === 'medium' ? '中危' : '低危';
}
