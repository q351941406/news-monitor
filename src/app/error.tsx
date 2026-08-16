'use client'
import { useEffect } from 'react'
/**
 * 首页渲染错误边界
 *
 * 背景：首页是 force-dynamic 的服务端组件，DB 瞬时抖动时 RSC 流会中断，
 * 浏览器端会抛出裸的 "Error: Connection closed."。此边界捕获渲染错误，
 * 展示可恢复的友好提示，避免用户看到无意义的报错。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[home] 渲染失败:', error)
  }, [error])
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">😕</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">内容加载失败</h2>
        <p className="text-stone-500 text-sm mb-6">可能是暂时的网络或服务波动，稍后重试即可。</p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-700 transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>
  )
}
