import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_RANGE_OPTIONS,
  buildAnalysisTrendSummary,
  buildRadarData,
  getAnalysisAccuracy,
  getAverageLatencyLabel,
  getBehaviorMaxValue,
  getConfirmedAlertCount,
  getRegionalMaxValue,
  sumAnalysisAlerts,
  zeroNumber,
  zeroRegionalData,
  zeroString,
  zeroTrendData,
} from './analysis-data';

describe('analysis data helpers', () => {
  it('builds trend summary and totals', () => {
    const summary = buildAnalysisTrendSummary({
      labels: ['Mon', 'Tue'],
      data: {
        打架: [1, 2],
        跌倒: [0, 3],
      },
    } as any);

    expect(summary).toEqual({
      trendData: [
        { name: 'Mon', alerts: 1 },
        { name: 'Tue', alerts: 5 },
      ],
      trendTotals: {
        打架: 3,
        跌倒: 3,
      },
    });
    expect(sumAnalysisAlerts(summary.trendTotals)).toBe(6);
  });

  it('computes accuracy, latency and maxima', () => {
    expect(getConfirmedAlertCount([{ status: 'confirmed' }, { status: 'pending' }] as any)).toBe(1);
    expect(getAnalysisAccuracy(4, 3)).toBe(75);
    expect(getAverageLatencyLabel(25)).toBe('40ms');
    expect(getBehaviorMaxValue({ 打架: 5, 跌倒: 2 })).toBe(5);
    expect(getRegionalMaxValue([{ value: 4 }, { value: 9 }] as any)).toBe(9);
  });

  it('zeros values when zero mode enabled', () => {
    expect(zeroNumber(8, true)).toBe(0);
    expect(zeroString('18', true)).toBe('0');
    expect(zeroTrendData([{ name: 'Mon', alerts: 6 }], true)).toEqual([{ name: 'Mon', alerts: 0 }]);
    expect(zeroRegionalData([{ name: 'A', value: 3, color: '#f00' }] as any, true)[0].value).toBe(0);
  });

  it('builds radar data and exposes ranges', () => {
    expect(buildRadarData({ 打架: 1, 跌倒: 2, 离岗: 3, 人员聚集: 4 }, 8, false)).toEqual([
      { subject: '打架', A: 1, fullMark: 8 },
      { subject: '跌倒', A: 2, fullMark: 8 },
      { subject: '离岗', A: 3, fullMark: 8 },
      { subject: '聚集', A: 4, fullMark: 8 },
    ]);
    expect(ANALYSIS_RANGE_OPTIONS.map(option => option.value)).toEqual(['week', 'month', 'quarter']);
  });
});
