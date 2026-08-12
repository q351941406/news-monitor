import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestDb, createTestTables, dropTestSchema } from './db-test-helper'
import {
  logRun,
  getRecentRuns,
  getDailyStats,
  getSourceStats,
  aggregateSourceStats,
  getMetrics,
} from '../run-log-repo'
import { runLogs } from '../../schema'

describe('RunLogRepo', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('记录成功运行日志', async () => {
    await logRun({
      source: 'github',
      stage: 'scrape',
      status: 'success',
      itemsCount: 12,
      durationMs: 345,
    })
    const runs = await getRecentRuns(5)
    const mine = runs.find((r) => r.source === 'github' && r.stage === 'scrape')
    expect(mine).toBeDefined()
    expect(mine!.status).toBe('success')
    expect(mine!.itemsCount).toBe(12)
    expect(mine!.durationMs).toBe(345)
    expect(mine!.error).toBeNull()
  })

  it('记录失败运行日志（含错误信息）', async () => {
    await logRun({
      source: 'twitter',
      stage: 'ai-process',
      status: 'failure',
      error: 'boom: rate limit',
    })
    const runs = await getRecentRuns(10)
    const mine = runs.find((r) => r.source === 'twitter')
    expect(mine).toBeDefined()
    expect(mine!.status).toBe('failure')
    expect(mine!.error).toContain('boom')
    expect(mine!.itemsCount).toBe(0)
  })

  it('getRecentRuns 返回最近 limit 条', async () => {
    for (let i = 0; i < 5; i++) {
      await logRun({ source: 'github', stage: 'scrape', status: 'success', itemsCount: i })
    }
    const runs = await getRecentRuns(3)
    expect(runs.length).toBeLessThanOrEqual(3)
    expect(runs[0].startedAt >= runs[runs.length - 1].startedAt).toBe(true)
  })

  it('getDailyStats 返回按天聚合统计', async () => {
    await logRun({ source: 'github', stage: 'scrape', status: 'success', itemsCount: 7 })
    const stats = await getDailyStats(7)
    expect(stats.length).toBeGreaterThanOrEqual(1)
    const row = stats.find(
      (s: { source: string; stage: string }) => s.source === 'github' && s.stage === 'scrape',
    )
    expect(row).toBeDefined()
    expect(Number(row!.total_runs)).toBeGreaterThanOrEqual(1)
    expect(Number(row!.total_items)).toBeGreaterThanOrEqual(7)
  })

  it('getSourceStats 返回各源汇总', async () => {
    await logRun({ source: 'producthunt', stage: 'scrape', status: 'success', itemsCount: 3 })
    const stats = await getSourceStats()
    const row = stats.find(
      (s: { source: string; stage: string }) => s.source === 'producthunt' && s.stage === 'scrape',
    )
    expect(row).toBeDefined()
    expect(Number(row!.success_count)).toBeGreaterThanOrEqual(1)
    expect(row!.last_run_at).toBeTruthy()
  })

  it('直接删除 run_logs 表可清理（表结构存在）', async () => {
    const db = getTestDb()
    const rows = await db.select().from(runLogs).limit(1)
    expect(Array.isArray(rows)).toBe(true)
  })
})

describe('run-log-repo - 分支补测', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })
  it('aggregateSourceStats: last_run_at 比较取最新 + 无 recentRuns 时 successRate 100', () => {
    const rows = [
      { source: 'github', total_items: '10', last_run_at: '2026-08-01T00:00:00Z' },
      { source: 'github', total_items: '5', last_run_at: '2026-08-05T00:00:00Z' },
    ]
    const out = aggregateSourceStats(rows as never, [])
    const g = out.find((s) => s.source === 'github')!
    expect(g.totalItems).toBe(15)
    expect(g.lastRun).toBe('2026-08-05T00:00:00Z')
    expect(g.successRate).toBe(100)
    expect(g.lastStatus).toBeNull()
  })

  it('aggregateSourceStats: last_run_at 为 null 时用 recentRuns 补位 + successRate 计算', () => {
    const rows = [
      { source: 'twitter', total_items: '3', last_run_at: null },
      { source: 'twitter', total_items: '7', last_run_at: null },
    ]
    const runs = [
      { source: 'twitter', status: 'success', startedAt: new Date('2026-08-06') },
      { source: 'twitter', status: 'failure', startedAt: new Date('2026-08-06') },
    ] as never
    const out = aggregateSourceStats(rows as never, runs)
    const t = out.find((s) => s.source === 'twitter')!
    expect(t.totalItems).toBe(10)
    expect(t.lastRun).toMatch(/Aug 06 2026/)
    expect(t.lastStatus).toBe('success')
    expect(t.successRate).toBe(50)
  })

  it('getMetrics: 连续 3 次 0 条触发 silent_failure 告警', async () => {
    // 插入 3 次成功但 0 条的同源同阶段日志
    for (let i = 0; i < 3; i++) {
      await logRun({ source: 'github', stage: 'scrape', status: 'success', itemsCount: 0 })
    }
    const metrics = await getMetrics()
    const alert = metrics.alerts.find((a) => a.source === 'github')
    expect(alert).toBeDefined()
    expect(alert!.message).toContain('连续 3 次抓取 0 条数据')
  })

  it('getMetrics: 非连续 0 条不告警', async () => {
    await logRun({ source: 'producthunt', stage: 'scrape', status: 'success', itemsCount: 0 })
    await logRun({ source: 'producthunt', stage: 'scrape', status: 'success', itemsCount: 5 })
    await logRun({ source: 'producthunt', stage: 'scrape', status: 'success', itemsCount: 0 })
    const metrics = await getMetrics()
    expect(metrics.alerts.find((a) => a.source === 'producthunt')).toBeUndefined()
  })

  it('logRun: 缺省字段使用默认值', async () => {
    await logRun({ source: 'github', stage: 'scrape', status: 'success' })
    const runs = await getRecentRuns(5)
    const mine = runs.find((r) => r.status === 'success' && r.error === null)
    expect(mine).toBeDefined()
    expect(mine!.itemsCount).toBe(0)
    expect(mine!.durationMs).toBe(0)
  })
})
