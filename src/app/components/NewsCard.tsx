'use client'

import { useState } from 'react'
import { ExternalLink, Check, Play, X } from 'lucide-react'

interface NewsItem {
  id: string
  source: string
  title: string | null
  url: string
  rawData: Record<string, unknown>
  summary: string | null
  fetchedAt: number
  isRead: boolean
}

interface NewsCardProps {
  item: NewsItem
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
}

const sourceConfig: Record<string, { label: string; color: string }> = {
  github: { label: 'GitHub', color: 'bg-stone-800 text-white' },
  producthunt: { label: 'Product Hunt', color: 'bg-orange-500 text-white' },
  twitter: { label: 'X / Twitter', color: 'bg-blue-500 text-white' },
}

export default function NewsCard({ item, onMarkRead, onMarkUnread }: NewsCardProps) {
  const [showMedia, setShowMedia] = useState(false)
  const rawData = item.rawData
  const source = sourceConfig[item.source] || { label: item.source, color: 'bg-stone-500 text-white' }

  const getDescription = () => {
    switch (item.source) {
      case 'github':
        return rawData.description as string
      case 'producthunt':
        return rawData.tagline as string
      case 'twitter':
        return (rawData.text as string)?.slice(0, 200)
      default:
        return ''
    }
  }

  const getMetrics = () => {
    switch (item.source) {
      case 'github':
        return rawData.stars ? `${(rawData.stars as number).toLocaleString()} stars` : null
      case 'producthunt':
        return rawData.votes ? `${rawData.votes} votes` : null
      case 'twitter':
        return rawData.likes ? `${rawData.likes} likes` : null
      default:
        return null
    }
  }

  const previewImage = rawData.previewImage as string | null
  const mediaType = rawData.mediaType as string | null
  const mediaUrl = rawData.mediaUrl as string | null
  const photos = (rawData.photos as string[]) || []
  const videos = (rawData.videos as string[]) || []
  const media = (rawData.media as Array<{ type: string; url: string; thumbnail?: string; embedHtml?: string }>) || []

  return (
    <div className={`group relative rounded-lg transition-all duration-200 cursor-pointer overflow-hidden ${
      item.isRead ? 'card-read' : 'card-unread hover:shadow-md'
    }`}>
      {/* 预览图 */}
      {previewImage && (
        <div className="relative w-full h-48 bg-stone-100 overflow-hidden">
          <img
            src={previewImage}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          {/* 视频播放按钮 */}
          {(mediaType === 'video' || videos.length > 0) && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMedia(true)
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
            >
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                <Play className="w-8 h-8 text-stone-900 ml-1" />
              </div>
            </button>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${source.color}`}>
                {source.label}
              </span>
              {getMetrics() && (
                <span className="text-xs text-stone-500">{getMetrics()}</span>
              )}
            </div>
            <h3 className="font-serif text-lg font-semibold leading-tight text-stone-900 line-clamp-2">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-red-600 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {item.title}
              </a>
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-stone-600 line-clamp-2 mb-3">
          {getDescription()}
        </p>

        {/* 多张图片预览 */}
        {!previewImage && photos.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto">
            {photos.slice(0, 3).map((photo, i) => (
              <img
                key={i}
                src={photo}
                alt=""
                className="h-24 rounded object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {/* Product Hunt 嵌入媒体 */}
        {item.source === 'producthunt' && media.length > 0 && (
          <div className="mb-3">
            {media.slice(0, 1).map((m, i) => (
              <div key={i} className="relative">
                {m.embedHtml ? (
                  <div
                    className="aspect-video rounded overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: m.embedHtml }}
                  />
                ) : m.thumbnail ? (
                  <img
                    src={m.thumbnail}
                    alt=""
                    className="w-full h-48 rounded object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* AI Summary */}
        {item.summary && (
          <div className="bg-stone-50 rounded-md p-3 mb-3">
            <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">
              {item.summary}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span>{new Date(item.fetchedAt).toLocaleString('zh-CN')}</span>
          <div className="flex items-center gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-stone-600 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>原文</span>
            </a>
            {!item.isRead ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkRead(item.id)
                }}
                className="flex items-center gap-1 hover:text-green-600 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>已读</span>
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkUnread(item.id)
                }}
                className="flex items-center gap-1 hover:text-amber-600 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>未读</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 视频弹窗 */}
      {showMedia && (videos.length > 0 || mediaUrl) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowMedia(false)}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowMedia(false)}
              className="absolute -top-10 right-0 text-white hover:text-stone-300"
            >
              <X className="w-8 h-8" />
            </button>
            <video
              src={videos[0] || mediaUrl || ''}
              controls
              autoPlay
              className="w-full rounded"
            />
          </div>
        </div>
      )}
    </div>
  )
}
