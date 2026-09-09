import { describe, expect, it } from 'vitest';
import { AlertLevel, AlertType } from '../types';
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
} from './alerts-data';

describe('alerts data helpers', () => {
  const alerts = [
    { id: '1', type: AlertType.FIGHT, status: 'pending', level: AlertLevel.CRITICAL },
    { id: '2', type: AlertType.FALL, status: 'confirmed', level: AlertLevel.WARNING },
    { id: '3', type: AlertType.FIGHT, status: 'ignored', level: AlertLevel.MINOR },
  ] as any;

  it('filters alerts by type and status', () => {
    expect(filterAlerts(alerts, AlertType.FIGHT, '').map(alert => alert.id)).toEqual(['1', '3']);
    expect(filterAlerts(alerts, '', 'confirmed').map(alert => alert.id)).toEqual(['2']);
  });

  it('paginates and counts total pages', () => {
    expect(ALERTS_PAGE_SIZE).toBe(15);
    expect(paginateAlerts(alerts, 0, 2).map(alert => alert.id)).toEqual(['1', '2']);
    expect(getAlertTotalPages(0)).toBe(1);
    expect(getAlertTotalPages(31)).toBe(3);
  });

  it('formats alert labels and rules', () => {
    expect(getAlertStatusLabel('pending')).toBe('待处理');
    expect(getAlertStatusLabel('confirmed')).toBe('已确认');
    expect(getAlertLevelLabel(AlertLevel.WARNING)).toBe('三级较重');
    expect(getAlertTriggerRule(AlertType.ABSENCE)).toContain('无人值守');
  });

  it('computes pending and critical counts', () => {
    expect(getPendingAlertCount(alerts)).toBe(1);
    expect(getCriticalAlertCount(alerts)).toBe(1);
  });
});
