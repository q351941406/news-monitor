import type { Metadata } from 'next'
import { getTopicGroupMeta, getNewsCounts } from '@/lib/db'
import HomeView from './components/HomeView'

/**
 * 首页（Server Component）
 *
 * SEO 改造：数据在服务端直接预取并渲染进 HTML，搜索引擎爬虫（Googlebot 等）
 * 无需执行 JS 即可看到全部主题与计数；交互仍由 HomeView（client）水合接管。
 *
 * - showAll=true：首屏展示全部主题（含已读），保证内容完整可索引
 * - force-dynamic：数据每小时更新，实时渲染，避免过期缓存
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'News Monitor - 每日热点新闻与领域知识发现',
  description:
    '聚合 GitHub Trending、Product Hunt、X/Twitter 每日热点，AI 自动摘要并聚合主题，助你快速发现值得关注的领域知识、开源项目与产品动态。',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'News Monitor - 每日热点新闻与领域知识发现',
    description: '聚合 GitHub Trending、Product Hunt、X/Twitter 每日热点，AI 自动摘要并聚合主题。',
    type: 'website',
    url: '/',
    siteName: 'News Monitor',
    locale: 'zh_CN',
  },
}

export default async function Home() {
  const [github, producthunt, twitter, counts] = await Promise.all([
    getTopicGroupMeta('github', true),
    getTopicGroupMeta('producthunt', true),
    getTopicGroupMeta('twitter', true),
    getNewsCounts(),
  ])
  const topics = { github, producthunt, twitter }
  return <HomeView initialTopics={topics} initialCounts={counts} initialShowRead={true} />
}
