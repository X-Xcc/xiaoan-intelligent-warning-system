import { describe, expect, it } from 'vitest';
import { buildBehaviorCounts, buildDashboardTrend, buildDistributionData, DASHBOARD_RANGE_OPTIONS, selectRecentAlerts, sumDistributionValues } from './dashboard-data';

describe('dashboard data helpers', () => {
  it('builds normalized trend rows and keys', () => {
    expect(buildDashboardTrend({ labels: ['Mon', 'Tue'], data: { 打架: [1, 2], 跌倒: [0, 3] } })).toEqual({
      trendKeys: ['打架', '跌倒'],
      trendData: [
        { name: 'Mon', 打架: 1, 跌倒: 0 },
        { name: 'Tue', 打架: 2, 跌倒: 3 },
      ],
    });
  });

  it('aggregates behavior counts from mixed alert types', () => {
    expect(buildBehaviorCounts([
      { type: 'fight' },
      { type: 'fall' },
      { type: '打架' },
      { type: 'gathering' },
    ] as any)).toEqual({ 打架: 2, 跌倒: 1, 离岗: 0, 人员聚集: 1 });
  });

  it('builds distribution totals and sums values', () => {
    const distribution = buildDistributionData(
      [
        { name: 'Mon', 打架: 1, 跌倒: 2, 离岗: 0, 人员聚集: 4 },
        { name: 'Tue', 打架: 3, 跌倒: 0, 离岗: 1, 人员聚集: 1 },
      ],
      ['打架', '跌倒', '离岗', '人员聚集'],
      { 打架: '#1', 跌倒: '#2', 离岗: '#3', 人员聚集: '#4' },
    );

    expect(distribution).toEqual([
      { name: '打架', value: 4, color: '#1' },
      { name: '跌倒', value: 2, color: '#2' },
      { name: '离岗', value: 1, color: '#3' },
      { name: '人员聚集', value: 5, color: '#4' },
    ]);
    expect(sumDistributionValues(distribution)).toBe(12);
  });

  it('keeps latest snapshot alerts only', () => {
    const alerts = Array.from({ length: 12 }, (_, index) => ({ id: String(index), snapshotUrl: index % 2 === 0 ? '/ok.jpg' : '' }));
    expect(selectRecentAlerts(alerts as any, 3).map(alert => alert.id)).toEqual(['0', '2', '4']);
  });

  it('exposes dashboard range options', () => {
    expect(DASHBOARD_RANGE_OPTIONS.map(option => option.key)).toEqual(['day', 'week', 'month']);
  });
});
