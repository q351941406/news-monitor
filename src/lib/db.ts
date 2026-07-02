import { neon } from '@neondatabase/serverless'

function getSql() {
  return neon(process.env.DATABASE_URL!)
}

// 原始数据接口
export interface RawItem {
  id: string
  source: string
  title?: string
  url: string
  rawData: Record<string, unknown>
  fetchedAt: number
}

// AI 分析结果接口
export interface AIAnalysis {
  itemId: string
  summary: string
  processedAt?: number
}

// 带 AI 摘要的新闻项（用于展示）
export interface NewsItem {
  id: string
  source: string
  title?: string
  url: string
  rawData: Record<string, unknown>
  summary?: string
  fetchedAt: number
}

// 初始化数据库表
export async function initDatabase() {
  const sql = getSql()

  // 原始内容表
  await sql`
    CREATE TABLE IF NOT EXISTS raw_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      raw_data JSONB NOT NULL,
      fetched_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_raw_items_source ON raw_items(source)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_raw_items_fetched_at ON raw_items(fetched_at DESC)
  `

  // AI 分析结果表
  await sql`
    CREATE TABLE IF NOT EXISTS ai_analysis (
      item_id TEXT PRIMARY KEY REFERENCES raw_items(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

// 存储原始数据
export async function storeRawItems(items: RawItem[]): Promise<void> {
  const sql = getSql()

  for (const item of items) {
    await sql`
      INSERT INTO raw_items (id, source, title, url, raw_data, fetched_at)
      VALUES (${item.id}, ${item.source}, ${item.title || null}, ${item.url}, ${JSON.stringify(item.rawData)}, ${item.fetchedAt})
      ON CONFLICT (id) DO UPDATE SET
        raw_data = EXCLUDED.raw_data,
        fetched_at = EXCLUDED.fetched_at
    `
  }
}

// 存储 AI 分析结果
export async function storeAIAnalysis(itemId: string, summary: string): Promise<void> {
  const sql = getSql()

  await sql`
    INSERT INTO ai_analysis (item_id, summary)
    VALUES (${itemId}, ${summary})
    ON CONFLICT (item_id) DO UPDATE SET
      summary = EXCLUDED.summary,
      processed_at = NOW()
  `
}

// 获取未处理 AI 摘要的项目
export async function getUnprocessedItems(source: string, limit: number = 20): Promise<RawItem[]> {
  const sql = getSql()

  const rows = await sql`
    SELECT r.id, r.source, r.title, r.url, r.raw_data as "rawData", r.fetched_at as "fetchedAt"
    FROM raw_items r
    LEFT JOIN ai_analysis a ON r.id = a.item_id
    WHERE r.source = ${source} AND a.item_id IS NULL
    ORDER BY r.fetched_at DESC
    LIMIT ${limit}
  `

  return rows as RawItem[]
}

// 检查是否已存在
export async function existsItem(itemId: string): Promise<boolean> {
  const sql = getSql()

  const result = await sql`
    SELECT 1 FROM raw_items WHERE id = ${itemId} LIMIT 1
  `

  return result.length > 0
}

// 获取新闻列表（带 AI 摘要）
export async function getNews(source: string, limit: number = 50): Promise<NewsItem[]> {
  const sql = getSql()

  const rows = await sql`
    SELECT
      r.id,
      r.source,
      r.title,
      r.url,
      r.raw_data as "rawData",
      a.summary,
      r.fetched_at as "fetchedAt"
    FROM raw_items r
    LEFT JOIN ai_analysis a ON r.id = a.item_id
    WHERE r.source = ${source}
    ORDER BY r.fetched_at DESC
    LIMIT ${limit}
  `

  return rows as NewsItem[]
}

// 获取所有数据源的新闻
export async function getAllNews(limit: number = 50): Promise<Record<string, NewsItem[]>> {
  const sources = ['github', 'producthunt', 'twitter']
  const results: Record<string, NewsItem[]> = {}

  await Promise.all(
    sources.map(async (source) => {
      results[source] = await getNews(source, limit)
    })
  )

  return results
}

// 清理过期数据
export async function cleanupOldData(days: number = 30): Promise<void> {
  const sql = getSql()
  const cutoff = Date.now() - days * 86400 * 1000

  // 外键会自动删除 ai_analysis 中的记录
  await sql`
    DELETE FROM raw_items WHERE fetched_at < ${cutoff}
  `
}
