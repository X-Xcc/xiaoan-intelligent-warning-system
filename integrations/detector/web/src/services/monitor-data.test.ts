import { describe, expect, it, vi } from 'vitest';
import { AlertLevel, AlertType, CameraStatus } from '../types';
import { ALARM_CONFIGS, ALARM_TO_ALERT, buildMonitorAlert, getMonitorSlotCameras, normalizeActiveAlarms } from './monitor-data';

describe('monitor data helpers', () => {
  it('keeps monitor slots in fixed device order', () => {
    const cameras = [
      { id: 'cam-10', name: '大华', status: CameraStatus.ONLINE },
      { id: 'cam-11', name: '海康', status: CameraStatus.ONLINE },
      { id: 'cam-12', name: 'USB', status: CameraStatus.ONLINE },
    ] as any;

    expect(getMonitorSlotCameras(cameras).map(camera => camera?.id)).toEqual(['cam-12', 'cam-10', 'cam-11']);
  });

  it('builds a monitor alert from alarm type and preferred camera', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    const now = new Date('2026-06-06T04:43:00.000Z');
    const cameras = [
      { id: 'cam-12', name: 'USB', status: CameraStatus.ONLINE },
      { id: 'cam-10', name: '大华', status: CameraStatus.ONLINE },
    ] as any;

    const alert = buildMonitorAlert('fight', cameras, 'data:image/jpeg;base64,abc', now);

    expect(alert.cameraId).toBe('cam-12');
    expect(alert.cameraName).toBe('USB');
    expect(alert.type).toBe(AlertType.FIGHT);
    expect(alert.level).toBe(AlertLevel.CRITICAL);
    expect(alert.snapshotUrl).toBe('data:image/jpeg;base64,abc');
    expect(alert.message).toBe(ALARM_CONFIGS.fight.msg);
    expect(alert.id).toContain(`ALT-${now.getTime()}-`);

    randomSpy.mockRestore();
  });

  it('removes acknowledged alarm and updates fullscreen flag', () => {
    const result = normalizeActiveAlarms(new Set(['fight', 'fall']), 'fight');
    expect([...result.activeAlarms]).toEqual(['fall']);
    expect(result.alarmFullscreen).toBe(true);

    const cleared = normalizeActiveAlarms(new Set(['fight']), 'fight');
    expect([...cleared.activeAlarms]).toEqual([]);
    expect(cleared.alarmFullscreen).toBe(false);
  });

  it('keeps alarm type mapping stable', () => {
    expect(ALARM_TO_ALERT.gathering).toEqual({ type: AlertType.CROWD, level: AlertLevel.MINOR });
  });
});
