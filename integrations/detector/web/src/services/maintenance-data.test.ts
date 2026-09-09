import { describe, expect, it } from 'vitest';
import { buildFallbackServices, buildMaintenanceGauges, buildVersionInfo, getGaugeColor, getGaugeSubLabel } from './maintenance-data';

describe('maintenance data helpers', () => {
  it('computes gauge sub labels and colors', () => {
    expect(getGaugeSubLabel(81, 'cpu')).toBe('负载较高');
    expect(getGaugeSubLabel(60, 'gpu')).toBe('空闲');
    expect(getGaugeColor(86, 'memory')).toBe('text-danger-red');
    expect(getGaugeColor(75, 'memory')).toBe('text-warning-orange');
  });

  it('builds maintenance gauges', () => {
    expect(buildMaintenanceGauges({ cpuUsage: 10, memoryUsage: 20, storageUsage: 30, gpuUsage: 40 } as any).map(item => item.key)).toEqual(['cpu', 'memory', 'storage', 'gpu']);
  });

  it('builds version info and fallback services', () => {
    expect(buildVersionInfo({ version: '1.0.0', engine: 'core-x' } as any, { model_size_mb: 12, device: 'cuda', precision: 'fp16' } as any)).toEqual([
      { label: '当前版本', value: '1.0.0' },
      { label: '核心引擎', value: 'core-x' },
      { label: 'AI 模型', value: 'YOLOv8n (12MB)' },
      { label: '推理设备', value: 'cuda' },
      { label: '精度模式', value: 'fp16' },
    ]);
    expect(buildFallbackServices()).toEqual([
      { name: '检测引擎', health: 'healthy' },
      { name: '视频流服务', health: 'healthy' },
      { name: '告警服务', health: 'healthy' },
    ]);
  });
});
