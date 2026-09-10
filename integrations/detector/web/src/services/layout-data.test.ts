import { describe, expect, it } from 'vitest';
import { createLayoutMonitorLinks, shouldOpenMonitorMenu } from './layout-data';

describe('layout data helpers', () => {
  it('builds monitor submenu links from cameras', () => {
    expect(createLayoutMonitorLinks([
      { id: 'cam-10', status: 'online' },
      { id: 'cam-11', status: 'offline' },
    ] as any)).toEqual([
      { id: 'cam-10', label: '视频1', href: '/monitor?cam=cam-10', isOnline: true },
      { id: 'cam-11', label: '视频2', href: '/monitor?cam=cam-11', isOnline: false },
    ]);
  });

  it('opens monitor menu on protected monitor route', () => {
    expect(shouldOpenMonitorMenu('/monitor', '/monitor')).toBe(true);
    expect(shouldOpenMonitorMenu('/devices', '/monitor')).toBe(false);
  });
});
