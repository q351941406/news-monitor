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
      <div className="p-4">
        {/* 标签和指标 */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${source.color}`}
          >
            {source.label}
          </span>
          {getMetrics() && <span className="text-xs text-stone-500">{getMetrics()}</span>}
          <span className="text-xs text-stone-400 ml-auto">
            {new Date(item.fetchedAt).toLocaleString('zh-CN')}
          </span>
        </div>

        {/* 标题 */}
        <h3 className="font-serif text-lg font-semibold leading-tight text-stone-900 mb-2">
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

        {/* 原文内容 */}
        {description && (
          <div className="mb-3 overflow-y-auto max-h-[300px] prose prose-sm prose-stone max-w-none">
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
        <div className="flex items-center gap-2 pt-3 border-t border-stone-100">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>原文</span>
          </a>
          {canOperate &&
            (!item.isRead ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkRead(item.id)
                }}
                className="flex items-center gap-1 text-sm text-stone-500 hover:text-green-600 transition-colors ml-auto"
              >
                <Check className="w-4 h-4" />
                <span>已读</span>
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkUnread(item.id)
                }}
                className="flex items-center gap-1 text-sm text-stone-500 hover:text-amber-600 transition-colors ml-auto"
              >
                <ExternalLink className="w-4 h-4" />
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
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowImage(false)}
              className="absolute -top-10 right-0 text-white hover:text-stone-300"
            >
              <X className="w-8 h-8" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt=""
              className="max-w-[90vw] max-h-[90vh] object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  )
}
