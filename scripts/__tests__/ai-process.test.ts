import { describe, it, expect } from 'vitest'
import { shouldFailRun } from '../ai-process'

describe('shouldFailRun - AI 整体失败判定', () => {
  it('有待处理数据且 0 成功 → 应判定为失败（触发告警）', () => {
    expect(shouldFailRun(50, 0)).toBe(true)
    expect(shouldFailRun(1, 0)).toBe(true)
  })

  it('全部成功 → 不算失败', () => {
    expect(shouldFailRun(50, 50)).toBe(false)
  })

  it('部分失败但有成功 → 不算整体失败（失败条目下轮重试）', () => {
    expect(shouldFailRun(50, 1)).toBe(false)
    expect(shouldFailRun(50, 49)).toBe(false)
  })

  it('没有待处理数据 → 不算失败（空跑是正常的）', () => {
    expect(shouldFailRun(0, 0)).toBe(false)
  })

  it('回归防线：AI 全线故障不得再被当成成功退出', () => {
    // 线上曾因 AI 失败仍以 success 退出，导致故障静默近 20 天。
    // 此断言确保该场景永远返回 true（=> 脚本抛错 => workflow 失败 => Sentry 告警）。
    const pendingItems = 50
    const successCount = 0
    expect(shouldFailRun(pendingItems, successCount)).toBe(true)
  })
})
