import type { MetadataRoute } from 'next'

/**
 * Web App Manifest —— 移动端「添加到主屏幕」的基础
 *
 * 没有它时 iOS Safari 只能用「网页快捷方式」添加（无 standalone 全屏、
 * 无主题色状态栏），体验与原生 App 差距明显。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'News Monitor - 每日热点新闻与领域知识发现',
    short_name: 'News Monitor',
    description: '聚合 GitHub Trending、Product Hunt、X/Twitter 每日热点，AI 自动摘要与主题聚合。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAFAF9',
    theme_color: '#FAFAF9',
    lang: 'zh-CN',
    categories: ['news', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
