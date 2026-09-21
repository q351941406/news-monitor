import { describe, it, expect, beforeEach } from 'vitest'
import { SlidingWindowRateLimiter, DEFAULT_RATE_LIMIT } from '../rate-limit'

/**
 * 限流器测试
 *
 * 时间全部显式注入，不依赖真实时钟 —— 否则测试只能靠 sleep，
 * 既慢又容易在高负载 CI 上 flaky。
 */
describe('SlidingWindowRateLimiter', () => {
  const OPTS = { maxFailures: 3, windowMs: 1000, blockMs: 5000, maxTrackedKeys: 100 }
  let limiter: SlidingWindowRateLimiter
  const T0 = 1_000_000

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter(OPTS)
  })

  it('初始状态不封禁，剩满额机会', () => {
    const v = limiter.inspect('1.1.1.1', T0)
    expect(v.blocked).toBe(false)
    expect(v.remaining).toBe(3)
    expect(v.retryAfterSeconds).toBe(0)
  })

  it('失败次数未达阈值时仍放行，remaining 递减', () => {
    limiter.recordFailure('1.1.1.1', T0)
    expect(limiter.inspect('1.1.1.1', T0).remaining).toBe(2)
    limiter.recordFailure('1.1.1.1', T0)
    const v = limiter.inspect('1.1.1.1', T0)
    expect(v.blocked).toBe(false)
    expect(v.remaining).toBe(1)
  })

  it('达到 maxFailures 立即封禁，且返回剩余等待秒数', () => {
    for (let i = 0; i < 3; i += 1) limiter.recordFailure('1.1.1.1', T0)
    const v = limiter.inspect('1.1.1.1', T0)
    expect(v.blocked).toBe(true)
    expect(v.remaining).toBe(0)
    expect(v.retryAfterSeconds).toBe(5)
  })

  it('封禁期内即使时间推进也不解封（用 blockMs 而非 windowMs 判定）', () => {
    for (let i = 0; i < 3; i += 1) limiter.recordFailure('1.1.1.1', T0)
    // 推进 2 秒：窗口(1s)已过，但封禁(5s)未过 —— 必须仍然封禁
    const v = limiter.inspect('1.1.1.1', T0 + 2000)
    expect(v.blocked).toBe(true)
    expect(v.retryAfterSeconds).toBe(3)
  })

  it('封禁到期后自动恢复', () => {
    for (let i = 0; i < 3; i += 1) limiter.recordFailure('1.1.1.1', T0)
    const v = limiter.inspect('1.1.1.1', T0 + 5001)
    expect(v.blocked).toBe(false)
    expect(v.remaining).toBe(3)
  })

  it('滑动特性：整体滑出窗口后计数归零', () => {
    limiter.recordFailure('1.1.1.1', T0)
    limiter.recordFailure('1.1.1.1', T0)
    expect(limiter.inspect('1.1.1.1', T0).remaining).toBe(1)
    // 窗口(1000ms)整体滑过 → 两次失败都被遗忘
    expect(limiter.inspect('1.1.1.1', T0 + OPTS.windowMs + 1).remaining).toBe(3)
  })

  it('滑动特性：部分滑出时只保留窗口内的失败', () => {
    limiter.recordFailure('1.1.1.1', T0)
    limiter.recordFailure('1.1.1.1', T0 + 600)
    // 此刻两条都在窗口内
    expect(limiter.inspect('1.1.1.1', T0 + 600).remaining).toBe(1)
    // 推进到 T0+1100：T0 那条年龄 1100 ≥ 1000 已滑出；T0+600 那条年龄 500 仍在
    const v = limiter.inspect('1.1.1.1', T0 + 1100)
    expect(v.blocked).toBe(false)
    expect(v.remaining).toBe(2)
  })

  it('鉴权成功立即清零该 key 的失败记录', () => {
    limiter.recordFailure('1.1.1.1', T0)
    limiter.recordFailure('1.1.1.1', T0)
    limiter.recordSuccess('1.1.1.1')
    const v = limiter.inspect('1.1.1.1', T0)
    expect(v.blocked).toBe(false)
    expect(v.remaining).toBe(3)
  })

  it('不同 IP 之间互不影响（不能因 A 被封而误伤 B）', () => {
    for (let i = 0; i < 3; i += 1) limiter.recordFailure('1.1.1.1', T0)
    expect(limiter.inspect('1.1.1.1', T0).blocked).toBe(true)
    expect(limiter.inspect('2.2.2.2', T0).blocked).toBe(false)
  })

  it('inspect 是只读的：查询多次不应改变剩余次数', () => {
    limiter.recordFailure('1.1.1.1', T0)
    for (let i = 0; i < 10; i += 1) limiter.inspect('1.1.1.1', T0)
    expect(limiter.inspect('1.1.1.1', T0).remaining).toBe(2)
  })

  it('内存有界：海量不同 key 不会让 Map 无限增长', () => {
    const small = new SlidingWindowRateLimiter({ ...OPTS, maxTrackedKeys: 10 })
    for (let i = 0; i < 500; i += 1) small.recordFailure(`10.0.0.${i}`, T0)
    expect(small.size).toBeLessThanOrEqual(10)
  })

  it('窗口滑过的 key 会被清扫，不残留', () => {
    limiter.recordFailure('old', T0)
    expect(limiter.size).toBe(1)
    // 触发 sweep：时间推进到窗口之外
    limiter.recordFailure('new', T0 + OPTS.windowMs + 1)
    expect(limiter.size).toBe(1)
    expect(limiter.inspect('old', T0 + OPTS.windowMs + 1).remaining).toBe(3)
  })

  it('reset 清空全部状态', () => {
    for (let i = 0; i < 3; i += 1) limiter.recordFailure('1.1.1.1', T0)
    limiter.reset()
    expect(limiter.size).toBe(0)
    expect(limiter.inspect('1.1.1.1', T0).blocked).toBe(false)
  })

  it('默认参数：5 次失败 / 15 分钟窗口', () => {
    expect(DEFAULT_RATE_LIMIT.maxFailures).toBe(5)
    expect(DEFAULT_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000)
  })
})
