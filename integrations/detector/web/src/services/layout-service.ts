import { loadDevices } from './devices-service';

export async function loadLayoutCameras(signal?: AbortSignal) {
  return loadDevices(signal);
}
