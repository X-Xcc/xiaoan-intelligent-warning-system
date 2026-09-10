import { useState } from 'react'
import { Button, Image, Text, Video, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Icon } from '@/components/ui'
import type { EvidenceItem } from '@/types/events'
import { resolveEvidenceUrl } from '@/utils/api'

export function EventEvidence({ items }: { items: EvidenceItem[] }) {
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const [revisions, setRevisions] = useState<Record<string, number>>({})
  const resolved = items.map((item) => {
    try {
      const url = resolveEvidenceUrl(item.url || '')
      return { ...item, url: /^https?:\/\//i.test(url) ? url : '' }
    } catch {
      return { ...item, url: '' }
    }
  })
  const images = resolved.filter((item) => item.kind === 'image' && item.url).map((item) => item.url)

  const preview = async (url: string) => {
    try {
      await Taro.previewImage({ current: url, urls: images })
    } catch {
      await Taro.showToast({ title: '图片预览未打开，请重试', icon: 'none' })
    }
  }

  const copyLink = async (url: string) => {
    try {
      await Taro.setClipboardData({ data: url })
    } catch {
      await Taro.showToast({ title: '链接未复制，请重试', icon: 'none' })
    }
  }

  if (!items.length) {
    return <View className='detail-empty-media'><Icon name='image' tone='muted' size={40} /><Text>这条记录暂无附件</Text></View>
  }

  return (
    <View className='detail-evidence-grid'>
      {resolved.map((item, index) => {
        const key = `${item.kind}:${items[index].url}`
        const label = item.name || `${item.kind === 'image' ? '现场照片' : item.kind === 'video' ? '现场视频' : '附件'} ${index + 1}`
        const media = item.kind === 'image' || item.kind === 'video'
        return (
          <View className={`detail-evidence-item${item.kind !== 'image' ? ' detail-evidence-wide' : ''}`} key={key}>
            {!item.url || failed[key] ? (
              <View className='detail-media-error'>
                <Icon name='info' tone='muted' size={36} /><Text>{item.url ? '材料加载失败' : '附件地址不可用'}</Text>
                {item.url && <Button className='detail-inline-button' onClick={() => {
                  setFailed((previous) => ({ ...previous, [key]: false }))
                  setRevisions((previous) => ({ ...previous, [key]: (previous[key] || 0) + 1 }))
                }}><Icon name='refresh' tone='blue' size={28} /><Text>重试</Text></Button>}
              </View>
            ) : item.kind === 'image' ? (
              <Image
                key={`${key}:${revisions[key] || 0}`}
                className='detail-evidence-image'
                src={item.url}
                mode='aspectFit'
                lazyLoad
                onClick={() => void preview(item.url)}
                onError={() => setFailed((previous) => ({ ...previous, [key]: true }))}
              />
            ) : item.kind === 'video' ? (
              <Video
                key={`${key}:${revisions[key] || 0}`}
                className='detail-evidence-video'
                src={item.url}
                controls
                autoplay={false}
                objectFit='contain'
                onError={() => setFailed((previous) => ({ ...previous, [key]: true }))}
              />
            ) : (
              <Button className='mini-secondary detail-button' onClick={() => void copyLink(item.url)}>
                <Icon name='link' tone='blue' size={32} /><Text>复制附件链接</Text>
              </Button>
            )}
            <View className='detail-evidence-label'>
              <Icon name={item.kind === 'video' ? 'video' : media ? 'image' : 'link'} tone='muted' size={24} />
              <Text>{label}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}
