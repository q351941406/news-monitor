'use client'

import { ExternalLink, Check, X } from 'lucide-react'

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
  const rawData = item.rawData
  const source = sourceConfig[item.source] || { label: item.source, color: 'bg-stone-500 text-white' }

  const getDescription = () => {
    switch (item.source) {
      case 'github':
        return rawData.description as string
      case 'producthunt':
        return rawData.tagline as string
      case 'twitter':
        return rawData.text as string
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
  const description = getDescription()

  // 清理文本中的转义字符
  const cleanText = (text: string) => {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
  }

  return (
    <div className={`group relative rounded-lg transition-all duration-200 cursor-pointer ${
      item.isRead ? 'card-read' : 'card-unread hover:shadow-md'
    }`}>
      <div className="p-4">
        <div className="flex gap-4">
          {/* 左侧大正方形图片 */}
          {previewImage && (
            <div className="flex-shrink-0">
              <div className="w-[140px] h-[140px] rounded-lg overflow-hidden bg-stone-100">
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
          <div className="flex-1 min-w-0 flex flex-col">
            {/* 标签和指标 */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${source.color}`}>
                {source.label}
              </span>
              {getMetrics() && (
                <span className="text-xs text-stone-500">{getMetrics()}</span>
              )}
              <span className="text-xs text-stone-400 ml-auto">
                {new Date(item.fetchedAt).toLocaleString('zh-CN')}
              </span>
            </div>

            {/* 标题 */}
            <h3 className="font-serif text-base font-semibold leading-tight text-stone-900 mb-2">
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

            {/* AI 摘要 */}
            {item.summary && (
              <div className="bg-amber-50 rounded-md p-2 mb-2 border border-amber-100">
                <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">
                  {item.summary}
                </p>
              </div>
            )}

            {/* 原文内容（完整显示） */}
            {description && (
              <div className="flex-1 overflow-y-auto max-h-[200px] mb-2">
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap break-words">
                  {cleanText(description)}
                </p>
              </div>
            )}

            {/* 底部操作 */}
            <div className="flex items-center gap-2 mt-auto pt-2 border-t border-stone-100">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition-colors"
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
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-green-600 transition-colors ml-auto"
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
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-amber-600 transition-colors ml-auto"
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
  )
}
