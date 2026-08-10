import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestDb, createTestTables, dropTestSchema } from './db-test-helper'
import { logRun, getRecentRuns, getDailyStats, getSourceStats } from '../run-log-repo'
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
