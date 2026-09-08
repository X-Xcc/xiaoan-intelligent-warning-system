import Taro from '@tarojs/taro'
import { getNavigablePoint } from '@/data/detail'
import type { GeoPoint } from '@/types/events'

export async function goToMain(query: string) {
  try {
    await Taro.redirectTo({ url: `/pages/main/main?${query}` })
  } catch {
    await Taro.showToast({ title: '页面未打开，请返回首页重试', icon: 'none' })
  }
}

export async function openPoint(point: Partial<GeoPoint> | undefined, name: string, address = name) {
  const destination = getNavigablePoint(point)
  if (!destination) {
    await Taro.showToast({ title: '尚无可导航的准确坐标', icon: 'none' })
    return
  }
  try {
    await Taro.openLocation({
      latitude: destination.latitude,
      longitude: destination.longitude,
      name: destination.name || name,
      address,
      scale: 16,
    })
  } catch {
    await Taro.showToast({ title: '地图未打开，请检查定位权限', icon: 'none' })
  }
}

export async function confirmPhoneCall(phoneNumber: string, title: string) {
  if (!phoneNumber) return
  try {
    const confirmation = await Taro.showModal({
      title,
      content: `拨打 ${phoneNumber}？`,
      confirmText: '拨打',
      cancelText: '取消',
      confirmColor: '#0d7ff9',
    })
    if (!confirmation.confirm) return
    await Taro.makePhoneCall({ phoneNumber })
  } catch {
    await Taro.showToast({ title: '未能发起拨号，可手动拨打', icon: 'none' })
  }
}
