import type { BridgeDevice, BridgeInventory } from './device-bridges-api';

export type TrainingCamera = {
  number: 1 | 2 | 3;
  title: string;
  device?: BridgeDevice;
  bindingSlot?: number;
  caption: string;
  thermal?: boolean;
};

export function resolveTrainingCameras(inventory: BridgeInventory | null, subject = ''): TrainingCamera[] {
  const bound = (index: number) => inventory?.items.find(item => item.id === inventory.bindings[index]);
  const camera = (number: 1 | 2 | 3, index: number, thermal = false): TrainingCamera => {
    const device = bound(index);
    return {
      number, title: `0${number}路监控`, device, bindingSlot: index + 1,
      caption: device?.name ?? (!inventory ? '正在读取设备' : inventory.bindings[index] ? '绑定设备不可用' : '未绑定摄像头'),
      thermal,
    };
  };
  const robot = camera(1, 0, true);
  const dahua = camera(2, 2);
  const hikvision = camera(3, 1);
  if (subject !== '防爆先期处置') return [dahua, hikvision];

  return [{
    ...robot,
    caption: robot.device ? `${robot.device.name} · 机械狗视角`
      : !inventory ? '正在读取机械狗设备'
        : inventory.bindings[0] ? '绑定机械狗设备不可用' : '未绑定机械狗设备',
  }, dahua];
}
