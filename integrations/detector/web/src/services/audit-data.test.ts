import { describe, expect, it } from 'vitest';
import {
  AUDIT_PAGE_SIZE,
  AUDIT_TIME_OPTIONS,
  AUDIT_TREND_OPTIONS,
  buildAuditCategories,
  buildAuditTrend,
  filterAuditLogs,
  getAuditRiskLabel,
  getAuditTotalPages,
  getHighRiskAuditCount,
  hasActiveAuditFilter,
  paginateAuditLogs,
} from './audit-data';

describe('audit data helpers', () => {
  const logs = [
    { id: '1', action: '用户登录系统', category: '登录管理', operatorName: '用户1', timestamp: '2026-06-06T00:00:00.000Z', riskLevel: 'high' },
    { id: '2', action: '导出月度报表', category: '数据导出', operatorName: '用户2', timestamp: '2026-06-04T00:00:00.000Z', riskLevel: 'medium' },
    { id: '3', action: '查看监控回放', category: '告警处理', operatorName: '用户1', timestamp: '2026-05-01T00:00:00.000Z', riskLevel: 'low' },
  ] as any;

  it('builds trend rows and exposes options', () => {
    expect(buildAuditTrend({ labels: ['Mon', 'Tue'], data: [3, 5] })).toEqual([
      { name: 'Mon', value: 3 },
      { name: 'Tue', value: 5 },
    ]);
    expect(AUDIT_PAGE_SIZE).toBe(15);
    expect(AUDIT_TREND_OPTIONS.map(option => option.value)).toEqual(['day', 'week']);
    expect(AUDIT_TIME_OPTIONS.map(option => option.value)).toEqual(['all', 'today', 'week', 'month']);
  });

  it('filters logs by text and structured filters', () => {
    expect(filterAuditLogs(logs, {
      searchTerm: '导出',
      filterTime: 'all',
      filterOperator: '',
      filterCategory: '',
      filterAction: '',
      filterRisk: '',
    }, Date.parse('2026-06-06T12:00:00.000Z')).map(log => log.id)).toEqual(['2']);

    expect(filterAuditLogs(logs, {
      searchTerm: '',
      filterTime: 'week',
      filterOperator: '用户1',
      filterCategory: '',
      filterAction: '',
      filterRisk: 'high',
    }, Date.parse('2026-06-06T12:00:00.000Z')).map(log => log.id)).toEqual(['1']);
  });

  it('paginates and summarizes audit logs', () => {
    expect(paginateAuditLogs(logs, 0, 2).map(log => log.id)).toEqual(['1', '2']);
    expect(getAuditTotalPages(31)).toBe(3);
    expect(getHighRiskAuditCount(logs)).toBe(1);
    expect(buildAuditCategories(logs)).toEqual([
      ['登录管理', 1],
      ['数据导出', 1],
      ['告警处理', 1],
    ]);
  });

  it('detects active filters and formats risk labels', () => {
    expect(hasActiveAuditFilter({ filterOperator: '', filterCategory: '', filterAction: '', filterRisk: '', filterTime: 'all' })).toBe(false);
    expect(hasActiveAuditFilter({ filterOperator: '', filterCategory: '数据导出', filterAction: '', filterRisk: '', filterTime: 'all' })).toBe(true);
    expect(getAuditRiskLabel('medium')).toBe('中危');
  });
});
