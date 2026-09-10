import { RegionalStat, TrendData } from '../types';

export type AnalysisTimeRange = 'week' | 'month' | 'quarter';

export const ANALYSIS_RANGE_OPTIONS = [
  { value: 'week' as const, label: '近7天' },
  { value: 'month' as const, label: '近30天' },
  { value: 'quarter' as const, label: '近90天' },
];

export function buildAnalysisTrendSummary(trendDataRaw?: TrendData) {
  if (!trendDataRaw?.labels) return { trendData: [], trendTotals: {} as Record<string, number> };
  const totals: Record<string, number> = {};
  const chart = trendDataRaw.labels.map((label, index) => {
    let sum = 0;
    for (const [key, values] of Object.entries(trendDataRaw.data)) {
      const value = values[index] ?? 0;
      sum += value;
      totals[key] = (totals[key] ?? 0) + value;
    }
    return { name: label, alerts: sum };
  });
  return { trendData: chart, trendTotals: totals };
}

export function sumAnalysisAlerts(totals: Record<string, number>) {
  return Object.values(totals).reduce((sum, value) => sum + value, 0);
}

export function getConfirmedAlertCount(alerts: Array<{ status: string }>) {
  return alerts.filter(alert => alert.status === 'confirmed').length;
}

export function getAnalysisAccuracy(totalAlerts: number, confirmedAlerts: number) {
  return totalAlerts > 0 ? Number(((confirmedAlerts / totalAlerts) * 100).toFixed(1)) : 0;
}

export function getAverageLatencyLabel(avgFps?: number) {
  return avgFps ? `${(1000 / avgFps).toFixed(0)}ms` : '—';
}

export function getBehaviorMaxValue(counts: Record<string, number>) {
  return Math.max(...Object.values(counts), 1);
}

export function getRegionalMaxValue(regionalData: RegionalStat[]) {
  return regionalData.length > 0 ? Math.max(...regionalData.map(item => item.value)) : 1;
}

export function zeroNumber(value: number, shouldZero: boolean) {
  return shouldZero ? 0 : value;
}

export function zeroString(value: string, shouldZero: boolean) {
  return shouldZero ? '0' : value;
}

export function zeroTrendData(trendData: Array<{ name: string; alerts: number }>, shouldZero: boolean) {
  return trendData.map(item => ({ ...item, alerts: zeroNumber(item.alerts, shouldZero) }));
}

export function zeroRegionalData(regionalData: RegionalStat[], shouldZero: boolean) {
  return regionalData.map(item => ({ ...item, value: zeroNumber(item.value, shouldZero) }));
}

export function buildRadarData(behaviorCounts: Record<string, number>, maxValue: number, shouldZero: boolean) {
  return [
    { subject: '打架', A: zeroNumber(behaviorCounts['打架'] ?? 0, shouldZero), fullMark: maxValue },
    { subject: '跌倒', A: zeroNumber(behaviorCounts['跌倒'] ?? 0, shouldZero), fullMark: maxValue },
    { subject: '离岗', A: zeroNumber(behaviorCounts['离岗'] ?? 0, shouldZero), fullMark: maxValue },
    { subject: '聚集', A: zeroNumber(behaviorCounts['人员聚集'] ?? 0, shouldZero), fullMark: maxValue },
  ];
}
