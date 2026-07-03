import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, and, isNull, desc, lt, ne } from 'drizzle-orm'
import { rawItems, aiAnalysis, type RawItem, type NewRawItem } from './schema'

// Re-export types
export type { RawItem, NewRawItem }
export type { AIAnalysis, NewAIAnalysis } from './schema'

// 数据库连接
function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql)
}

// 新闻展示类型
export interface NewsItem {
  id: string
  source: string
  title: string | null
  url: string
  rawData: Record<string, unknown>
  summary: string | null
  details: string | null
  fetchedAt: number
  isRead: boolean
}

// 初始化数据库表（Drizzle 不自动建表，需要手动或用 push）
export async function initDatabase() {
  // 使用 drizzle-kit push 或手动 SQL
  const sql = neon(process.env.DATABASE_URL!)

  await sql`
    CREATE TABLE IF NOT EXISTS raw_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      raw_data JSONB NOT NULL,
      is_read BOOLEAN DEFAULT FALSE NOT NULL,
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

  await sql`
    CREATE TABLE IF NOT EXISTS ai_analysis (
      item_id TEXT PRIMARY KEY REFERENCES raw_items(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

// 存储原始数据
export async function storeRawItems(items: NewRawItem[]): Promise<void> {
  const db = getDb()

  for (const item of items) {
    await db.insert(rawItems)
      .values(item)
      .onConflictDoUpdate({
        target: rawItems.id,
        set: {
          rawData: item.rawData,
          fetchedAt: item.fetchedAt,
        },
      })
  }
}

// 存储 AI 分析结果
export async function storeAIAnalysis(itemId: string, summary: string, details?: string): Promise<void> {
  const db = getDb()

  await db.insert(aiAnalysis)
    .values({ itemId, summary, details: details || null })
    .onConflictDoUpdate({
      target: aiAnalysis.itemId,
      set: {
        summary,
        details: details || null,
        processedAt: new Date(),
      },
    })
}

// 获取未处理 AI 摘要的项目
export async function getUnprocessedItems(source: string, limit: number = 20): Promise<RawItem[]> {
  const db = getDb()

  const results = await db.select()
    .from(rawItems)
    .leftJoin(aiAnalysis, eq(rawItems.id, aiAnalysis.itemId))
    .where(
      and(
        eq(rawItems.source, source),
        isNull(aiAnalysis.itemId)
      )
    )
    .orderBy(desc(rawItems.fetchedAt))
    .limit(limit)

  return results.map(r => r.raw_items)
}

// 检查是否已存在
export async function existsItem(itemId: string): Promise<boolean> {
  const db = getDb()

  const result = await db.select({ id: rawItems.id })
    .from(rawItems)
    .where(eq(rawItems.id, itemId))
    .limit(1)

  return result.length > 0
}

// 标记为已读
export async function markAsRead(itemId: string): Promise<void> {
  const db = getDb()

  await db.update(rawItems)
    .set({ isRead: true })
    .where(eq(rawItems.id, itemId))
}

// 标记为未读
export async function markAsUnread(itemId: string): Promise<void> {
  const db = getDb()

  await db.update(rawItems)
    .set({ isRead: false })
    .where(eq(rawItems.id, itemId))
}

// 批量标记已读
export async function markAllAsRead(source?: string): Promise<void> {
  const db = getDb()

  if (source) {
    await db.update(rawItems)
      .set({ isRead: true })
      .where(eq(rawItems.source, source))
  } else {
    await db.update(rawItems)
      .set({ isRead: true })
  }
}

// 重置所有已读为未读
export async function resetAllRead(source?: string): Promise<void> {
  const db = getDb()

  if (source) {
    await db.update(rawItems)
      .set({ isRead: false })
      .where(eq(rawItems.source, source))
  } else {
    await db.update(rawItems)
      .set({ isRead: false })
  }
}

// 获取未读数量
export async function getUnreadCount(source?: string): Promise<number> {
  const db = getDb()

  const condition = source
    ? and(eq(rawItems.source, source), eq(rawItems.isRead, false))
    : eq(rawItems.isRead, false)

  const result = await db.select({ count: rawItems.id })
    .from(rawItems)
    .where(condition)

  return result.length
}

// 获取新闻列表（默认只显示未读）
export async function getNews(source: string, limit: number = 50, showAll: boolean = false): Promise<NewsItem[]> {
  const db = getDb()

  const whereCondition = showAll
    ? eq(rawItems.source, source)
    : and(eq(rawItems.source, source), eq(rawItems.isRead, false))

  const results = await db.select({
    id: rawItems.id,
    source: rawItems.source,
    title: rawItems.title,
    url: rawItems.url,
    rawData: rawItems.rawData,
    summary: aiAnalysis.summary,
    details: aiAnalysis.details,
    fetchedAt: rawItems.fetchedAt,
    isRead: rawItems.isRead,
  })
    .from(rawItems)
    .leftJoin(aiAnalysis, eq(rawItems.id, aiAnalysis.itemId))
    .where(whereCondition)
    .orderBy(desc(rawItems.fetchedAt))
    .limit(limit)

  return results as NewsItem[]
}

// 获取所有数据源的新闻
export async function getAllNews(limit: number = 50, showAll: boolean = false): Promise<Record<string, NewsItem[]>> {
  const sources = ['github', 'producthunt', 'twitter']
  const results: Record<string, NewsItem[]> = {}

  await Promise.all(
    sources.map(async (source) => {
      results[source] = await getNews(source, limit, showAll)
    })
  )

  return results
}

// 清理过期数据
export async function cleanupOldData(days: number = 30): Promise<void> {
  const db = getDb()
  const cutoff = Date.now() - days * 86400 * 1000

  await db.delete(rawItems)
    .where(lt(rawItems.fetchedAt, cutoff))
}
