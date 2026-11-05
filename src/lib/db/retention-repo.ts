/**
 * 保留期清理 —— 物理删除「已读超过保留期」的条目
 *
 * 删除 raw_items 会通过外键级联清掉 ai_analysis 与 topic_items（schema 里都是
 * ON DELETE CASCADE），因此只需要一条 DELETE。分批执行避免一次锁太多行。
 */
import { getPgPool } from './connection'

export interface PurgeReadItemsOptions {
  /** 每批删除行数，默认 500 */
  batchSize?: number
  /** 最多跑多少批，防止单次运行失控，默认 50（即单次上限 25,000 行） */
  maxBatches?: number
}

export interface PurgeReadItemsResult {
  /** 实际删除条数 */
  deleted: number
  /** 实际执行的批次数 */
  batches: number
  /** 本次使用的截止时间戳 */
  cutoff: number
  /** true = 达到批次数上限，仍有积压留待下次 */
  reachedLimit: boolean
}

const DEFAULT_BATCH_SIZE = 500
const DEFAULT_MAX_BATCHES = 50

/** 统计会被清理的条数（用于 --dry-run / 日志） */
export async function countReadItemsBefore(cutoffMs: number): Promise<number> {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM raw_items
     WHERE is_read = TRUE AND COALESCE(read_at, fetched_at) < $1`,
    [cutoffMs],
  )
  return rows[0]?.count ?? 0
}

/**
 * 分批删除已读且超过保留期的条目。
 *
 * 兜底 `COALESCE(read_at, fetched_at)`：read_at 是 0008 迁移新增的列，
 * 迁移已把存量已读行回填成 fetched_at；这里再兜一层，避免任何漏网行永不过期。
 */
export async function purgeReadItemsBefore(
  cutoffMs: number,
  opts: PurgeReadItemsOptions = {},
): Promise<PurgeReadItemsResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE
  const maxBatches = opts.maxBatches ?? DEFAULT_MAX_BATCHES
  const pool = getPgPool()
  let deleted = 0
  let batches = 0

  for (let i = 0; i < maxBatches; i++) {
    const result = await pool.query(
      `WITH doomed AS (
         SELECT id
         FROM raw_items
         WHERE is_read = TRUE AND COALESCE(read_at, fetched_at) < $1
         ORDER BY COALESCE(read_at, fetched_at) ASC
         LIMIT $2
       )
       DELETE FROM raw_items ri
       USING doomed d
       WHERE ri.id = d.id
       RETURNING ri.id`,
      [cutoffMs, batchSize],
    )
    const count = result.rowCount ?? 0
    deleted += count
    batches++
    if (count < batchSize) {
      return { deleted, batches, cutoff: cutoffMs, reachedLimit: false }
    }
  }

  return { deleted, batches, cutoff: cutoffMs, reachedLimit: true }
}

/** 删除因条目被清理而变空的主题组（级联删除 topic_items 后可能留下空壳） */
export async function deleteEmptyTopicGroups(): Promise<number> {
  const pool = getPgPool()
  const result = await pool.query(
    `DELETE FROM topic_groups tg
     WHERE NOT EXISTS (SELECT 1 FROM topic_items ti WHERE ti.topic_id = tg.id)`,
  )
  return result.rowCount ?? 0
}
