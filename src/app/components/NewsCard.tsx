'use client'

import { ExternalLink, Check, Play, X } from 'lucide-react'
import { useState } from 'react'

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

  return (
    <div className={`group relative rounded-lg transition-all duration-200 cursor-pointer ${
      item.isRead ? 'card-read' : 'card-unread hover:shadow-md'
    }`}>
      <div className="p-4">
        <div className="flex gap-3">
          {/* 左侧正方形图片 */}
          {previewImage && (
            <div className="flex-shrink-0">
              <div className="w-[80px] h-[80px] md:w-[80px] md:h-[80px] rounded-lg overflow-hidden bg-stone-100">
                <img
                  src={previewImage}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            </div>
          )}

          {/* 右侧内容 */}
          <div className="flex-1 min-w-0">
            {/* 标签和指标 */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${source.color}`}>
                {source.label}
              </span>
              {getMetrics() && (
                <span className="text-xs text-stone-500">{getMetrics()}</span>
              )}
            </div>

            {/* 标题 */}
            <h3 className="font-serif text-base font-semibold leading-tight text-stone-900 line-clamp-1 mb-1">
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

            {/* 描述 */}
            <p className="text-sm text-stone-600 line-clamp-2 mb-2">
              {getDescription()}
            </p>

            {/* AI 摘要 */}
            {item.summary && (
              <div className="bg-stone-50 rounded-md p-2 mb-2">
                <p className="text-xs text-stone-700 leading-relaxed line-clamp-3 whitespace-pre-line">
                  {item.summary}
                </p>
              </div>
            )}

            {/* 底部操作 */}
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
        </div>
      </div>
    </div>
  )
}
