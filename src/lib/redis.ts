import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
})

// 去重：检查是否已处理
export async function isProcessed(source: string, itemId: string): Promise<boolean> {
  const key = `dedup:${source}:${itemId}`
  const exists = await redis.exists(key)
  return exists === 1
}

// 去重：标记已处理 (保留 7 天)
export async function markProcessed(source: string, itemId: string): Promise<void> {
  const key = `dedup:${source}:${itemId}`
  await redis.set(key, '1', { ex: 7 * 86400 })
}

// 存储新闻数据
export async function storeNews(source: string, items: NewsItem[]): Promise<void> {
  const key = `news:${source}`
  await redis.set(key, JSON.stringify(items), { ex: 7 * 86400 })
}

// 读取新闻数据
export async function getNews(source: string): Promise<NewsItem[]> {
  const key = `news:${source}`
  const data = await redis.get<string>(key)
  if (!data) return []
  return typeof data === 'string' ? JSON.parse(data) : data
}

// 获取所有数据源的最新新闻
export async function getAllNews(): Promise<Record<string, NewsItem[]>> {
  const sources = ['github', 'producthunt', 'twitter']
  const results: Record<string, NewsItem[]> = {}

  await Promise.all(
    sources.map(async (source) => {
      results[source] = await getNews(source)
    })
  )

  return results
}

export interface NewsItem {
  id: string
  source: string
  title: string
  description: string
  url: string
  author?: string
  metrics?: Record<string, number>
  summary?: string
  fetchedAt: number
}
