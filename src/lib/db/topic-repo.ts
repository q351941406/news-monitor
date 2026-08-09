/**
 * 主题聚合仓库 — AI 主题分组管理
 *
 * 懒加载友好设计：
 * - getTopicGroupMeta: 列表只返回组元信息（含未读/总数），一条 SQL
 * - getTopicGroupItems: 点击展开时才拉单组 items，一条 JOIN
 * - markGroupAsRead: 整组标记已读，单条 UPDATE
 */
import { eq, and } from 'drizzle-orm'
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
/**
 * 增量 upsert 主题聚合（不再全删重建）
 * - AI 返回的组按 topic 名归并：已有同名主题 → 追加成员；新主题 → 新建组
 * - 幂等：item 已存在于该主题下则跳过
 */
export async function storeTopicGroups(
  source: string,
  groups: Array<{ topic: string; summary: string; itemIds: string[] }>,
): Promise<void> {
  const db = getDb()
  // 取该 source 已有主题，建立 topic名 → id 映射（复用同名主题，避免主题漂移）
  const existing = await db
    .select({ id: topicGroups.id, topic: topicGroups.topic })
    .from(topicGroups)
    .where(eq(topicGroups.source, source))
  const topicIdByName = new Map(existing.map((t) => [t.topic, t.id]))
  for (const group of groups) {
    let topicId = topicIdByName.get(group.topic)
    if (!topicId) {
      topicId = `${source}:topic:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      await db.insert(topicGroups).values({
        id: topicId,
        source,
        topic: group.topic,
        summary: group.summary,
      })
      topicIdByName.set(group.topic, topicId)
    } else if (group.summary) {
      // 同名主题复用：同步更新概括（AI 每次生成的 summary 可能更准确）
      await db
        .update(topicGroups)
        .set({ summary: group.summary })
        .where(eq(topicGroups.id, topicId))
    }
    for (const itemId of group.itemIds) {
      const exists = await db
        .select({ id: rawItems.id })
        .from(rawItems)
        .where(eq(rawItems.id, itemId))
        .limit(1)
      if (exists.length > 0) {
        // 幂等：已存在关联则跳过
        const linked = await db
          .select({ topicId: topicItems.topicId })
          .from(topicItems)
          .where(and(eq(topicItems.topicId, topicId), eq(topicItems.itemId, itemId)))
          .limit(1)
        if (linked.length === 0) {
          await db.insert(topicItems).values({ topicId, itemId })
        }
      } else {
        console.log(`  ⚠️ Skipping invalid itemId: ${itemId}`)
      }
    }
  }
}
/** 删除该 source 下已无任何 items 的空主题（主题组不再保留空壳） */
export async function deleteEmptyTopics(source: string): Promise<number> {
  const pool = getPgPool()
  const result = await pool.query(
    `DELETE FROM topic_groups tg
     WHERE tg.source = $1
       AND NOT EXISTS (SELECT 1 FROM topic_items ti WHERE ti.topic_id = tg.id)`,
    [source],
  )
  return result.rowCount ?? 0
}
/** 获取该 source 已有主题列表（作 AI 历史上下文：topic 名 + 概括 + 当前成员数）
 * itemCount 让 AI 感知主题规模，避免为已有规模的主题再造相似新主题 */
export async function getExistingTopics(
  source: string,
): Promise<Array<{ topic: string; summary: string; itemCount: number }>> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT tg.topic, tg.summary, COUNT(ti.item_id)::int AS item_count
     FROM topic_groups tg
     LEFT JOIN topic_items ti ON ti.topic_id = tg.id
     WHERE tg.source = $1
     GROUP BY tg.id, tg.topic, tg.summary
     ORDER BY item_count DESC, tg.created_at DESC`,
    [source],
  )
  return rows.map((r) => ({
    topic: r.topic as string,
    summary: r.summary as string,
    itemCount: (r.item_count as number) ?? 0,
  }))
}
/**
 * 获取该 source 的待聚合批次（队列消费）：
 * 新数据优先（保证最新热点立即可见）＋ 最旧未聚合补足（消化积压）
 * 总数为 batchSize
 */
export async function getAggregationBatch(
  source: string,
  batchSize: number = 100,
): Promise<
  Array<{ id: string; title: string | null; summary: string | null; details: string | null }>
> {
  const pool = getPgPool()
  // 新数据：未聚合且 fetched_at 最新（优先取最新一半，保证新热点可见）
  const freshLimit = Math.max(10, Math.floor(batchSize / 2))
  const fresh = await pool.query(
    `SELECT ri.id, ri.title, aa.summary, aa.details
     FROM raw_items ri
     LEFT JOIN ai_analysis aa ON aa.item_id = ri.id
     WHERE ri.source = $1 AND ri.aggregated_at IS NULL AND aa.summary IS NOT NULL
     ORDER BY ri.fetched_at DESC
     LIMIT $2`,
    [source, freshLimit],
  )
  const freshIds = new Set(fresh.rows.map((r) => r.id))
  // 旧数据：未聚合且 fetched_at 最旧（补足剩余，消化积压）
  const oldLimit = batchSize - fresh.rows.length
  const old =
    oldLimit > 0
      ? await pool.query(
          `SELECT ri.id, ri.title, aa.summary, aa.details
         FROM raw_items ri
         LEFT JOIN ai_analysis aa ON aa.item_id = ri.id
         WHERE ri.source = $1 AND ri.aggregated_at IS NULL AND aa.summary IS NOT NULL
           AND NOT (ri.id = ANY($2::text[]))
         ORDER BY ri.fetched_at ASC
         LIMIT $3`,
          [source, [...freshIds], oldLimit],
        )
      : { rows: [] as any[] }
  const merged = [...fresh.rows, ...old.rows]
  return merged.map((r) => ({
    id: r.id as string,
    title: r.title as string | null,
    summary: r.summary as string | null,
    details: r.details as string | null,
  }))
}
/** 获取该 source 剩余待聚合 items 数（大扫除完整性检测用：没跑完要失败告警） */
export async function getPendingItemCount(source: string): Promise<number> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM raw_items ri
     LEFT JOIN ai_analysis aa ON aa.item_id = ri.id
     WHERE ri.source = $1 AND ri.aggregated_at IS NULL AND aa.summary IS NOT NULL`,
    [source],
  )
  return rows[0]?.cnt ?? 0
}
/** 标记一批 item 已聚合（队列消费完成，时间戳=现在，相当于挪到队尾） */
/** 重置聚合标记：把该 source 全部已聚合数据重新标记为未聚合（大扫除全量重聚用） */
export async function resetAggregationMarks(source: string): Promise<number> {
  const pool = getPgPool()
  const result = await pool.query('UPDATE raw_items SET aggregated_at = NULL WHERE source = $1', [
    source,
  ])
  return result.rowCount ?? 0
}
export async function markItemsAggregated(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  const pool = getPgPool()
  await pool.query('UPDATE raw_items SET aggregated_at = NOW() WHERE id = ANY($1::text[])', [
    itemIds,
  ])
}
/** 获取某 source 全部已摘要 items（大扫除用，无分页） */
/** 删除某 source 的全部主题组及关联（大扫除重建前调用） */
export async function deleteAllTopics(source: string): Promise<number> {
  const pool = getPgPool()
  const result = await pool.query('DELETE FROM topic_groups WHERE source = $1', [source])
  return result.rowCount ?? 0
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
