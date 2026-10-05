'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import MarkdownContent from './MarkdownContent'

/** 列表轻量条目（不含原文/AI 详情） */
interface NewsItem {
  id: string
  source: string
  title: string | null
  url: string
  summary: string | null
  fetchedAt: number
  isRead: boolean
}

/** 单条完整详情（点击展开时才拉取） */
interface ItemDetail {
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
  id: string
  topic: string
  icon: string
  /** items 为 undefined 表示尚未加载（懒加载：展开时才拉取） */
  items?: NewsItem[]
  loading: boolean
  /** 来自组元信息，折叠时无需 items 即可展示 */
  unreadCount: number
  totalCount: number
  groupSummary?: string
  isExpanded: boolean
  onToggle: () => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onMarkGroupRead: (topicId: string) => void
  canOperate?: boolean
}

/**
 * 视觉尺寸不变、但把可点区域撑到 44px 的通用类。
 *
 * 移动端「已读 / 未读」这类小胶囊按钮实际只有 ~22px 高，低于触控下限，
 * 列表密集时极易误触相邻条目。这里用透明伪元素把热区外扩，
 * 既保住原有紧凑排版，又让手指有足够落点。
 */
const TAP_ZONE = "relative before:absolute before:-inset-2 before:content-['']"

export default function TopicGroup({
  id,
  topic,
  icon,
  items,
  loading,
  unreadCount,
  totalCount,
  groupSummary,
  isExpanded,
  onToggle,
  onMarkRead,
  onMarkUnread,
  onMarkGroupRead,
  canOperate = true,
}: TopicGroupProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  // L3 懒加载：单条 item 详情缓存（展开才拉，折叠后保留缓存）
  const [detailCache, setDetailCache] = useState<Record<string, ItemDetail>>({})
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({})

  const loadDetail = async (itemId: string) => {
    if (detailCache[itemId] || detailLoading[itemId]) return
    setDetailLoading((prev) => ({ ...prev, [itemId]: true }))
    try {
      const res = await fetch(`/api/items/${itemId}`)
      if (!res.ok) return
      const data = await res.json()
      setDetailCache((prev) => ({ ...prev, [itemId]: data.data as ItemDetail }))
    } catch (e) {
      console.error('Failed to load item detail:', e)
    } finally {
      setDetailLoading((prev) => ({ ...prev, [itemId]: false }))
    }
  }

  const handleItemClick = (itemId: string) => {
    if (expandedItemId === itemId) {
      setExpandedItemId(null)
      return
    }
    setExpandedItemId(itemId)
    // 点击展开的那一刻才拉详情（L3 懒加载）
    void loadDetail(itemId)
  }

  return (
    // data-topic-id：HomeView 在整组被移出列表时靠它把焦点接回同类元素，
    // 避免被点的按钮随 DOM 卸载后焦点掉回 <body>
    <section
      data-topic-id={id}
      className="overflow-hidden rounded-xl border border-stone-200 bg-white transition-shadow hover:shadow-sm"
    >
      {/* Group Header — 整行可点，同时支持键盘操作 */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${topic}，${unreadCount} 条未读，共 ${totalCount} 条`}
        className="flex cursor-pointer select-none items-center gap-3 p-3.5 focus-visible:outline-red-500 sm:gap-4 sm:p-5"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-50 text-2xl">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">
            <Link
              href={`/topic/${encodeURIComponent(id)}`}
              onClick={(e) => e.stopPropagation()}
              className="break-words transition-colors hover:text-blue-700"
              aria-label={`查看主题「${topic}」的完整内容`}
            >
              {topic}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {unreadCount > 0 ? (
              <span className="font-medium tabular-nums text-red-600">{unreadCount} 条未读</span>
            ) : (
              <span>全部已读</span>
            )}
            <span className="mx-1.5">·</span>
            <span className="tabular-nums">共 {totalCount} 条</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {canOperate && unreadCount > 0 && isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkGroupRead(id)
              }}
              className="min-h-9 shrink-0 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 active:bg-red-200"
            >
              全部已读
            </button>
          )}
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
              isExpanded ? 'bg-stone-100' : 'bg-stone-50'
            }`}
            aria-hidden
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-stone-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-stone-400" />
            )}
          </div>
        </div>
      </div>

      {/* Group Summary */}
      {groupSummary && isExpanded && (
        <div className="px-3.5 pb-4 sm:px-5">
          <p className="rounded-lg border border-stone-100 bg-stone-50 p-3 text-sm leading-relaxed text-stone-600">
            {groupSummary}
          </p>
        </div>
      )}

      {/* Items List — 懒加载：展开时若未加载则显示骨架屏 */}
      {isExpanded && (
        <div className="border-t border-stone-100">
          <div className="space-y-2 p-3 sm:p-4">
            {loading ? (
              <SkeletonRows />
            ) : items && items.length > 0 ? (
              items.map((item) => {
                const isItemExpanded = expandedItemId === item.id
                const detail = detailCache[item.id]
                const isLoadingDetail = detailLoading[item.id]
                const rawData = detail?.rawData || {}
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
                      role="button"
                      tabIndex={0}
                      aria-expanded={isItemExpanded}
                      className="flex cursor-pointer items-start gap-2 p-3 focus-visible:outline-red-500"
                      onClick={() => handleItemClick(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleItemClick(item.id)
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm leading-relaxed ${
                            item.isRead ? 'text-stone-400' : 'text-stone-700'
                          }`}
                        >
                          {item.summary || item.title}
                        </p>
                      </div>
                      {canOperate &&
                        (!item.isRead ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onMarkRead(item.id)
                            }}
                            className={`${TAP_ZONE} shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 active:bg-red-200`}
                            aria-label="标记为已读"
                          >
                            已读
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onMarkUnread(item.id)
                            }}
                            className={`${TAP_ZONE} shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-200`}
                            aria-label="标记为未读"
                          >
                            未读
                          </button>
                        ))}
                      <div
                        className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center"
                        aria-hidden
                      >
                        {isItemExpanded ? (
                          <ChevronDown className="h-4 w-4 text-stone-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-stone-300" />
                        )}
                      </div>
                    </div>
                    {/* Expanded Content */}
                    {isItemExpanded && (
                      <div className="border-t border-stone-100 px-3 pb-3 pt-3">
                        {isLoadingDetail ? (
                          <ItemDetailSkeleton />
                        ) : (
                          <>
                            {/* AI Summary */}
                            {(item.summary || detail?.details) && (
                              <div className="relative mb-3 pl-3 border-l-2 border-amber-400 sm:pl-4">
                                <div className="rounded-r-lg bg-gradient-to-r from-amber-50 to-transparent p-3">
                                  <div className="mb-2 flex items-center gap-2">
                                    <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                      AI
                                    </span>
                                  </div>
                                  {item.summary && (
                                    <div className="mb-1.5 text-sm font-medium leading-relaxed text-stone-900">
                                      <MarkdownContent content={item.summary} />
                                    </div>
                                  )}
                                  {detail?.details && (
                                    <div className="text-sm leading-relaxed text-stone-600">
                                      <MarkdownContent content={detail.details} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {/* Original Text
                                移动端不加内部滚动区：嵌套滚动会和页面竖向滑动抢手势，
                                容易出现"想滑页面却把正文框滚走了"。桌面端保留以约束高度。 */}
                            {description && (
                              <div className="prose prose-sm prose-stone mb-3 max-w-none sm:max-h-[200px] sm:overflow-y-auto">
                                <MarkdownContent content={cleanText(description)} />
                              </div>
                            )}
                            {/* Image */}
                            {previewImage && (
                              <div className="mb-3 overflow-hidden rounded-lg bg-stone-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={previewImage}
                                  alt=""
                                  className="h-auto max-h-[300px] w-full object-contain"
                                  loading="lazy"
                                  onError={(e) => {
                                    ;(e.target as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                              </div>
                            )}
                            {/* Actions */}
                            <div className="flex items-center gap-2 border-t border-stone-100 pt-2">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${TAP_ZONE} -ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-stone-500 transition-colors hover:text-stone-700`}
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                <span>原文</span>
                              </a>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="py-6 text-center text-sm text-stone-400">该主题下暂无内容</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** 单条 item 详情加载骨架 */
function ItemDetailSkeleton() {
  return (
    <div className="space-y-3 py-1" aria-label="加载中">
      <div className="h-3 w-1/3 animate-pulse rounded bg-stone-100" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-stone-100" />
      <div className="h-3 w-4/6 animate-pulse rounded bg-stone-100" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-stone-100" />
    </div>
  )
}

/** 展开加载中的骨架屏占位 */
function SkeletonRows() {
  return (
    <div className="space-y-2" aria-label="加载中">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-stone-100 p-3">
          <div className="mb-2 h-4 w-3/4 rounded bg-stone-100" />
          <div className="h-3 w-1/2 rounded bg-stone-100" />
        </div>
      ))}
    </div>
  )
}
