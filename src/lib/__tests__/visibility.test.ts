/**
 * 可展示性告警测试
 *
 * 核心价值：用真实事故数据固化「有数字、没内容」这条判据，
 * 确保未来不会有人把它改回「只看数据新鲜度」——
 * 那正是 2026-10 事故里巡检永远绿、问题长达数周没人发现的原因。
 */
import { describe, it, expect } from 'vitest'
import { detectVisibilityIssues, DEFAULT_STUCK_HOURS } from '@/lib/visibility'

const HOUR = 60 * 60 * 1000

describe('detectVisibilityIssues', () => {
  const NOW = Date.UTC(2026, 9, 20, 0, 0, 0)

  it('捕获真实事故场景：GitHub 有 8 条未读却一个主题组都没有', () => {
    // 线上实测（2026-10-20）：github topic_groups = 0，raw_items 未读 = 8
    const alerts = detectVisibilityIssues(
      [
        {
          source: 'github',
          unread: 8,
          groupCount: 0,
          ungroupedCount: 8,
          oldestUngroupedAt: NOW - 40 * HOUR,
        },
      ],
      NOW,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('no_groups')
    expect(alerts[0].source).toBe('github')
    expect(alerts[0].message).toContain('8')
    expect(alerts[0].message).toContain('主题组')
  })

  it('捕获真实事故场景：未读内容卡在未归组超过阈值', () => {
    const alerts = detectVisibilityIssues(
      [
        {
          source: 'producthunt',
          unread: 851,
          groupCount: 325,
          ungroupedCount: 44,
          oldestUngroupedAt: NOW - 30 * HOUR,
        },
      ],
      NOW,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('stuck_ungrouped')
    expect(alerts[0].count).toBe(44)
    expect(alerts[0].stuckHours).toBe(30)
  })

  it('健康源不告警：有主题组、未归组内容都是刚抓到的（在途）', () => {
    const alerts = detectVisibilityIssues(
      [
        {
          source: 'github',
          unread: 8,
          groupCount: 3,
          ungroupedCount: 8,
          // 刚抓到 1 小时 —— 富化/聚类还没轮到，属正常在途
          oldestUngroupedAt: NOW - 1 * HOUR,
        },
      ],
      NOW,
    )
    expect(alerts).toHaveLength(0)
  })

  it('没有未读内容的源不告警（空源不算故障）', () => {
    const alerts = detectVisibilityIssues(
      [{ source: 'twitter', unread: 0, groupCount: 0, ungroupedCount: 0, oldestUngroupedAt: null }],
      NOW,
    )
    expect(alerts).toHaveLength(0)
  })

  it('阈值可配置：默认 24 小时', () => {
    expect(DEFAULT_STUCK_HOURS).toBe(24)
    const input = {
      source: 'github',
      unread: 8,
      groupCount: 2,
      ungroupedCount: 8,
      oldestUngroupedAt: NOW - 2 * HOUR,
    }
    // 2 小时：按默认 24h 阈值不告警
    expect(detectVisibilityIssues([input], NOW)).toHaveLength(0)
    // 放宽到 1 小时即告警
    expect(detectVisibilityIssues([input], NOW, 1)).toHaveLength(1)
  })
})
