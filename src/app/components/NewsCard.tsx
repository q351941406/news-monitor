'use client'

import { ExternalLink, Check } from 'lucide-react'

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
}

const sourceConfig: Record<string, { label: string; color: string }> = {
  github: { label: 'GitHub', color: 'bg-stone-800 text-white' },
  producthunt: { label: 'Product Hunt', color: 'bg-orange-500 text-white' },
  twitter: { label: 'X / Twitter', color: 'bg-blue-500 text-white' },
}

export default function NewsCard({ item, onMarkRead }: NewsCardProps) {
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

  return (
    <div className={`group relative rounded-lg transition-all duration-200 cursor-pointer ${
      item.isRead ? 'card-read' : 'card-unread hover:shadow-md'
    }`}>
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
            {!item.isRead && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
