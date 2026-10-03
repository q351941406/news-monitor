import type { Metadata, Viewport } from 'next'
import { Newsreader, Roboto } from 'next/font/google'
import './globals.css'
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
})
const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
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
