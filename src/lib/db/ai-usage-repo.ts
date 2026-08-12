/**
 * AI 用量记录仓库 — token 统计埋点 + 聚合查询
 * 记录每次模型调用的输入/输出 token、耗时与成败，供运维仪表盘展示。
 * 埋点采用 fire-and-forget：记录失败绝不影响 AI 处理主流程。
 */
import { randomUUID } from 'node:crypto'
import { desc, gte, sql } from 'drizzle-orm'
import { aiUsageLogs } from '../schema'
import { getDb } from './connection'

export interface AIUsageEntry {
  operation: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  status: 'success' | 'failure'
  attempts: number
}

/** 记录一次 AI 调用（fire-and-forget，内部吞掉所有错误） */
export async function logAIUsage(entry: AIUsageEntry): Promise<void> {
  try {
    const db = getDb()
    await db.insert(aiUsageLogs).values({
      id: randomUUID(),
      operation: entry.operation,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      durationMs: entry.durationMs,
      status: entry.status,
      attempts: entry.attempts,
    })
  } catch (err) {
    // 埋点失败不阻断主流程，仅告警日志
    console.warn('[ai-usage] 记录失败:', err)
  }
}

export interface AIUsageStats {
  /** 今日 */
  todayCalls: number
  todayInputTokens: number
  todayOutputTokens: number
  todayFailures: number
  /** 累计 */
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalFailures: number
  /** 按操作分布（近 7 天） */
  byOperation: Array<{
    operation: string
    calls: number
    inputTokens: number
    outputTokens: number
    failures: number
    successRate: number
  }>
  /** 近 7 天每日趋势 */
  daily: Array<{
    date: string
    calls: number
    inputTokens: number
    outputTokens: number
    failures: number
  }>
}

/** 聚合 AI 用量统计（近 N 天趋势 + 今日 + 累计） */
export async function getAIUsageStats(days = 7): Promise<AIUsageStats> {
  const db = getDb()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const since = new Date(startOfToday)
  since.setDate(since.getDate() - (days - 1))

  const [total, today, byOp, daily] = await Promise.all([
    db
      .select({
        calls: sql<number>`count(*)::int`,
        input: sql<number>`coalesce(sum(input_tokens),0)::int`,
        output: sql<number>`coalesce(sum(output_tokens),0)::int`,
        failures: sql<number>`count(*) filter (where status = 'failure')::int`,
      })
      .from(aiUsageLogs),
    db
      .select({
        calls: sql<number>`count(*)::int`,
        input: sql<number>`coalesce(sum(input_tokens),0)::int`,
        output: sql<number>`coalesce(sum(output_tokens),0)::int`,
        failures: sql<number>`count(*) filter (where status = 'failure')::int`,
      })
      .from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, startOfToday)),
    db
      .select({
        operation: aiUsageLogs.operation,
        calls: sql<number>`count(*)::int`,
        input: sql<number>`coalesce(sum(input_tokens),0)::int`,
        output: sql<number>`coalesce(sum(output_tokens),0)::int`,
        failures: sql<number>`count(*) filter (where status = 'failure')::int`,
      })
      .from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, since))
      .groupBy(aiUsageLogs.operation)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        date: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
        calls: sql<number>`count(*)::int`,
        input: sql<number>`coalesce(sum(input_tokens),0)::int`,
        output: sql<number>`coalesce(sum(output_tokens),0)::int`,
        failures: sql<number>`count(*) filter (where status = 'failure')::int`,
      })
      .from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, since))
      .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM-DD')`),
  ])

  const pick = (r: { calls: number; input: number; output: number; failures: number }) => ({
    calls: r.calls ?? 0,
    inputTokens: r.input ?? 0,
    outputTokens: r.output ?? 0,
    failures: r.failures ?? 0,
  })
  const totalRow = pick(total[0] ?? { calls: 0, input: 0, output: 0, failures: 0 })
  const todayRow = pick(today[0] ?? { calls: 0, input: 0, output: 0, failures: 0 })

  return {
    todayCalls: todayRow.calls,
    todayInputTokens: todayRow.inputTokens,
    todayOutputTokens: todayRow.outputTokens,
    todayFailures: todayRow.failures,
    totalCalls: totalRow.calls,
    totalInputTokens: totalRow.inputTokens,
    totalOutputTokens: totalRow.outputTokens,
    totalFailures: totalRow.failures,
    byOperation: byOp.map((r) => ({
      operation: r.operation,
      calls: r.calls ?? 0,
      inputTokens: r.input ?? 0,
      outputTokens: r.output ?? 0,
      failures: r.failures ?? 0,
      successRate: r.calls ? Math.round(((r.calls - (r.failures ?? 0)) / r.calls) * 100) : 100,
    })),
    daily: daily.map((r) => ({
      date: String(r.date),
      calls: r.calls ?? 0,
      inputTokens: r.input ?? 0,
      outputTokens: r.output ?? 0,
      failures: r.failures ?? 0,
    })),
  }
}
