'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'
import MarkdownContent from './MarkdownContent'

/** 未归组条目的轻量形态（与 GET /api/news/ungrouped 返回一致） */
export interface PendingItem {
  id: string
  source: string
  title: string | null
  url: string
  summary: string | null
  fetchedAt: number
  isRead: boolean
  /** 还缺 AI 摘要（富化流水线尚未处理到） */
  pendingSummary: boolean
}

/** 单条完整详情（点击展开时才拉，L3 懒加载） */
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

interface PendingItemsProps {
  /** 未读且没归组的条目 */
  items: PendingItem[]
  onMarkRead: (id: string) => void
  canOperate?: boolean
}

/** 触控热区外扩到 44px（与 TopicGroup 一致） */
const TAP_ZONE = 'relative before:absolute before:-inset-2 before:content-[""]'

const SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub',
  producthunt: 'Product Hunt',
  twitter: 'X / Twitter',
}

/**
 * 「待归组内容」分组。
 *
 * 为什么需要这个组件（2026-10 修复「徽标 8、列表空白」）：
 * 徽标数字统计的是 raw_items 的未读行数，主题组列表渲染的是 topic_groups。
 * 两者脱钩时（内容已抓到、但没挂上任何主题组），用户会看到一个
 * **无法解释的数字** —— 线上事故：GitHub 徽标 8，整页空白，
 * 而这 8 条在首页、归档页全都无处可寻（归档页只收已读条目）。
 *
 * 这里把它们显式渲染出来，并说明每条卡在哪个环节：
 * - 「待摘要」：内容刚抓到，AI 摘要流水线还没跑到（富化每天跑一轮）
 * - 「待归组」：摘要已就绪，但还没被归入任何主题
 *
 * 语义：只展示**未读**的未归组条目 —— 已读的按产品语义「读完即消失」。
 */
export default function PendingItems({
  items = [],
  onMarkRead,
  canOperate = true,
}: PendingItemsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<Record<string, ItemDetail>>({})
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({})

  if (items.length === 0) return null

  const pendingSummaryCount = items.filter((i) => i.pendingSummary).length

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
    void loadDetail(itemId)
  }

  return (
    <section
      data-pending-items="true"
      className="overflow-hidden rounded-xl border border-dashed border-amber-300 bg-white transition-shadow hover:shadow-sm"
    >
      {/* Header — 整行可点，键盘可达 */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`待归组内容，${items.length} 条未读`}
        className="flex cursor-pointer select-none items-center gap-3 p-3.5 focus-visible:outline-amber-500 sm:gap-4 sm:p-5"
        onClick={() => setIsExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded((v) => !v)
          }
        }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-2xl">
          📥
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">
            待归组内容
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">
            <span className="font-medium tabular-nums text-amber-700">{items.length} 条</span>
            <span className="mx-1.5">·</span>
            <span>已抓到但还没归入主题，点开即可阅读</span>
            {pendingSummaryCount > 0 && (
              <>
                <span className="mx-1.5">·</span>
                <span className="tabular-nums">{pendingSummaryCount} 条待摘要</span>
              </>
            )}
          </p>
        </div>
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

      {isExpanded && (
        <div className="border-t border-stone-100">
          <div className="space-y-2 p-3 sm:p-4">
            {items.map((item) => {
              const isItemExpanded = expandedItemId === item.id
              const detail = detailCache[item.id]
              const isLoadingDetail = detailLoading[item.id]
              const rawData = detail?.rawData || {}
              const description =
                item.source === 'github'
                  ? (rawData.readme as string) || (rawData.description as string) || ''
                  : item.source === 'producthunt'
                    ? (rawData.description as string) || (rawData.tagline as string) || ''
                    : item.source === 'twitter'
                      ? (rawData.text as string) || ''
                      : ''
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border transition-all duration-200 ${
                    isItemExpanded
                      ? 'border-stone-400 bg-white shadow-sm'
                      : 'border-stone-300 bg-white hover:border-stone-400'
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isItemExpanded}
                    className="flex cursor-pointer items-start gap-2 p-3 focus-visible:outline-amber-500"
                    onClick={() => handleItemClick(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleItemClick(item.id)
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-relaxed text-stone-900">
                        {item.summary || item.title || item.url}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600">
                          {SOURCE_LABEL[item.source] || item.source}
                        </span>
                        {item.pendingSummary ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                            待摘要
                          </span>
                        ) : (
                          <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">
                            待归组
                          </span>
                        )}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-stone-500 hover:text-blue-700"
                        >
                          原文
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </p>
                    </div>
                    {canOperate && (
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
                    )}
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

                  {isItemExpanded && (
                    <div className="border-t border-stone-100 px-3 pb-3 pt-3">
                      {isLoadingDetail ? (
                        <div className="flex items-center gap-2 py-3 text-sm text-stone-400">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          加载详情…
                        </div>
                      ) : (
                        <>
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
                          {!item.summary && !detail?.details && (
                            <p className="py-2 text-sm text-stone-500">
                              这条内容还没生成 AI 摘要 —— 富化流水线每天跑一轮，稍后会自动补上。
                            </p>
                          )}
                          {description && (
                            <div className="prose prose-sm prose-stone mb-3 max-w-none sm:max-h-[200px] sm:overflow-y-auto">
                              <MarkdownContent content={description} />
                            </div>
                          )}
                        </>
                      )}
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
