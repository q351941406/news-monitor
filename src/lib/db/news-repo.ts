/**
 * 新闻仓库 — 原始数据 CRUD
 */
import { eq, and, desc } from 'drizzle-orm'
import { rawItems, aiAnalysis, type NewRawItem } from '../schema'
import { getDb, type NewsItem } from './connection'

/** 存储原始数据（存在则跳过） */
export async function storeRawItems(items: NewRawItem[]): Promise<number> {
  const db = getDb()
  let newCount = 0
  for (const item of items) {
    const result = await db.insert(rawItems).values(item).onConflictDoNothing()
    if (result.rowCount && result.rowCount > 0) {
      newCount++
    }
  }
  return newCount
}

/** 检查是否已存在 */
export async function existsItem(itemId: string): Promise<boolean> {
  const db = getDb()
  const result = await db
    .select({ id: rawItems.id })
    .from(rawItems)
    .where(eq(rawItems.id, itemId))
    .limit(1)
  return result.length > 0
}

/** 获取新闻列表（默认只显示未读） */
export async function getNews(
  source: string,
  limit: number = 50,
  showAll: boolean = false,
): Promise<NewsItem[]> {
  const db = getDb()
  const whereCondition = showAll
    ? eq(rawItems.source, source)
    : and(eq(rawItems.source, source), eq(rawItems.isRead, false))
  const results = await db
    .select({
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

/** 获取所有数据源的新闻 */
export async function getAllNews(
  limit: number = 50,
  showAll: boolean = false,
): Promise<Record<string, NewsItem[]>> {
  const sources = ['github', 'producthunt', 'twitter']
  const results: Record<string, NewsItem[]> = {}
  await Promise.all(
    sources.map(async (source) => {
      results[source] = await getNews(source, limit, showAll)
    }),
  )
  return results
}
