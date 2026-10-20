/**
 * 主题聚合仓库 — AI 主题分组管理
 *
 * 懒加载友好设计：
 * - getTopicGroupMeta: 列表只返回组元信息（含未读/总数），一条 SQL
 * - getTopicGroupItems: 点击展开时才拉单组 items，一条 JOIN
 * - markGroupAsRead: 整组标记已读，单条 UPDATE
 */
import { eq, and, sql } from 'drizzle-orm'
import { rawItems, topicGroups, topicItems } from '../schema'
import { getDb, getPgPool, type NewsItem } from './connection'
/** 初始化数据库表 */
/** 各数据源 raw_items.id 的前缀（AI 偶尔省略前缀时用于容错补全） */
const SOURCE_PREFIX: Record<string, string> = {
  github: 'github:',
  producthunt: 'ph:',
  twitter: 'x:',
}
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
 * 落组结果：**只有真正挂进某个主题组的条目**才算消费成功。
 *
 * 为什么要显式返回（2026-10 修复「徽标有数字、列表没内容」）：
 * 此前本函数返回 void，调用方（scripts/topic-aggregate.ts）只能把**整批**都标记成
 * 「已聚合」—— 于是 AI 漏掉的、或 id 对不上的条目被"假消费"：
 * 它们不在任何主题组里（前台看不见），却已被 aggregated_at 标记为已消费；
 * 而聚合队列只捞 aggregated_at IS NULL 的条目，于是这些内容永久隐身。
 * 线上实测：github 365 条全部不在任何主题组（徽标显示 8 条未读，列表却为空）。
 */
export interface StoreTopicGroupsResult {
  /** 成功关联到主题组的 item id（已存在关联也算 —— 它确实在某个组里） */
  linked: string[]
  /** 未关联的 item id（AI 返回了，但库里找不到对应条目） */
  skipped: string[]
}

/**
 * id 候选：原值 → 补前缀 → 两者的全小写变体。
 *
 * 全小写变体是必需的：GitHub 的 id 已按 ADR-0006 归一化为小写
 * （github:owner/repo），而 AI 常照抄标题里的原始大小写
 * （github:deepseek-ai/DeepGEMM）—— 旧实现大小写敏感，这类条目 100% 对不上，
 * 被静默跳过（线上日志：⚠️ Skipping invalid itemId），最终永久隐身。
 */
export function buildIdCandidates(source: string, itemId: string): string[] {
  const prefix = SOURCE_PREFIX[source] ?? `${source}:`
  const base = itemId.includes(':') ? [itemId] : [itemId, `${prefix}${itemId}`]
  const out: string[] = []
  for (const c of base) {
    for (const variant of [c, c.toLowerCase()]) {
      if (!out.includes(variant)) out.push(variant)
    }
  }
  return out
}

/**
 * 按标题回退匹配：AI 照抄标题（owner/repo 原始大小写）时，id 候选全部落空。
 *
 * 只在**标题唯一命中**时才采用（PH 的标题是产品名，可能重名，
 * 重名时宁可放弃，也不能把内容挂到错误的条目上）。
 */
async function resolveByTitle(
  db: ReturnType<typeof getDb>,
  source: string,
  itemId: string,
): Promise<string | null> {
  const bare = itemId.replace(/^[a-z]+:/i, '').trim()
  if (!bare) return null
  const rows = await db
    .select({ id: rawItems.id })
    .from(rawItems)
    .where(and(eq(rawItems.source, source), sql`lower(${rawItems.title}) = lower(${bare})`))
    .limit(2)
  return rows.length === 1 ? rows[0].id : null
}

/**
 * 增量 upsert 主题聚合（不再全删重建）
 * - AI 返回的组按 topic 名归并：已有同名主题 → 追加成员；新主题 → 新建组
 * - 幂等：item 已存在于该主题下则跳过
 * - 返回落组结果：调用方据此决定哪些条目可以标记为「已聚合」
 */
