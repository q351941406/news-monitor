'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
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
    <section className="bg-white rounded-xl border border-stone-200 overflow-hidden transition-shadow hover:shadow-sm">
      {/* Group Header - Editorial Style */}
      <div
        className="flex items-center gap-4 p-5 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-2xl bg-stone-50 rounded-lg">
          {icon}
        </div>

        {/* Title & Meta */}
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-xl font-semibold text-stone-900 tracking-tight">
            {topic}
          </h2>
          <p className="text-sm text-stone-500 mt-0.5">
            {unreadCount > 0 ? (
              <span className="text-red-600 font-medium">{unreadCount} 条未读</span>
            ) : (
              <span>全部已读</span>
            )}
            <span className="mx-1.5">·</span>
            <span>共 {items.length} 条</span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkGroupRead(topic)
              }}
              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-full hover:bg-red-100 transition-colors"
            >
              全部已读
            </button>
          )}
          <div className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            isExpanded ? 'bg-stone-100' : 'bg-stone-50'
          }`}>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-stone-600" />
            ) : (
              <ChevronRight className="w-4 h-4 text-stone-400" />
            )}
          </div>
        </div>
      </div>

      {/* Group Summary */}
      {groupSummary && (
        <div className="px-5 pb-4">
          <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 rounded-lg p-3 border border-stone-100">
            {groupSummary}
          </p>
        </div>
      )}

      {/* Expanded Content */}
      <div className={`transition-all duration-300 ease-in-out ${
        isExpanded ? 'max-h-[10000px] opacity-100' : 'max-h-0 opacity-0'
      } overflow-hidden`}>
        <div className="border-t border-stone-100">
          <div className="p-4 space-y-3">
            {items.map(item => (
              <NewsCard key={item.id} item={item} onMarkRead={onMarkRead} onMarkUnread={onMarkUnread} />
            ))}
          </div>
        </div>
      </div>

      {/* Collapsed Preview */}
      {!isExpanded && items.length > 0 && (
        <div className="px-5 pb-4">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {items.slice(0, 4).map(item => (
              <div
                key={item.id}
                className={`flex-shrink-0 w-40 p-2.5 rounded-lg border text-xs transition-colors ${
                  item.isRead
                    ? 'bg-stone-50 border-stone-200 text-stone-400'
                    : 'bg-white border-stone-300 text-stone-700 hover:border-stone-400'
                }`}
              >
                <p className="font-medium truncate leading-snug">{item.title}</p>
                {!item.isRead && (
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5" />
                )}
              </div>
            ))}
            {items.length > 4 && (
              <div className="flex-shrink-0 w-20 p-2.5 rounded-lg border border-dashed border-stone-300 text-xs text-stone-400 flex items-center justify-center">
                +{items.length - 4}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
