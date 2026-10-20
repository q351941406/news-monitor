/**
 * 运行日志聚合的分支覆盖
 *
 * 核心价值：把「lastRun 从哪来」「成功率怎么算」的两条路都钉死 ——
 * 运维仪表盘靠这些数字判断管道是否健康，算错了会误导排查方向。
 */
import { describe, it, expect } from 'vitest'
import { aggregateSourceStats } from '@/lib/db/run-log-repo'
import type { RunLog } from '@/lib/schema'

const run = (over: Partial<RunLog> = {}): RunLog => ({
  id: 'r1',
  source: 'github',
  stage: 'scrape',
  status: 'success',
  itemsCount: 1,
  durationMs: 10,
  error: null,
  startedAt: new Date('2026-10-20T00:00:00Z'),
  ...over,
})

describe('aggregateSourceStats', () => {
  it('SQL 行里有 last_run_at 时优先用它', () => {
    const stats = aggregateSourceStats(
      [{ source: 'github', total_items: 10, last_run_at: '2026-10-20T01:00:00Z' }],
      [run()],
    )
    expect(stats[0].lastRun).toBe('2026-10-20T01:00:00Z')
    expect(stats[0].totalItems).toBe(10)
  })

  it('SQL 行没有 last_run_at 时回退到最近运行记录的时间', () => {
    const stats = aggregateSourceStats(
      [{ source: 'github', total_items: 0, last_run_at: null }],
      [run({ startedAt: new Date('2026-10-20T02:00:00Z') })],
    )
    // 回退值走 String(Date)，格式与 SQL 侧的时间字符串不同（既有行为）
    expect(stats[0].lastRun).toContain('2026')
    expect(stats[0].lastRun).toContain('02:00:00')
  })

  it('既没有 SQL 时间也没有运行记录时 lastRun 为 null', () => {
    const stats = aggregateSourceStats(
      [{ source: 'github', total_items: 0, last_run_at: null }],
      [],
    )
    expect(stats[0].lastRun).toBeNull()
    expect(stats[0].lastStatus).toBeNull()
    // 没有运行记录 → 成功率按 100% 计（无失败可言）
    expect(stats[0].successRate).toBe(100)
  })

  it('多行同源时 totalItems 累加、lastRun 取最新', () => {
    const stats = aggregateSourceStats(
      [
        { source: 'github', total_items: 3, last_run_at: '2026-10-19T00:00:00Z' },
        { source: 'github', total_items: 4, last_run_at: '2026-10-20T00:00:00Z' },
      ],
      [],
    )
    expect(stats).toHaveLength(1)
    expect(stats[0].totalItems).toBe(7)
    expect(stats[0].lastRun).toBe('2026-10-20T00:00:00Z')
  })

  it('成功率按成功数 / 总数计算', () => {
    const stats = aggregateSourceStats(
      [{ source: 'github', total_items: 0, last_run_at: null }],
      [run({ status: 'success' }), run({ id: 'r2', status: 'failure' })],
    )
    expect(stats[0].successRate).toBe(50)
    expect(stats[0].lastStatus).toBe('success')
  })
})