export async function storeTopicGroups(
  source: string,
  groups: Array<{ topic: string; summary: string; itemIds: string[] }>,
): Promise<StoreTopicGroupsResult> {
  const db = getDb()
  const linked: string[] = []
  const linkedSet = new Set<string>()
  const skipped: string[] = []
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
      // 容错：AI 可能省略 source 前缀（如返回 "owner/repo" 而非 "github:owner/repo"），
      // 也可能照抄标题里的原始大小写 —— 依次尝试候选，命中的才做关联
      let linkedItemId: string | null = null
      for (const candidate of buildIdCandidates(source, itemId)) {
        const exists = await db
          .select({ id: rawItems.id })
          .from(rawItems)
          .where(eq(rawItems.id, candidate))
          .limit(1)
        if (exists.length > 0) {
          linkedItemId = candidate
          break
        }
      }
      // id 全不命中 → 按标题回退（唯一命中才采用）
      if (!linkedItemId) {
        linkedItemId = await resolveByTitle(db, source, itemId)
      }
      if (!linkedItemId) {
        console.log(`  ⚠️ Skipping invalid itemId: ${itemId}`)
        skipped.push(itemId)
        continue
      }
      // 幂等：已存在关联则跳过
      const already = await db
        .select({ topicId: topicItems.topicId })
        .from(topicItems)
        .where(and(eq(topicItems.topicId, topicId), eq(topicItems.itemId, linkedItemId)))
        .limit(1)
      if (already.length === 0) {
        await db.insert(topicItems).values({ topicId, itemId: linkedItemId })
      }
      if (!linkedSet.has(linkedItemId)) {
        linkedSet.add(linkedItemId)
        linked.push(linkedItemId)
      }
    }
  }
  return { linked, skipped }
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
  /* v8 ignore next -- PG 驱动对 INSERT/UPDATE/DELETE 始终返回 rowCount，此处仅是类型兜底 */
  return result.rowCount ?? 0
}

/** 删除指定主题组中「已无任何未读 items」的组（物理删除，级联删关联）
 * 覆盖两种情形：空壳组（无 items）＋ 全已读组
 * 原子 DELETE：只在组内不存在未读 item 时才删除，天然无竞态 */

/** 删除「包含指定 item 且已无任何未读」的主题组（实时清理，标记单条已读后调用） */
export async function deleteReadEmptyTopicsByItemId(itemId: string): Promise<number> {
  const pool = getPgPool()
  const result = await pool.query(
    `DELETE FROM topic_groups tg
     WHERE tg.id IN (
       SELECT DISTINCT ti.topic_id FROM topic_items ti WHERE ti.item_id = $1
     )
       AND NOT EXISTS (
         SELECT 1 FROM topic_items ti2
         JOIN raw_items ri ON ri.id = ti2.item_id
         WHERE ti2.topic_id = tg.id AND ri.is_read = FALSE
       )`,
    [itemId],
  )
  /* v8 ignore next -- PG 驱动对 INSERT/UPDATE/DELETE 始终返回 rowCount，此处仅是类型兜底 */
  return result.rowCount ?? 0
}

export async function deleteReadEmptyTopics(topicIds: string[]): Promise<number> {
  if (topicIds.length === 0) return 0
  const pool = getPgPool()
  const result = await pool.query(
    `DELETE FROM topic_groups tg
     WHERE tg.id = ANY($1::text[])
       AND NOT EXISTS (
         SELECT 1 FROM topic_items ti
         JOIN raw_items ri ON ri.id = ti.item_id
         WHERE ti.topic_id = tg.id AND ri.is_read = FALSE
       )`,
    [topicIds],
  )
  /* v8 ignore next -- PG 驱动对 INSERT/UPDATE/DELETE 始终返回 rowCount，此处仅是类型兜底 */
  return result.rowCount ?? 0
}

/** 删除某 source 下「已无任何未读 items」的全部主题组（物理删除，级联删关联）
 * 用于批量兜底清理：readAll、聚合脚本每轮、或定时维护 */
