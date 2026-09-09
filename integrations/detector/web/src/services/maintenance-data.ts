import type { SystemStatus, ModelInfo } from '../types';

export function getGaugeSubLabel(value: number, kind: 'cpu' | 'memory' | 'storage' | 'gpu') {
  if (kind === 'cpu') return value > 80 ? '负载较高' : '正常';
  if (kind === 'memory') return value > 85 ? '高负载' : '正常';
  if (kind === 'storage') return value > 90 ? '不足' : '充足';
  return value > 80 ? '满载' : '空闲';
}

export function getGaugeColor(value: number, kind: 'cpu' | 'memory' | 'storage' | 'gpu') {
  if (kind === 'cpu') return value > 80 ? 'text-danger-red' : 'text-primary';
  if (kind === 'memory') return value > 85 ? 'text-danger-red' : value > 70 ? 'text-warning-orange' : 'text-success-green';
  if (kind === 'storage') return value > 90 ? 'text-danger-red' : 'text-info-cyan';
  return 'text-success-green';
}

export function buildMaintenanceGauges(status: SystemStatus) {
  return [
    { key: 'cpu' as const, value: status.cpuUsage, label: 'CPU', sub: getGaugeSubLabel(status.cpuUsage, 'cpu'), color: getGaugeColor(status.cpuUsage, 'cpu') },
    { key: 'memory' as const, value: status.memoryUsage, label: '内存', sub: getGaugeSubLabel(status.memoryUsage, 'memory'), color: getGaugeColor(status.memoryUsage, 'memory') },
    { key: 'storage' as const, value: status.storageUsage, label: '存储', sub: getGaugeSubLabel(status.storageUsage, 'storage'), color: getGaugeColor(status.storageUsage, 'storage') },
    { key: 'gpu' as const, value: status.gpuUsage, label: 'GPU', sub: getGaugeSubLabel(status.gpuUsage, 'gpu'), color: getGaugeColor(status.gpuUsage, 'gpu') },
  ];
}

export function buildVersionInfo(status: SystemStatus, modelInfo: ModelInfo | undefined) {
  return [
    { label: '当前版本', value: status.version },
    { label: '核心引擎', value: status.engine ?? '—' },
    { label: 'AI 模型', value: modelInfo?.model_size_mb ? `YOLOv8n (${modelInfo.model_size_mb}MB)` : '—' },
    { label: '推理设备', value: modelInfo?.device ?? '—' },
    { label: '精度模式', value: modelInfo?.precision ?? '—' },
  ];
}

export function buildFallbackServices() {
  return ['检测引擎', '视频流服务', '告警服务'].map(name => ({
    name,
    health: 'healthy',
  }));
}
