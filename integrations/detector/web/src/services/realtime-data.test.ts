import { describe, expect, it } from 'vitest';
import { normalizeTrendRange, toAuditLogList, toCameraStatsMap } from './realtime-data';

describe('realtime data helpers', () => {
  it('normalizes unsupported quarter range to month', () => {
    expect(normalizeTrendRange('day')).toBe('day');
    expect(normalizeTrendRange('quarter')).toBe('month');
  });

  it('turns camera stats SSE payload into a lookup map', () => {
    expect(
      toCameraStatsMap({
        cameras: [
          { camId: 'cam-1', personCount: 3 },
          { camId: 'cam-2', personCount: 0 },
        ],
      }),
    ).toEqual({ 'cam-1': 3, 'cam-2': 0 });
  });

  it('guards audit log subscribers against non-array payloads', () => {
    expect(toAuditLogList([{ id: '1' }])).toEqual([{ id: '1' }]);
    expect(toAuditLogList({ bad: true })).toEqual([]);
  });
});
