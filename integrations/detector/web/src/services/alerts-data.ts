import { Alert, AlertLevel, AlertType } from '../types';

export const ALERTS_PAGE_SIZE = 15;

export function filterAlerts(alerts: Alert[], filterType: string, filterStatus: string) {
  return alerts.filter(alert => {
    if (filterType && alert.type !== filterType) return false;
    if (filterStatus && alert.status !== filterStatus) return false;
    return true;
  });
}

export function paginateAlerts(alerts: Alert[], currentPage: number, pageSize = ALERTS_PAGE_SIZE) {
  return alerts.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
}

export function getAlertTotalPages(totalItems: number, pageSize = ALERTS_PAGE_SIZE) {
  return Math.ceil(totalItems / pageSize) || 1;
}

export function getAlertStatusLabel(status: Alert['status']) {
  return status === 'pending' ? '待处理' : status === 'confirmed' ? '已确认' : '已忽略';
}

export function getAlertLevelLabel(level: AlertLevel) {
  return level === AlertLevel.CRITICAL ? '四级严重'
    : level === AlertLevel.WARNING ? '三级较重'
    : level === AlertLevel.MINOR ? '二级一般'
    : '一级轻微';
}

export function getAlertTriggerRule(type: AlertType) {
  return type === AlertType.FIGHT
    ? '检测到两人或以上肢体动作剧烈冲突，持续超过3秒'
    : type === AlertType.FALL
      ? '检测到人员姿态由站立变为水平，疑似跌倒或晕厥'
      : type === AlertType.ABSENCE
        ? '检测到指定岗位持续无人值守超过设定阈值'
        : '检测到局部区域人员密度超过安全阈值';
}

export function getPendingAlertCount(alerts: Alert[]) {
  return alerts.filter(alert => alert.status === 'pending').length;
}

export function getCriticalAlertCount(alerts: Alert[]) {
  return alerts.filter(alert => alert.level === AlertLevel.CRITICAL).length;
}
