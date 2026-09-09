import { fetchAuditLogsPage, fetchAuditTrend, fetchAutomationRate, fetchFpsStats, fetchModelInfo, fetchRegionalStats, fetchTrendData, subscribeToAuditLogs, subscribeToSystemStatus } from './dataService';
import type { AuditLog, FpsStats, ModelInfo, RegionalStat, SystemStatus, TrendData } from '../types';

export function normalizeTrendRange(range: 'day' | 'week' | 'month' | 'quarter'): 'day' | 'week' | 'month' {
  return range === 'quarter' ? 'month' : range;
}

export function toAuditLogList(data: unknown): AuditLog[] {
  return Array.isArray(data) ? (data as AuditLog[]) : [];
}

export function toCameraStatsMap(data: unknown): Record<string, number> {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { cameras?: unknown[] }).cameras)) {
    return {};
  }

  const stats: Record<string, number> = {};
  for (const camera of (data as { cameras: Array<{ camId?: string; personCount?: number }> }).cameras) {
    if (camera.camId) stats[camera.camId] = camera.personCount ?? 0;
  }
  return stats;
}

export async function loadSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
  return new Promise<SystemStatus>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        unsubscribe();
        reject(new Error('SSE system_metrics timeout'));
      }
    }, 10000);

    const unsubscribe = subscribeToSystemStatus(status => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        unsubscribe();
        resolve(status);
      }
    });

    signal?.addEventListener('abort', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        unsubscribe();
        reject(new DOMException('Aborted', 'AbortError'));
      }
    }, { once: true });
  });
}

export function subscribeSystemStatus(callback: (status: SystemStatus) => void): () => void {
  return subscribeToSystemStatus(callback);
}

export async function loadModelInfo(signal?: AbortSignal): Promise<ModelInfo> {
  return fetchModelInfo(signal);
}

export async function loadTrendData(range: 'day' | 'week' | 'month' | 'quarter', signal?: AbortSignal): Promise<TrendData> {
  return fetchTrendData(normalizeTrendRange(range), signal);
}

export async function loadRegionalStats(signal?: AbortSignal): Promise<RegionalStat[]> {
  return fetchRegionalStats(signal);
}

export async function loadFpsStats(signal?: AbortSignal): Promise<FpsStats> {
  return fetchFpsStats(signal);
}

export async function loadAuditLogs(signal?: AbortSignal): Promise<AuditLog[]> {
  const page = await fetchAuditLogsPage({ page: 0, size: 200 }, signal);
  return page.items ?? [];
}

export function subscribeAuditLogs(callback: (logs: AuditLog[]) => void): () => void {
  return subscribeToAuditLogs(data => callback(toAuditLogList(data)));
}

export async function loadAuditTrend(range: 'day' | 'week' = 'week', signal?: AbortSignal): Promise<TrendData> {
  return fetchAuditTrend(range, signal);
}

export async function loadAutomationRate(): Promise<{ rate: number }> {
  return fetchAutomationRate();
}
