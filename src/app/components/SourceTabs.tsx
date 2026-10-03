'use client'
import { useEffect, useRef } from 'react'

interface SourceTabsProps {
  sources: { id: string; label: string; icon: string; count: number; unread: number }[]
  activeSource: string
  onSourceChange: (source: string) => void
}

export default function SourceTabs({ sources, activeSource, onSourceChange }: SourceTabsProps) {
  const activeRef = useRef<HTMLButtonElement>(null)

  /**
   * 选中项自动滚入可视区。
   *
   * 窄屏下标签条是横向滚动的，用户点中右侧的「Product Hunt」后，
   * 该标签往往正好被顶到屏幕外 —— 页面看似"没反应"。
   */
  useEffect(() => {
    const el = activeRef.current
    // jsdom 未实现 scrollIntoView，测试环境下直接跳过
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [activeSource, sources])

  const tabClass = (active: boolean) =>
    `inline-flex shrink-0 snap-start items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-2 ${
      active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 active:bg-stone-200'
    }`

  return (
    <div className="relative">
      {/* 两侧渐隐：提示"还能往左右滑"，同时让首尾标签不贴死屏幕边 */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-stone-50 to-transparent sm:hidden"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-stone-50 to-transparent sm:hidden"
        aria-hidden
      />
      {/* scrollbar-hide 在 globals.css 中定义；此前只写了类名没定义样式，
          iOS 上会留下一条 6px 灰滚动条，白占移动端本就紧张的竖向空间 */}
      <div
        className="scrollbar-hide flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1"
        aria-label="按来源筛选"
      >
        <button
          ref={activeSource === 'all' ? activeRef : undefined}
          type="button"
          onClick={() => onSourceChange('all')}
          className={tabClass(activeSource === 'all')}
          aria-pressed={activeSource === 'all'}
        >
          全部
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums ${
              activeSource === 'all' ? 'bg-white/20' : 'bg-stone-200'
            }`}
          >
            {sources.reduce((sum, s) => sum + s.unread, 0)}
          </span>
        </button>
        {sources.map((source) => (
          <button
            key={source.id}
            ref={activeSource === source.id ? activeRef : undefined}
            type="button"
            onClick={() => onSourceChange(source.id)}
            className={tabClass(activeSource === source.id)}
            aria-pressed={activeSource === source.id}
          >
            <span aria-hidden>{source.icon}</span>
            {source.label}
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums ${
                activeSource === source.id ? 'bg-white/20' : 'bg-stone-200'
              }`}
            >
              {source.unread}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
