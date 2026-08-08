/**
 * 主题聚合仓库 — AI 主题分组管理
 *
 * 懒加载友好设计：
 * - getTopicGroupMeta: 列表只返回组元信息（含未读/总数），一条 SQL
 * - getTopicGroupItems: 点击展开时才拉单组 items，一条 JOIN
 * - markGroupAsRead: 整组标记已读，单条 UPDATE
 */
import { eq } from 'drizzle-orm'
import { rawItems, topicGroups, topicItems } from '../schema'
import { getDb, getPgPool, type NewsItem } from './connection'
/** 初始化数据库表 */
export async function initDatabase() {
  const pool = getPgPool()
  await pool.query(`
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
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_raw_items_source ON raw_items(source)')
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_raw_items_fetched_at ON raw_items(fetched_at DESC)',
  )
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_analysis (
      item_id TEXT PRIMARY KEY REFERENCES raw_items(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
}
/** 存储主题聚合 */
export async function storeTopicGroups(
  source: string,
  groups: Array<{ topic: string; summary: string; itemIds: string[] }>,
): Promise<void> {
  const db = getDb()
  // 删除该数据源的旧主题
  const oldTopics = await db
    .select({ id: topicGroups.id })
    .from(topicGroups)
    .where(eq(topicGroups.source, source))
  for (const old of oldTopics) {
    await db.delete(topicItems).where(eq(topicItems.topicId, old.id))
    await db.delete(topicGroups).where(eq(topicGroups.id, old.id))
  }
  // 插入新主题
  for (const group of groups) {
    const topicId = `${source}:topic:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    await db.insert(topicGroups).values({
      id: topicId,
      source,
      topic: group.topic,
      summary: group.summary,
    })
    for (const itemId of group.itemIds) {
      const exists = await db
        .select({ id: rawItems.id })
        .from(rawItems)
        .where(eq(rawItems.id, itemId))
        .limit(1)
      if (exists.length > 0) {
        await db.insert(topicItems).values({ topicId, itemId })
      } else {
        console.log(`  ⚠️ Skipping invalid itemId: ${itemId}`)
      }
    }
  }
}
/** 主题组元信息（不含 items，列表轻量加载用） */
export interface TopicGroupMeta {
  id: string
  topic: string
  summary: string
  unreadCount: number
  totalCount: number
}
/** 获取主题组列表（一条 SQL 聚合出每组的未读数/总数） */
export async function getTopicGroupMeta(
  source: string,
  showAll: boolean = false,
): Promise<TopicGroupMeta[]> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT tg.id, tg.topic, tg.summary,
       COUNT(ti.item_id)::int AS total_count,
       COUNT(ti.item_id) FILTER (WHERE ri.is_read = FALSE)::int AS unread_count
     FROM topic_groups tg
     LEFT JOIN topic_items ti ON ti.topic_id = tg.id
     LEFT JOIN raw_items ri ON ri.id = ti.item_id
     WHERE tg.source = $1
     GROUP BY tg.id, tg.topic, tg.summary, tg.created_at
     ORDER BY tg.created_at DESC`,
    [source],
  )
  const groups = rows.map((r) => ({
    id: r.id as string,
    topic: r.topic as string,
    summary: r.summary as string,
    unreadCount: r.unread_count as number,
    totalCount: r.total_count as number,
  }))
  // 未勾选"显示已读"时，过滤掉全已读的组
  return showAll ? groups : groups.filter((g) => g.unreadCount > 0)
}
/** 列表用轻量条目（不含原文 readme / AI details，最重的字段在 getItemDetail 才取） */
export interface TopicItem {
  id: string
  source: string
  title: string | null
  url: string
  summary: string | null
  fetchedAt: number
  isRead: boolean
}
/** 获取单个主题组的 items 轻量列表（点击展开时才调用，一条 JOIN） */
export async function getTopicGroupItems(
  topicId: string,
  showAll: boolean = false,
): Promise<TopicItem[]> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT ri.id, ri.source, ri.title, ri.url,
       ri.fetched_at, ri.is_read, aa.summary
     FROM topic_items ti
     INNER JOIN raw_items ri ON ri.id = ti.item_id
     LEFT JOIN ai_analysis aa ON aa.item_id = ri.id
     WHERE ti.topic_id = $1 AND ($2 = TRUE OR ri.is_read = FALSE)
     ORDER BY ri.fetched_at DESC`,
    [topicId, showAll],
  )
  return rows.map((r) => ({
    id: r.id as string,
    source: r.source as string,
    title: r.title as string | null,
    url: r.url as string,
    summary: r.summary as string | null,
    fetchedAt: Number(r.fetched_at),
    isRead: r.is_read as boolean,
  })) as TopicItem[]
}
/** 获取单条 item 完整详情（含 rawData 原文 + AI details）—— 点击条目展开时才请求 */
export async function getItemDetail(itemId: string): Promise<NewsItem | null> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT ri.id, ri.source, ri.title, ri.url, ri.raw_data,
       ri.fetched_at, ri.is_read, aa.summary, aa.details
     FROM raw_items ri
     LEFT JOIN ai_analysis aa ON aa.item_id = ri.id
     WHERE ri.id = $1`,
    [itemId],
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id as string,
    source: r.source as string,
    title: r.title as string | null,
    url: r.url as string,
    rawData: r.raw_data as Record<string, unknown>,
    summary: r.summary as string | null,
    details: r.details as string | null,
    fetchedAt: Number(r.fetched_at),
    isRead: r.is_read as boolean,
  }
}
/** 将一个主题组内的全部未读标记为已读，返回更新条数 */
export async function markGroupAsRead(topicId: string): Promise<number> {
  const pool = getPgPool()
  const result = await pool.query(
    `UPDATE raw_items ri SET is_read = TRUE
     FROM topic_items ti
     WHERE ti.topic_id = $1 AND ti.item_id = ri.id AND ri.is_read = FALSE`,
    [topicId],
  )
  return result.rowCount ?? 0
}
