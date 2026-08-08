import Taro from '@tarojs/taro'

const encodeQuery = (params: Record<string, string>) => {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

export const openDetail = (type: string, params: Record<string, string> = {}) => {
  const query = encodeQuery({ type, ...params })
  Taro.navigateTo({ url: `/pages/detail/detail?${query}` })
}
