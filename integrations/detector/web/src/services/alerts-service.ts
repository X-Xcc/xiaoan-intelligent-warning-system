import { exportAlerts } from './dataService';

export function exportAlertsReport(filterType: string, filterStatus: string) {
  exportAlerts({
    type: filterType || undefined,
    status: filterStatus || undefined,
  });
}