export async function deleteReadEmptyTopicsBySource(source: string): Promise<number> {
  const pool = getPgPool()
  const result = await pool.query(
    `DELETE FROM topic_groups tg
     WHERE tg.source = $1
       AND NOT EXISTS (
         SELECT 1 FROM topic_items ti
         JOIN raw_items ri ON ri.id = ti.item_id
         WHERE ti.topic_id = tg.id AND ri.is_read = FALSE
       )`,
    [source],
  )
  /* v8 ignore next -- PG 驱动对 INSERT/UPDATE/DELETE 始终返回 rowCount，此处仅是类型兜底 */
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
    // v8 ignore next -- SQL 侧 COUNT(...)::int 恒非 null，此处仅是类型兜底
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
      : { rows: [] }
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
  // v8 ignore next -- COUNT 聚合恒返回一行，此处仅是类型兜底
  return rows[0]?.cnt ?? 0
}
/** 标记一批 item 已聚合（队列消费完成，时间戳=现在，相当于挪到队尾） */
/** 重置聚合标记：把该 source 全部已聚合数据重新标记为未聚合（大扫除全量重聚用） */
export async function resetAggregationMarks(source: string): Promise<number> {
  const pool = getPgPool()
  const result = await pool.query('UPDATE raw_items SET aggregated_at = NULL WHERE source = $1', [
    source,
  ])
  /* v8 ignore next -- PG 驱动对 INSERT/UPDATE/DELETE 始终返回 rowCount，此处仅是类型兜底 */
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
  /* v8 ignore next -- PG 驱动对 INSERT/UPDATE/DELETE 始终返回 rowCount，此处仅是类型兜底 */
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
/**
 * 未归组条目：**未读 且 不在任何主题组里**。
 *
 * 为什么需要这个查询（2026-10 修复「徽标有数字、列表没内容」）：
 * 徽标数字来自 raw_items 的未读行数，而列表渲染的是 topic_groups。
 * 两套口径一旦脱钩（条目已入库但没挂上任何主题组），就会出现
 * "GitHub 8"却整页空白 —— 线上 github 365 条全部如此。
 * 前台必须能把这些条目显式渲染出来（否则用户只看到一个无法解释的数字），
 * 所以需要一个稳定入口把它们捞出来。
 */
export interface UngroupedItem {
  id: string
  source: string
  title: string | null
  url: string
  summary: string | null
  fetchedAt: number
  isRead: boolean
  /** 还缺 AI 摘要（富化流水线尚未处理到） */
  pendingSummary: boolean
}

/** 查某源（或全部源）下未读且未归组的条目，按抓取时间倒序 */
export async function getUngroupedItems(
  source: string = 'all',
  limit: number = 50,
): Promise<UngroupedItem[]> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT ri.id, ri.source, ri.title, ri.url, ri.fetched_at, ri.is_read,
       aa.summary,
       (aa.summary IS NULL) AS pending_summary
     FROM raw_items ri
     LEFT JOIN ai_analysis aa ON aa.item_id = ri.id
     WHERE ($1 = 'all' OR ri.source = $1)
       AND ri.is_read = FALSE
       AND NOT EXISTS (SELECT 1 FROM topic_items ti WHERE ti.item_id = ri.id)
     ORDER BY ri.fetched_at DESC
     LIMIT $2`,
    [source, limit],
  )
  return rows.map((r) => ({
    id: r.id as string,
    source: r.source as string,
    title: r.title as string | null,
    url: r.url as string,
    summary: (r.summary as string | null) ?? null,
    fetchedAt: Number(r.fetched_at),
    isRead: r.is_read as boolean,
    pendingSummary: Boolean(r.pending_summary),
  }))
}

/**
 * 把「没归组」的条目放回聚合队列（aggregated_at 置回 NULL）。
 *
 * 用途：修复存量孤儿 —— 条目被标记成「已聚合」，却没挂上任何主题组。
 * 它们不会自己恢复：聚合队列只捞 aggregated_at IS NULL 的条目，
 * 于是这些内容永久悬空（徽标在数、列表里看不见）。
 *
 * 默认**只处理未读**：已读条目按产品语义「读完即消失」，
 * 不该重新冒出来（已读的 357 条 github 内容不算孤儿，是「读完了」）。
 *
 * 注意：没有 AI 摘要的条目无法直接进聚类（队列要求 summary 非空），
 * 它们会先由富化流程补摘要，随后自然进入聚合队列。
 */
export async function requeueUngroupedItems(options: {
  source?: string
  includeRead?: boolean
  limit?: number
}): Promise<{ requeued: number; ids: string[]; withoutSummary: number }> {
  const pool = getPgPool()
  const source = options.source ?? 'all'
  const includeRead = options.includeRead ?? false
  const limit = options.limit ?? 500
  const { rows } = await pool.query(
    `WITH candidates AS (
       SELECT ri.id,
              EXISTS (SELECT 1 FROM ai_analysis aa WHERE aa.item_id = ri.id) AS has_summary
       FROM raw_items ri
       WHERE ($1 = 'all' OR ri.source = $1)
         AND ($2 = TRUE OR ri.is_read = FALSE)
         AND NOT EXISTS (SELECT 1 FROM topic_items ti WHERE ti.item_id = ri.id)
       ORDER BY ri.fetched_at ASC
       LIMIT $3
     )
     UPDATE raw_items ri
     SET aggregated_at = NULL
     FROM candidates c
     WHERE ri.id = c.id
     RETURNING ri.id, c.has_summary`,
    [source, includeRead, limit],
  )
  return {
    requeued: rows.length,
    ids: rows.map((r) => r.id as string),
    withoutSummary: rows.filter((r) => !r.has_summary).length,
  }
}

/**
 * 各源的主题组数量（可展示性巡检用）。
 *
 * 某源「有未读内容却一个组都没有」= 列表整页空白，
 * 而徽标仍在显示未读数 —— 这正是 2026-10 线上事故的形态。
 */
export async function getTopicGroupCountsBySource(): Promise<Record<string, number>> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT source, COUNT(*)::int AS cnt FROM topic_groups GROUP BY source`,
  )
  const result: Record<string, number> = { github: 0, producthunt: 0, twitter: 0 }
  for (const r of rows) {
    result[r.source as string] = r.cnt as number
  }
  return result
}

