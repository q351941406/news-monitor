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
/**
 * 每个数据源的计数。
 *
 * `unread` 是**徽标口径**（raw_items 的未读行数）；`groupedUnread` /
 * `ungroupedUnread` 把它拆成「已归入主题组（前台列表里看得见）」与
 * 「没归组（徽标在数、列表里看不见）」。
 *
 * 为什么要拆（2026-10 修复「徽标 8、列表空白」）：
 * 徽标按 raw_items 数，列表按 topic_groups 渲染，两套口径一旦脱钩，
 * 用户看到的数字就无法在页面里找到对应内容。线上实测 github 365 条
 * 全部未归组（8 条未读）—— 徽标有数字、列表却一个字都没有。
 * 拆开后前端可以既标明差在哪，也能决定徽标该显示哪一个口径。
 */
export interface SourceCounts {
  /** raw_items 总行数 */
  total: number
  /** 未读行数（徽标口径） */
  unread: number
  /** 未读且已归入主题组（前台可见） */
  groupedUnread: number
  /** 未读但没归组（前台列表里看不到） */
  ungroupedUnread: number
  /** 未读且还没有 AI 摘要（富化流水线尚未处理到） */
  pendingSummary: number
}

/** 获取每个数据源的真实总数和未读数（不受 limit 影响） */
export async function getNewsCounts(): Promise<Record<string, SourceCounts>> {
  const db = getDb()
  // 一次 GROUP BY 查询拿到全部来源的 total/unread，替代 3×2 次串行查询
  const rows = await db
    .select({
      source: rawItems.source,
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) FILTER (WHERE ${rawItems.isRead} = false)::int`,
      // 已归组 = 存在 topic_items 关联
      groupedUnread: sql<number>`count(*) FILTER (WHERE ${rawItems.isRead} = false AND EXISTS (SELECT 1 FROM topic_items ti WHERE ti.item_id = ${rawItems.id}))::int`,
      // 未归组 = 没有任何主题组关联
      ungroupedUnread: sql<number>`count(*) FILTER (WHERE ${rawItems.isRead} = false AND NOT EXISTS (SELECT 1 FROM topic_items ti WHERE ti.item_id = ${rawItems.id}))::int`,
      // 还缺 AI 摘要
      pendingSummary: sql<number>`count(*) FILTER (WHERE ${rawItems.isRead} = false AND NOT EXISTS (SELECT 1 FROM ai_analysis aa WHERE aa.item_id = ${rawItems.id}))::int`,
    })
    .from(rawItems)
    .groupBy(rawItems.source)
  const result: Record<string, SourceCounts> = {
    github: { total: 0, unread: 0, groupedUnread: 0, ungroupedUnread: 0, pendingSummary: 0 },
    producthunt: { total: 0, unread: 0, groupedUnread: 0, ungroupedUnread: 0, pendingSummary: 0 },
    twitter: { total: 0, unread: 0, groupedUnread: 0, ungroupedUnread: 0, pendingSummary: 0 },
  }
  for (const row of rows) {
    if (row.source in result) {
      result[row.source] = {
        total: row.total,
        unread: row.unread,
        groupedUnread: row.groupedUnread,
        ungroupedUnread: row.ungroupedUnread,
        pendingSummary: row.pendingSummary,
      }
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
/** 获取各源最后一次真正入库数据的时间（用于新鲜度告警） */
export async function getLastIngestedBySource(): Promise<
  Array<{ source: string; lastIngestedAt: number | null }>
> {
  const db = getDb()
  const rows = await db
    .select({
      source: rawItems.source,
      lastIngestedAt: sql<string | null>`max(${rawItems.fetchedAt})`,
    })
    .from(rawItems)
    .groupBy(rawItems.source)
  return rows.map((r) => ({
    source: r.source,
    lastIngestedAt: r.lastIngestedAt ? Number(r.lastIngestedAt) : null,
  }))
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
