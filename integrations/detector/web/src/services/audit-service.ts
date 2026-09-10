import { exportAuditLogs } from './dataService';
import type { AuditTimeFilter } from './audit-data';

export function exportAuditReport(params: {
  searchTerm: string;
  filterCategory: string;
  filterRisk: string;
  filterTime: AuditTimeFilter;
}) {
  exportAuditLogs({
    search: params.searchTerm || undefined,
    category: params.filterCategory || undefined,
    riskLevel: params.filterRisk || undefined,
    page: 0,
    size: 200,
  });
}
