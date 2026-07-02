import { neon } from '@neondatabase/serverless'

function getSql() {
  return neon(process.env.DATABASE_URL!)
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

// 初始化数据库表
export async function initDatabase() {
  await getSql()`
    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      author TEXT,
      metrics JSONB,
      summary TEXT,
      fetched_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await getSql()`
    CREATE INDEX IF NOT EXISTS idx_news_source ON news_items(source)
  `

  await getSql()`
    CREATE INDEX IF NOT EXISTS idx_news_fetched_at ON news_items(fetched_at DESC)
  `
}

// 去重：检查是否已处理
export async function isProcessed(source: string, itemId: string): Promise<boolean> {
  const result = await getSql()`
    SELECT 1 FROM news_items WHERE id = ${itemId} LIMIT 1
  `
  return result.length > 0
}

// 存储新闻数据
export async function storeNews(items: NewsItem[]): Promise<void> {
  for (const item of items) {
    await getSql()`
      INSERT INTO news_items (id, source, title, description, url, author, metrics, summary, fetched_at)
      VALUES (${item.id}, ${item.source}, ${item.title}, ${item.description}, ${item.url}, ${item.author || null}, ${JSON.stringify(item.metrics || {})}, ${item.summary || null}, ${item.fetchedAt})
      ON CONFLICT (id) DO NOTHING
    `
  }
}

// 获取指定数据源的最新新闻
export async function getNews(source: string, limit: number = 50): Promise<NewsItem[]> {
  const rows = await getSql()`
    SELECT id, source, title, description, url, author, metrics, summary, fetched_at as "fetchedAt"
    FROM news_items
    WHERE source = ${source}
    ORDER BY fetched_at DESC
    LIMIT ${limit}
  `
  return rows as NewsItem[]
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

// 清理过期数据（保留指定天数）
export async function cleanupOldNews(days: number = 30): Promise<void> {
  const cutoff = Date.now() - days * 86400 * 1000
  await getSql()`
    DELETE FROM news_items WHERE fetched_at < ${cutoff}
  `
}
