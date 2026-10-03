'use client'

import { useState } from 'react'
import { ExternalLink, Check, X } from 'lucide-react'
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

interface NewsCardProps {
  item: NewsItem
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  canOperate?: boolean
}

const sourceConfig: Record<string, { label: string; color: string }> = {
  github: { label: 'GitHub', color: 'bg-stone-800 text-white' },
  producthunt: { label: 'Product Hunt', color: 'bg-orange-500 text-white' },
  twitter: { label: 'X / Twitter', color: 'bg-blue-500 text-white' },
}

export default function NewsCard({
  item,
  onMarkRead,
  onMarkUnread,
  canOperate = true,
}: NewsCardProps) {
  const [showImage, setShowImage] = useState(false)
  const rawData = item.rawData
  const source = sourceConfig[item.source] || {
    label: item.source,
    color: 'bg-stone-500 text-white',
  }

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

  // 清理文本：解码 Unicode emoji、转义字符、URL 转链接
  const cleanText = (text: string) => {
    return text
      .replace(/\\U([0-9a-fA-F]{8})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\')
      .replace(/\\ /g, ' ')
      .replace(/(https?:\/\/[^\s;]+);?/g, '[$1]($1)') // URL 转 Markdown 链接
  }

  return (
    <div
      className={`group relative rounded-lg transition-all duration-200 cursor-pointer ${
        item.isRead ? 'card-read' : 'card-unread hover:shadow-md'
      }`}
    >
      <div className="p-3.5 sm:p-4">
        {/* 标签和指标：窄屏允许换行，避免时间戳把指标挤出屏幕 */}
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-medium ${source.color}`}
          >
            {source.label}
          </span>
          {getMetrics() && (
            <span className="shrink-0 text-xs tabular-nums text-stone-500">{getMetrics()}</span>
          )}
          <time
            dateTime={new Date(item.fetchedAt).toISOString()}
            // 时间串依赖运行环境时区，SSR 与客户端可能不一致
            suppressHydrationWarning
            className="ml-auto shrink-0 text-xs tabular-nums text-stone-400"
          >
            {new Date(item.fetchedAt).toLocaleString('zh-CN')}
          </time>
        </div>

        {/* 标题 */}
        <h3 className="mb-2 break-words font-serif text-base font-semibold leading-tight text-stone-900 sm:text-lg">
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
        {(item.summary || item.details) && (
          <div className="relative mb-3 pl-3 border-l-2 border-amber-400 sm:pl-4">
            <div className="rounded-r-lg bg-gradient-to-r from-amber-50 to-transparent p-3">
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

        {/* 原文内容 */}
        {/* 移动端不使用内部滚动区：嵌套滚动会和页面竖向滑动手势冲突 */}
        {description && (
          <div className="prose prose-sm prose-stone mb-3 max-w-none sm:max-h-[300px] sm:overflow-y-auto">
            <MarkdownContent content={cleanText(description)} />
          </div>
        )}

        {/* 图片预览（原文下方） */}
        {previewImage && (
          <div
            className="mb-3 rounded-lg overflow-hidden bg-stone-100 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              setShowImage(true)
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt=""
              className="w-full h-auto max-h-[400px] object-contain"
              loading="lazy"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )}

        {/* 底部操作 */}
        <div className="flex items-center gap-2 border-t border-stone-100 pt-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative -ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1.5 text-sm text-stone-500 transition-colors before:absolute before:-inset-2 before:content-[''] hover:text-stone-700"
          >
            <ExternalLink className="w-4 h-4" aria-hidden />
            <span>原文</span>
          </a>
          {canOperate &&
            (!item.isRead ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkRead(item.id)
                }}
                className="relative ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1.5 text-sm text-stone-500 transition-colors before:absolute before:-inset-2 before:content-[''] hover:text-green-600"
              >
                <Check className="w-4 h-4" aria-hidden />
                <span>已读</span>
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkUnread(item.id)
                }}
                className="relative ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1.5 text-sm text-stone-500 transition-colors before:absolute before:-inset-2 before:content-[''] hover:text-amber-600"
              >
                <ExternalLink className="w-4 h-4" aria-hidden />
                <span>未读</span>
              </button>
            ))}
        </div>
      </div>

      {/* 图片放大弹窗 */}
      {showImage && previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowImage(false)}
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
        >
          <div className="relative max-h-[85dvh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* 关闭按钮原来挂在面板外侧 -top-10，窄屏下会被视口裁掉，等于无法关闭 */}
            <button
              onClick={() => setShowImage(false)}
              aria-label="关闭图片预览"
              className="absolute -right-1 -top-11 flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
            >
              <X className="w-7 h-7" aria-hidden />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt=""
              className="max-h-[85dvh] max-w-[90vw] rounded object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
