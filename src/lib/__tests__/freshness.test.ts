/**
 * 新鲜度告警测试
 *
 * 核心价值：用测试固化「为什么旧判据会漏掉 X」这个教训，
 * 确保未来不会有人又把判据改回次数维度。
 */
import { describe, it, expect } from 'vitest'
import { detectStaleSources, FRESHNESS_TOLERANCE_MS, DEFAULT_TOLERANCE_MS } from '@/lib/freshness'

const HOUR = 60 * 60 * 1000

describe('detectStaleSources', () => {
  const NOW = Date.UTC(2026, 8, 18, 18, 0, 0)

  it('捕获真实事故场景：X 断流 57 天必须告警', () => {
    // 真实数据：X 最后入库 2026-07-23T21:10:27Z，检查时 2026-09-18
    const lastX = Date.UTC(2026, 6, 23, 21, 10, 27)
    const alerts = detectStaleSources([{ source: 'twitter', lastIngestedAt: lastX }], NOW)

    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('stale_source')
    expect(alerts[0].source).toBe('twitter')
    // 58 天 ≈ 1391 小时
    expect(alerts[0].staleHours).toBeGreaterThan(1300)
  })

  it('捕获真实事故场景：PH 断流 47 天必须告警', () => {
    const lastPH = Date.UTC(2026, 7, 2, 19, 43, 9)
    const alerts = detectStaleSources([{ source: 'producthunt', lastIngestedAt: lastPH }], NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].source).toBe('producthunt')
  })

  it('健康源不告警', () => {
    const fresh = NOW - 1 * HOUR
    const alerts = detectStaleSources(
      [
        { source: 'twitter', lastIngestedAt: fresh },
        { source: 'producthunt', lastIngestedAt: fresh },
        { source: 'github', lastIngestedAt: fresh },
      ],
      NOW,
    )
    expect(alerts).toEqual([])
  })

  it('按源区分容忍窗口：PH(每天4次) 比 X(每天1次) 更敏感', () => {
    // 20 小时无数据：PH 应告警，X 不应
    const t = NOW - 20 * HOUR
    const phAlerts = detectStaleSources([{ source: 'producthunt', lastIngestedAt: t }], NOW)
    const xAlerts = detectStaleSources([{ source: 'twitter', lastIngestedAt: t }], NOW)

    expect(phAlerts, 'PH 每天 4 次，20 小时无数据应告警').toHaveLength(1)
    expect(xAlerts, 'X 每天 1 次，20 小时无数据属正常').toHaveLength(0)
  })

  it('从未成功抓取过的源必须告警', () => {
    const alerts = detectStaleSources([{ source: 'twitter', lastIngestedAt: null }], NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].message).toContain('从未成功')
  })

  it('未登记的源使用默认容忍窗口', () => {
    const alerts = detectStaleSources(
      [{ source: 'brandnew', lastIngestedAt: NOW - 72 * HOUR }],
      NOW,
    )
    expect(alerts).toHaveLength(1)
    expect(DEFAULT_TOLERANCE_MS).toBe(48 * HOUR)
  })

  it('边界：恰好在容忍窗口内不告警', () => {
    const justInside = NOW - (FRESHNESS_TOLERANCE_MS.twitter - 1000)
    expect(detectStaleSources([{ source: 'twitter', lastIngestedAt: justInside }], NOW)).toEqual([])
  })

  it('边界：刚超过容忍窗口即告警', () => {
    const justOutside = NOW - (FRESHNESS_TOLERANCE_MS.twitter + 1000)
    expect(
      detectStaleSources([{ source: 'twitter', lastIngestedAt: justOutside }], NOW),
    ).toHaveLength(1)
  })
})

describe('回归防护：证明时间维度判据优于次数维度', () => {
  it('X 每天 1 次 → 旧的 30 条全局窗口只覆盖约 1.7 天，凑不齐 3 条同源记录', () => {
    // 各源每天产生的 run_logs 条数（3 个 stage）
    const perDay = { producthunt: 4 * 3, twitter: 1 * 3, github: 1 * 3 }
    const totalPerDay = Object.values(perDay).reduce((a, b) => a + b, 0)
    const windowDays = 30 / totalPerDay

    expect(totalPerDay).toBe(18)
    expect(windowDays).toBeLessThan(2)

    // 窗口内 X:scrape 的记录数
    const xScrapeInWindow = Math.floor(windowDays * 1)
    expect(
      xScrapeInWindow,
      'X 在窗口内不足 3 条同源记录 → 旧的「连续 3 次」判据永不触发',
    ).toBeLessThan(3)
  })
})
