import { describe, it, expect } from 'vitest'
import { aggregateDailyStats, aggregateSourceStats } from '../db/run-log-repo'

describe('aggregateDailyStats', () => {
  it('按日期+来源聚合，合并 stage 维度', () => {
    const rows = [
      {
        date: '2026-08-03',
        source: 'github',
        stage: 'scrape',
        total_runs: '1',
        success_count: '1',
        total_items: '10',
      },
      {
        date: '2026-08-03',
        source: 'github',
        stage: 'ai-process',
        total_runs: '1',
        success_count: '1',
        total_items: '10',
      },
      {
        date: '2026-08-03',
        source: 'github',
        stage: 'topic-aggregate',
        total_runs: '1',
        success_count: '0',
        total_items: '0',
      },
      {
        date: '2026-08-03',
        source: 'twitter',
        stage: 'scrape',
        total_runs: '1',
        success_count: '1',
        total_items: '5',
      },
    ]
    const result = aggregateDailyStats(rows)
    expect(result).toHaveLength(2)
    const github = result.find((r) => r.source === 'github')!
    expect(github.totalRuns).toBe(3)
    expect(github.successes).toBe(2)
    expect(github.failures).toBe(1)
    expect(github.totalItems).toBe(20)
    const twitter = result.find((r) => r.source === 'twitter')!
    expect(twitter.totalRuns).toBe(1)
    expect(twitter.successes).toBe(1)
    expect(twitter.failures).toBe(0)
  })

  it('空数据返回空数组', () => {
    expect(aggregateDailyStats([])).toEqual([])
  })
})

describe('aggregateSourceStats', () => {
  const rows = [
    { source: 'github', total_items: '25', last_run_at: '2026-08-03T10:00:00Z' },
    { source: 'producthunt', total_items: '31', last_run_at: '2026-08-03T09:00:00Z' },
  ]
  const runs = [
    { source: 'github', status: 'success', startedAt: new Date('2026-08-03T10:00:00Z') },
    { source: 'github', status: 'success', startedAt: new Date('2026-08-03T09:00:00Z') },
    { source: 'github', status: 'failure', startedAt: new Date('2026-08-03T08:00:00Z') },
  ]

  it('计算 successRate 与 lastStatus', () => {
    const result = aggregateSourceStats(rows, runs)
    const github = result.find((r) => r.source === 'github')!
    expect(github.totalItems).toBe(25)
    expect(github.successRate).toBe(67)
    expect(github.lastStatus).toBe('success')
    expect(github.lastRun).toBe('2026-08-03T10:00:00Z')
  })

  it('无运行记录时 successRate 默认 100', () => {
    const result = aggregateSourceStats(rows, [])
    const ph = result.find((r) => r.source === 'producthunt')!
    expect(ph.successRate).toBe(100)
    expect(ph.lastStatus).toBeNull()
  })

  it('空数据返回空数组', () => {
    expect(aggregateSourceStats([], [])).toEqual([])
  })
})
