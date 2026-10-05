'use client'
import { useEffect, useRef } from 'react'

interface SourceTabsProps {
  sources: { id: string; label: string; icon: string; count: number; unread: number }[]
  activeSource: string
  onSourceChange: (source: string) => void
}

export default function SourceTabs({ sources, activeSource, onSourceChange }: SourceTabsProps) {
  const activeRef = useRef<HTMLButtonElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  /**
   * 选中项自动滚入可视区 —— **只允许横向**。
   *
   * 窄屏下标签条是横向滚动的，用户点中右侧的「Product Hunt」后，
   * 该标签往往正好被顶到屏幕外 —— 页面看似"没反应"。
   *
   * 这里必须自己算 scrollLeft、只滚标签条自身，**不能**改用
   * `el.scrollIntoView({ inline: 'center', block: 'nearest' })`：
   * 那个 API 会滚动**所有**可滚动祖先，包括 <html>。而本 effect 曾把
   * `sources` 列为依赖（父组件每次渲染都新建该数组），于是展开任意主题组、
   * 标记已读、懒加载详情等任何一次重渲染都会触发它 —— 用户在页面下方点开
   * 一组时，整个页面被「平滑滚回顶部」，被点的那行从屏幕 y=200 掉出视口，
   * 看起来就像"点击后当前行跑了"。
   *
   * 依赖只留 activeSource：本 effect 的语义就是「选中项变化时对齐」，
   * 与 sources 的内容/引用无关。
   */
  useEffect(() => {
    const el = activeRef.current
    const strip = stripRef.current
    // jsdom 既无布局也无 scrollTo，测试环境下直接跳过
    if (!el || !strip || typeof strip.scrollTo !== 'function') return
    // 用 rect 差值而非 offsetLeft：不依赖 offsetParent 是谁，嵌套定位上下文也不会算错
    const elRect = el.getBoundingClientRect()
    const delta =
      elRect.left - strip.getBoundingClientRect().left - (strip.clientWidth - elRect.width) / 2
    const max = Math.max(0, strip.scrollWidth - strip.clientWidth)
    const left = Math.min(max, Math.max(0, strip.scrollLeft + delta))
    // 已经居中就别动：避免每次切换都放一段无谓的平滑动画
    if (Math.abs(strip.scrollLeft - left) > 1) {
      strip.scrollTo({ left, behavior: 'smooth' })
    }
  }, [activeSource])

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
        ref={stripRef}
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
