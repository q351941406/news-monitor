/**
 * 新闻仓库 — 原始数据 CRUD
 */
import { eq, and, desc, sql, ilike } from 'drizzle-orm'
import { rawItems, aiAnalysis, type NewRawItem } from '../schema'
import { getDb, type NewsItem } from './connection'
/** 存储原始数据（存在则跳过） */
export async function storeRawItems(items: NewRawItem[]): Promise<number> {
  const db = getDb()
  if (items.length === 0) return 0
  // 批量插入 + ON CONFLICT DO NOTHING：一次 round-trip 完成全部写入
  // PG 下 rowCount = 实际新插入的行数（冲突行不计入）
  const result = await db.insert(rawItems).values(items).onConflictDoNothing()
  return result.rowCount ?? 0
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
/** 获取每个数据源的真实总数和未读数（不受 limit 影响） */
export async function getNewsCounts(): Promise<Record<string, { total: number; unread: number }>> {
  const db = getDb()
  // 一次 GROUP BY 查询拿到全部来源的 total/unread，替代 3×2 次串行查询
  const rows = await db
    .select({
      source: rawItems.source,
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) FILTER (WHERE ${rawItems.isRead} = false)::int`,
    })
    .from(rawItems)
    .groupBy(rawItems.source)
  const result: Record<string, { total: number; unread: number }> = {
    github: { total: 0, unread: 0 },
    producthunt: { total: 0, unread: 0 },
    twitter: { total: 0, unread: 0 },
  }
  for (const row of rows) {
    if (row.source in result) {
      result[row.source] = { total: row.total, unread: row.unread }
    }
  }
  return result
}

/** 归档页查询：已读条目列表（支持来源/关键词/时间/分页） */
export interface ArchiveQuery {
  days?: number | null
  source?: string
  page?: number
  pageSize?: number
  q?: string
}
export async function getArchivedNews(
  opts: ArchiveQuery,
): Promise<{ items: NewsItem[]; total: number }> {
  const db = getDb()
  const { source, page = 1, pageSize = 20, q, days } = opts
  const conditions = [eq(rawItems.isRead, true)]
  if (source && source !== 'all') {
    conditions.push(eq(rawItems.source, source))
  }
  if (q?.trim()) {
    conditions.push(ilike(rawItems.title, `%${q.trim()}%`))
  }
  if (days && days > 0) {
    const cutoff = Date.now() - days * 86400000
    conditions.push(sql`${rawItems.fetchedAt} >= ${cutoff}`)
  }
  const where = and(...conditions)
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rawItems)
    .where(where)
  const total = countRow?.count ?? 0
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
    .where(where)
    .orderBy(desc(rawItems.fetchedAt))
    .offset((page - 1) * pageSize)
    .limit(pageSize)
  return { items: results as NewsItem[], total }
}
/** 彻底删除一条原始条目（级联删除 ai_analysis / topic_items 关联） */
export async function deleteItem(itemId: string): Promise<void> {
  const db = getDb()
  await db.delete(rawItems).where(eq(rawItems.id, itemId))
}
