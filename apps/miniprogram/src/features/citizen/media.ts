import Taro from '@tarojs/taro'
import type { HelpForm } from '@/types/events'

export type LocalMedia = HelpForm['evidence'][number]

export async function selectPhotos(count = 3): Promise<LocalMedia[]> {
  try {
    const result = await Taro.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    return result.tempFilePaths.map((filePath) => ({ kind: 'image' as const, filePath }))
  } catch (error) {
    if (!String((error as { errMsg?: string })?.errMsg || error).includes('cancel')) {
      Taro.showToast({ title: '未能打开相册，请检查权限', icon: 'none' })
    }
    return []
  }
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export async function callTelephone(number = '110') {
  const result = await Taro.showModal({
    title: number === '110' ? '拨打 110 电话报警' : '拨打联系电话',
    content: number === '110' ? '即将打开电话拨号。电话报警与平台求助是两个独立渠道。' : number,
    confirmText: '拨打',
  })
  if (!result.confirm) return
  try {
    await Taro.makePhoneCall({ phoneNumber: number })
  } catch {
    Taro.showToast({ title: '未能打开拨号，请使用电话拨打', icon: 'none' })
  }
}
