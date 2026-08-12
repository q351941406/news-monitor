/**
 * 运行日志仓库 - 记录和查询 scrape/ai-process/topic-aggregate 的执行结果
 */
import { desc } from 'drizzle-orm'
import { runLogs, type RunLog } from '../schema'
import { getDb, getPgPool } from './connection'
import { getAIUsageStats } from './ai-usage-repo'
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

/** SQL 日统计原始行（pg 聚合结果） */
interface DailyStatRow {
  date: string | Date
  source: string
  total_runs: string | number
  success_count: string | number
  total_items: string | number
}

/** SQL 来源统计原始行（pg 聚合结果） */
interface SourceStatRow {
  source: string
  total_items: string | number
  last_run_at: string | null
}

/** 仪表盘日统计（camelCase，按日期+来源聚合） */
export interface DailyStat {
  date: string
  source: string
  totalRuns: number
  successes: number
  failures: number
  totalItems: number
}

/** 仪表盘来源汇总（camelCase，按来源聚合） */
export interface SourceStat {
  source: string
  lastRun: string | null
  lastStatus: string | null
  successRate: number
  totalItems: number
}

/** 仪表盘告警 */
export interface Alert {
  type: string
  source: string
  message: string
}

/** 获取仪表盘所需的全部数据 */
/** 聚合日统计（SQL 行 → camelCase，按 date+source 合并 stage） */
export function aggregateDailyStats(rows: DailyStatRow[]): DailyStat[] {
  const dailyMap = new Map<string, DailyStat>()
  for (const row of rows) {
    const key = String(row.date) + '|' + row.source
    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        date: String(row.date),
        source: row.source,
        totalRuns: 0,
        successes: 0,
        failures: 0,
        totalItems: 0,
      })
    }
    const stat = dailyMap.get(key)!
    const runs = Number(row.total_runs)
    const successes = Number(row.success_count)
    stat.totalRuns += runs
    stat.successes += successes
    stat.failures += runs - successes
    stat.totalItems += Number(row.total_items)
  }
  return [...dailyMap.values()]
}

/** 聚合来源汇总（SQL 行 + 最近运行 → camelCase） */
export function aggregateSourceStats(rows: SourceStatRow[], recentRuns: RunLog[]): SourceStat[] {
  const sourceMap = new Map<
    string,
    { source: string; lastRun: string | null; totalItems: number }
  >()
  for (const row of rows) {
    const source = row.source
    if (!sourceMap.has(source)) {
      sourceMap.set(source, { source, lastRun: null, totalItems: 0 })
    }
    const stat = sourceMap.get(source)!
    stat.totalItems += Number(row.total_items)
    if (row.last_run_at && (!stat.lastRun || row.last_run_at > stat.lastRun)) {
      stat.lastRun = row.last_run_at
    }
  }
  const runCountBySource = new Map<string, { total: number; success: number }>()
  for (const run of recentRuns) {
    const acc = runCountBySource.get(run.source) || { total: 0, success: 0 }
    acc.total++
    if (run.status === 'success') acc.success++
    runCountBySource.set(run.source, acc)
  }
  return [...sourceMap.values()].map((stat) => {
    const lastRunRow = recentRuns.find((r) => r.source === stat.source)
    const counts = runCountBySource.get(stat.source)
    return {
      source: stat.source,
      lastRun: stat.lastRun ?? (lastRunRow ? String(lastRunRow.startedAt) : null),
      lastStatus: lastRunRow?.status ?? null,
      successRate: counts ? Math.round((counts.success / counts.total) * 100) : 100,
      totalItems: stat.totalItems,
    }
  })
}

export async function getMetrics() {
  const [recentRuns, dailyStats, sourceStats, aiUsage] = await Promise.all([
    getRecentRuns(30),
    getDailyStats(7),
    getSourceStats(),
    getAIUsageStats(7),
  ])
  // 检测静默失败：最近 3 次同源同阶段连续 0 数据
  const silentFailures = detectSilentFailures(recentRuns)

  // --- 转换 SQL 聚合行为前端期望的 camelCase 结构 ---
  const normalizedDaily = aggregateDailyStats(dailyStats)
  const normalizedSource = aggregateSourceStats(sourceStats, recentRuns)

  // alerts: 将 silentFailures 转换为前端格式
  const alerts: Alert[] = silentFailures.map((f) => ({
    type: 'silent_failure',
    source: f.source,
    message: '连续 ' + f.consecutiveZeros + ' 次抓取 0 条数据',
  }))

  return {
    recentRuns,
    dailyStats: normalizedDaily,
    sourceStats: normalizedSource,
    alerts,
    aiUsage,
  }
}

/** 检测静默失败：某源连续 3 次抓取 0 条数据 */
function detectSilentFailures(runs: RunLog[]) {
  const warnings: { source: string; stage: string; consecutiveZeros: number }[] = []
  const bySourceStage = new Map<string, RunLog[]>()

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