/**
 * 每个源的「未归组」概况：数量 + 最早一条的抓取时间。
 *
 * 巡检用：只有当最早一条已经**卡住超过阈值**（默认 24h）才算异常 ——
 * 刚抓取、还没轮到富化的条目属于正常在途状态，不该报警。
 */
export interface UngroupedSummary {
  source: string
  /** 未读且未归组的条目数 */
  count: number
  /** 其中还缺 AI 摘要的数量 */
  pendingSummary: number
  /** 最早一条未归组条目的抓取时间（毫秒）；无则 null */
  oldestFetchedAt: number | null
}

export async function getUngroupedSummaryBySource(): Promise<UngroupedSummary[]> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT ri.source,
       COUNT(*)::int AS cnt,
       COUNT(*) FILTER (WHERE aa.summary IS NULL)::int AS pending_summary,
       MIN(ri.fetched_at) AS oldest_fetched_at
     FROM raw_items ri
     LEFT JOIN ai_analysis aa ON aa.item_id = ri.id
     WHERE ri.is_read = FALSE
       AND NOT EXISTS (SELECT 1 FROM topic_items ti WHERE ti.item_id = ri.id)
     GROUP BY ri.source
     ORDER BY ri.source`,
  )
  return rows.map((r) => ({
    source: r.source as string,
    count: r.cnt as number,
    pendingSummary: r.pending_summary as number,
    oldestFetchedAt: r.oldest_fetched_at === null ? null : Number(r.oldest_fetched_at),
  }))
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
  /* v8 ignore next -- PG 驱动对 INSERT/UPDATE/DELETE 始终返回 rowCount，此处仅是类型兜底 */
  return result.rowCount ?? 0
}

/** 单个主题组完整信息（详情页用）：元信息 + 全部 items（含已读） */
export async function getTopicById(
  topicId: string,
): Promise<{ topic: string; summary: string; source: string; items: TopicItem[] } | null> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT tg.id, tg.topic, tg.summary, tg.source,
       ri.id AS item_id, ri.title, ri.url, ri.source AS item_source,
       ri.fetched_at, ri.is_read, aa.summary AS item_summary
     FROM topic_groups tg
     LEFT JOIN topic_items ti ON ti.topic_id = tg.id
     LEFT JOIN raw_items ri ON ri.id = ti.item_id
     LEFT JOIN ai_analysis aa ON aa.item_id = ri.id
     WHERE tg.id = $1
     ORDER BY ri.fetched_at DESC`,
    [topicId],
  )
  if (rows.length === 0) return null
  const first = rows[0]
  const items: TopicItem[] = rows
    .filter((r) => r.item_id !== null)
    .map((r) => ({
      id: r.item_id as string,
      source: r.item_source as string,
      title: r.title as string | null,
      url: r.url as string,
      summary: (r.item_summary as string | null) ?? null,
      fetchedAt: Number(r.fetched_at),
      isRead: r.is_read as boolean,
    }))
  return {
    topic: first.topic as string,
    summary: first.summary as string,
    source: first.source as string,
    items,
  }
}

/** 全量主题列表（sitemap 用）：id + 主题名 + 来源 */
export async function getAllTopics(): Promise<
  Array<{ id: string; topic: string; source: string; createdAt: Date }>
> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT tg.id, tg.topic, tg.source, tg.created_at
     FROM topic_groups tg
     ORDER BY tg.created_at DESC`,
  )
  return rows.map((r) => ({
    id: r.id as string,
    topic: r.topic as string,
    source: r.source as string,
    createdAt: r.created_at as Date,
  }))
}
