import { bridgeErrorMessage, bridgeSourceKey, hasFreshFrame, requestBridgeSnapshot, type BridgeDevice } from './device-bridges-api';
import { processThermalFrame, type ThermalMetrics } from './thermal-frame';

export type ThermalDisplayMode = 'thermal' | 'original';
export type ThermalVideoFrame = {
  deviceId: string;
  sourceKey: string;
  mode: ThermalDisplayMode;
  edges: boolean;
  receivedAt: number;
  fps: number | null;
  metrics: ThermalMetrics;
};

export function startThermalStream(options: {
  canvas: HTMLCanvasElement;
  device: () => BridgeDevice | undefined;
  mode: ThermalDisplayMode;
  edges: boolean;
  onFrame: (frame: ThermalVideoFrame | null) => void;
  onError: (message: string) => void;
}): () => void {
  const controller = new AbortController();
  const context = options.canvas.getContext('2d', { willReadFrequently: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let count = 0;
  let fps: number | null = null;
  let fpsStarted = performance.now();

  const load = async () => {
    const startedAt = performance.now();
    let interval = 125;
    let bitmap: ImageBitmap | undefined;
    try {
      const device = options.device();
      if (document.hidden || !device || !hasFreshFrame(device)) {
        options.onFrame(null);
        interval = 1000;
        return;
      }
      const sourceKey = bridgeSourceKey(device);
      const blob = await requestBridgeSnapshot(device.id, controller.signal);
      if (controller.signal.aborted) return;
      const receivedAt = Date.now();
      bitmap = await createImageBitmap(blob);
      if (controller.signal.aborted) return;
      const latest = options.device();
      if (document.hidden || !latest || bridgeSourceKey(latest) !== sourceKey
        || !hasFreshFrame(latest) || Date.now() - receivedAt > 10000) {
        options.onFrame(null);
        interval = 1000;
        return;
      }
      if (!bitmap.width || !bitmap.height) throw new Error('视频帧尺寸无效');
      const scale = Math.min(1, 480 / bitmap.width, 360 / bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      if (options.canvas.width !== width) options.canvas.width = width;
      if (options.canvas.height !== height) options.canvas.height = height;
      context!.drawImage(bitmap, 0, 0, width, height);
      const input = context!.getImageData(0, 0, width, height);
      const result = processThermalFrame(input.data, width, height, options.edges);
      if (options.mode === 'thermal') {
        input.data.set(result.pixels);
        context!.putImageData(input, 0, 0);
      }
      count++;
      const elapsed = performance.now() - fpsStarted;
      if (elapsed >= 1000) {
        fps = count * 1000 / elapsed;
        fpsStarted = performance.now();
        count = 0;
      }
      options.onError('');
      options.onFrame({
        deviceId: device.id, sourceKey, mode: options.mode, edges: options.edges,
        receivedAt, fps, metrics: result.metrics,
      });
    } catch (error) {
      interval = 1000;
      if (!controller.signal.aborted) {
        options.onFrame(null);
        options.onError(bridgeErrorMessage(error));
      }
    } finally {
      bitmap?.close();
      // One request/decode/paint finishes before the next request is scheduled.
      if (!controller.signal.aborted) timer = setTimeout(load, Math.max(0, interval - (performance.now() - startedAt)));
    }
  };
  if (!context) {
    options.onFrame(null);
    options.onError('当前浏览器无法处理视频画面');
  } else {
    void load();
  }
  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}
