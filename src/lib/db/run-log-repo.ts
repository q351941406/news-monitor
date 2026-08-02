/**
 * 运行日志仓库 - 记录和查询 scrape/ai-process/topic-aggregate 的执行结果
 */
import { desc, gte, and, eq, sql } from 'drizzle-orm'
import { runLogs } from '../schema'
import { getDb, getPgPool } from './connection'
import { randomUUID } from 'crypto'

/** 记录一次执行结果 */
export async function logRun(params: {
  source: string
  stage: string
  status: 'success' | 'failure'
  itemsCount?: number
  durationMs?: number
  error?: string | null
}): Promise<void> {
  const db = getDb()
  await db.insert(runLogs).values({
    id: randomUUID(),
    source: params.source,
    stage: params.stage,
    status: params.status,
    itemsCount: params.itemsCount ?? 0,
    durationMs: params.durationMs ?? 0,
    error: params.error ?? null,
  })
}

/** 获取最近的运行日志 */
export async function getRecentRuns(limit: number = 20) {
  const db = getDb()
  return db.select().from(runLogs).orderBy(desc(runLogs.startedAt)).limit(limit)
}

/** 获取最近 N 天的每日统计（用于趋势图） */
export async function getDailyStats(days: number = 7) {
  const pool = getPgPool()
  const result = await pool.query(
    `SELECT
       DATE(started_at) as date,
       source,
       stage,
       COUNT(*) as total_runs,
       COUNT(*) FILTER (WHERE status = 'success') as success_count,
       COALESCE(SUM(items_count), 0) as total_items,
       COALESCE(AVG(duration_ms), 0) as avg_duration_ms
     FROM run_logs
     WHERE started_at >= NOW() - INTERVAL '${days} days'
     GROUP BY DATE(started_at), source, stage
     ORDER BY date ASC, source ASC, stage ASC`,
  )
  return result.rows
}

/** 获取各源的汇总统计 */
export async function getSourceStats() {
  const pool = getPgPool()
  const result = await pool.query(
    `SELECT
       source,
       stage,
       COUNT(*) as total_runs,
       COUNT(*) FILTER (WHERE status = 'success') as success_count,
       COUNT(*) FILTER (WHERE status = 'failure') as failure_count,
       COALESCE(SUM(items_count), 0) as total_items,
       COALESCE(AVG(duration_ms), 0) as avg_duration_ms,
       MAX(started_at) as last_run_at
     FROM run_logs
     GROUP BY source, stage
     ORDER BY source ASC, stage ASC`,
  )
  return result.rows
}

/** 获取仪表盘所需的全部数据 */
export async function getMetrics() {
  const [recentRuns, dailyStats, sourceStats] = await Promise.all([
    getRecentRuns(30),
    getDailyStats(7),
    getSourceStats(),
  ])

  // 检测静默失败：最近 3 次同源同阶段连续 0 数据
  const silentFailures = detectSilentFailures(recentRuns)

  return {
    recentRuns,
    dailyStats,
    sourceStats,
    silentFailures,
  }
}

/** 检测静默失败：某源连续 3 次抓取 0 条数据 */
function detectSilentFailures(runs: any[]) {
  const warnings: { source: string; stage: string; consecutiveZeros: number }[] = []
  const bySourceStage = new Map<string, any[]>()

  for (const run of runs) {
    const key = `${run.source}:${run.stage}`
    if (!bySourceStage.has(key)) bySourceStage.set(key, [])
    bySourceStage.get(key)!.push(run)
  }

  for (const [key, runs] of bySourceStage.entries()) {
    // runs 已按 startedAt DESC 排序，取最近 3 条
    const recent3 = runs.slice(0, 3)
    if (
      recent3.length === 3 &&
      recent3.every((r) => r.status === 'success' && r.itemsCount === 0)
    ) {
      const [source, stage] = key.split(':')
      warnings.push({ source, stage, consecutiveZeros: 3 })
    }
  }

  return warnings
}
