import type { MetadataRoute } from 'next'
import { getAllTopics } from '@/lib/db'

/**
 * 动态站点地图
 * - 首页 + 全部主题详情页
 * - ⚠️ Google 要求 sitemap 中的 URL 必须是「绝对 URL」（带协议和域名），
 *   相对路径会导致 Search Console 报「无法读取此站点地图」。
 */
export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://news.myaicode.qzz.io'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const topics = await getAllTopics()
  // 主题页 lastModified 用真实创建时间，让 Google 区分新旧内容、优先抓新主题
  const topicEntries: MetadataRoute.Sitemap = topics.map((t) => ({
    url: `${SITE_URL}/topic/${encodeURIComponent(t.id)}`,
    lastModified: t.createdAt,
    changeFrequency: 'hourly',
    priority: 0.7,
  }))
  return [
    {
      // 首页反映最新抓取时间：用最新主题的创建时间（数据一直在更新）
      url: `${SITE_URL}/`,
      lastModified: topics[0]?.createdAt ?? new Date(),
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    {
      // 历史归档页：已读内容长期保留，供搜索引擎索引
      url: `${SITE_URL}/archive`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.5,
    },
    ...topicEntries,
  ]
}
