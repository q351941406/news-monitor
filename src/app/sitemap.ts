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
  const topicEntries: MetadataRoute.Sitemap = topics.map((t) => ({
    url: `${SITE_URL}/topic/${encodeURIComponent(t.id)}`,
    lastModified: new Date(),
    changeFrequency: 'hourly',
    priority: 0.7,
  }))
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    ...topicEntries,
  ]
}
