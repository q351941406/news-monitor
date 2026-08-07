'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Check } from 'lucide-react'
import MarkdownContent from './MarkdownContent'

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
  isExpanded: boolean
  onToggle: () => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onMarkGroupRead: (topic: string) => void
  canOperate?: boolean
}

export default function TopicGroup({
  topic,
  icon,
  items,
  groupSummary,
  isExpanded,
  onToggle,
  onMarkRead,
  onMarkUnread,
  onMarkGroupRead,
  canOperate = true,
}: TopicGroupProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const unreadCount = items.filter((i) => !i.isRead).length

  const handleItemClick = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId)
  }

  return (
    <section className="bg-white rounded-xl border border-stone-200 overflow-hidden transition-shadow hover:shadow-sm">
      {/* Group Header */}
      <div className="flex items-center gap-4 p-5 cursor-pointer select-none" onClick={onToggle}>
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-2xl bg-stone-50 rounded-lg">
          {icon}
        </div>

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

        <div className="flex items-center gap-3">
          {canOperate && unreadCount > 0 && (
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
          <div
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              isExpanded ? 'bg-stone-100' : 'bg-stone-50'
            }`}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-stone-600" />
            ) : (
              <ChevronRight className="w-4 h-4 text-stone-400" />
            )}
          </div>
        </div>
      </div>

      {/* Group Summary */}
      {groupSummary && isExpanded && (
        <div className="px-5 pb-4">
          <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 rounded-lg p-3 border border-stone-100">
            {groupSummary}
          </p>
        </div>
      )}

      {/* Items List */}
      {isExpanded && (
        <div className="border-t border-stone-100">
          <div className="p-4 space-y-2">
            {items.map((item) => {
              const isItemExpanded = expandedItemId === item.id
              const rawData = item.rawData

              const cleanText = (text: string) => {
                return text
                  .replace(/\\U([0-9a-fA-F]{8})/g, (_, hex) =>
                    String.fromCodePoint(parseInt(hex, 16)),
                  )
                  .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
                    String.fromCodePoint(parseInt(hex, 16)),
                  )
                  .replace(/\\n/g, '\n')
                  .replace(/\\\\/g, '\\')
                  .replace(/\\ /g, ' ')
              }
              const getDescription = () => {
                switch (item.source) {
                  case 'github':
                    return (rawData.readme as string) || (rawData.description as string)
                  case 'producthunt':
                    return (rawData.description as string) || (rawData.tagline as string)
                  case 'twitter':
                    return rawData.text as string
                  default:
                    return ''
                }
              }

              const previewImage = rawData.previewImage as string | null
              const description = getDescription()

              return (
                <div
                  key={item.id}
                  className={`rounded-lg border transition-all duration-200 ${
                    item.isRead
                      ? 'border-stone-200 bg-stone-50'
                      : isItemExpanded
                        ? 'border-stone-400 bg-white shadow-sm'
                        : 'border-stone-300 bg-white hover:border-stone-400'
                  }`}
                >
                  {/* Summary - Clickable */}
                  <div
                    className="p-3 cursor-pointer flex items-start gap-2"
                    onClick={() => handleItemClick(item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-relaxed ${
                          item.isRead ? 'text-stone-400' : 'text-stone-700'
                        }`}
                      >
                        {item.summary || item.title}
                      </p>
                    </div>
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {isItemExpanded ? (
                        <ChevronDown className="w-4 h-4 text-stone-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-stone-300" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isItemExpanded && (
                    <div className="px-3 pb-3 border-t border-stone-100 pt-3">
                      {/* AI Summary */}
                      {(item.summary || item.details) && (
                        <div className="relative mb-3 pl-4 border-l-2 border-amber-400">
                          <div className="bg-gradient-to-r from-amber-50 to-transparent rounded-r-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">
                                AI
                              </span>
                            </div>
                            {item.summary && (
                              <div className="text-sm font-medium text-stone-900 leading-relaxed mb-1.5">
                                <MarkdownContent content={item.summary} />
                              </div>
                            )}
                            {item.details && (
                              <div className="text-sm text-stone-600 leading-relaxed">
                                <MarkdownContent content={item.details} />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Original Text */}
                      {description && (
                        <div className="mb-3 overflow-y-auto max-h-[200px] prose prose-sm prose-stone max-w-none">
                          <MarkdownContent content={cleanText(description)} />
                        </div>
                      )}

                      {/* Image */}
                      {previewImage && (
                        <div className="mb-3 rounded-lg overflow-hidden bg-stone-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewImage}
                            alt=""
                            className="w-full h-auto max-h-[300px] object-contain"
                            loading="lazy"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>原文</span>
                        </a>
                        {canOperate &&
                          (!item.isRead ? (
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
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
