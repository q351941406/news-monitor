'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import NewsCard from './NewsCard'

interface NewsItem {
  id: string
  source: string
  title: string | null
  url: string
  rawData: Record<string, unknown>
  summary: string | null
  details: string | null
  fetchedAt: number
  isRead: boolean
}

interface TopicGroupProps {
  topic: string
  icon: string
  items: NewsItem[]
  groupSummary?: string
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onMarkGroupRead: (topic: string) => void
}

export default function TopicGroup({
  topic,
  icon,
  items,
  groupSummary,
  onMarkRead,
  onMarkUnread,
  onMarkGroupRead,
}: TopicGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const unreadCount = items.filter(i => !i.isRead).length

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Group Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h2 className="font-serif text-xl font-semibold text-stone-900">{topic}</h2>
            <p className="text-sm text-stone-500">
              {unreadCount > 0 ? `${unreadCount} 条未读` : '全部已读'} · 共 {items.length} 条
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkGroupRead(topic)
              }}
              className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-full hover:bg-green-100 transition-colors"
            >
              全部已读
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-stone-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-stone-400" />
          )}
        </div>
      </div>

      {/* Group Summary */}
      {groupSummary && (
        <div className="px-4 pb-3">
          <p className="text-sm text-stone-600 leading-relaxed bg-amber-50 rounded-lg p-3 border border-amber-100">
            {groupSummary}
          </p>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-stone-100">
          <div className="p-4 space-y-3">
            {items.map(item => (
              <NewsCard key={item.id} item={item} onMarkRead={onMarkRead} onMarkUnread={onMarkUnread} />
            ))}
          </div>
        </div>
      )}

      {/* Collapsed Preview */}
      {!isExpanded && items.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {items.slice(0, 3).map(item => (
              <div
                key={item.id}
                className={`flex-shrink-0 w-48 p-2 rounded border text-xs ${
                  item.isRead
                    ? 'bg-stone-50 border-stone-200 text-stone-400'
                    : 'bg-white border-stone-300 text-stone-700'
                }`}
              >
                <p className="font-medium truncate">{item.title}</p>
              </div>
            ))}
            {items.length > 3 && (
              <div className="flex-shrink-0 w-24 p-2 rounded border border-dashed border-stone-300 text-xs text-stone-400 flex items-center justify-center">
                +{items.length - 3} 更多
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
