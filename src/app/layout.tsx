import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

/**
 * 字体用本地文件，不走 next/font/google。
 *
 * 曾存在的故障：`next/font/google` 在**构建时联网**去 fonts.googleapis.com /
 * fonts.gstatic.com 拉字体。GitHub runner 只要那一刻出网抖一下（上游抖动、
 * 出口被限流），整个 `npm run build` 就崩在
 * `An error occurred in next/font. TypeError: Cannot read properties of null`，
 * 表现为 CI 随机变红 —— 久而久之所有人都会习惯性重跑，门禁就形同虚设了
 * （正是 docs/ops/branch-protection.md 里记的那类「静默失效」）。
 *
 * 代价是仓库多 ~166KB 二进制，且不再有 unicode-range 子集裁剪。但这两个字体
 * 只用于标题与 UI 拉丁字符，中文本来就 fallback 到系统字体，实际影响可忽略。
 * 换来的是：构建结果不再依赖任何外部网络。
 *
 * 两个文件均为可变字体（variable font）：
 * - Newsreader 覆盖 wght 200–800
 * - Roboto 覆盖 wght 100–900，一次满足原先 300/400/500/700 四个字重
 */
const newsreader = localFont({
  src: './fonts/Newsreader-latin.woff2',
  variable: '--font-newsreader',
  weight: '200 800',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
})
const roboto = localFont({
  src: './fonts/Roboto-latin.woff2',
  variable: '--font-roboto',
  weight: '100 900',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
})
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://news.myaicode.qzz.io'),
  title: {
    default: 'News Monitor - 每日热点新闻与领域知识发现',
    template: '%s | News Monitor',
  },
  description:
    '聚合 GitHub Trending、Product Hunt、X/Twitter 每日热点，AI 自动摘要与主题聚合，快速发现值得关注的领域知识、开源项目与产品动态。',
  keywords: [
    '热点新闻',
    '每日热点',
    'GitHub Trending',
    'Product Hunt',
    '开发者资讯',
    'AI 新闻聚合',
    '领域知识发现',
    '开源项目',
    'News Monitor',
  ],
  // 移动端加到主屏幕后按独立应用渲染
  appleWebApp: {
    capable: true,
    title: 'News Monitor',
    statusBarStyle: 'default',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: 'News Monitor - 每日热点新闻与领域知识发现',
    description: '聚合 GitHub Trending、Product Hunt、X/Twitter 每日热点，AI 自动摘要并聚合主题。',
    type: 'website',
    siteName: 'News Monitor',
    locale: 'zh_CN',
  },
  twitter: {
    card: 'summary',
    title: 'News Monitor - 每日热点新闻与领域知识发现',
    description: '聚合 GitHub Trending、Product Hunt、X/Twitter 每日热点，AI 自动摘要并聚合主题。',
  },
}
/**
 * 移动端 viewport
 *
 * viewportFit: 'cover' 是 env(safe-area-inset-*) 生效的前提：不开启时，
 * iOS 刘海/灵动岛与底部 home indicator 机型不会给出安全区内边距，
 * sticky 顶栏会压到状态栏、页脚内容会藏进 home indicator 里。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 保持最大缩放 5x（无障碍要求），同时禁止横屏时的自动重排跳动
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#FAFAF9',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${newsreader.variable} ${roboto.variable}`}>
      <body className="min-h-dvh bg-stone-50 font-sans text-stone-900 antialiased">{children}</body>
    </html>
  )
}
