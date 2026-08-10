import type { MetadataRoute } from 'next'
import { getAllTopics } from '@/lib/db'

/**
 * 动态站点地图
 * - 首页 + 全部主题详情页，让搜索引擎发现可索引 URL
 * - metadataBase 已在 layout 配置，这里返回路径即可
 */
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const topics = await getAllTopics()
  const topicEntries: MetadataRoute.Sitemap = topics.map((t) => ({
    url: `/topic/${encodeURIComponent(t.id)}`,
    lastModified: new Date(),
    changeFrequency: 'hourly',
    priority: 0.7,
  }))
  return [
    {
      url: '/',
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    ...topicEntries,
  ]
}
