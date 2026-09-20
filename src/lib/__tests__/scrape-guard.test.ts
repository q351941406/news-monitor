/**
 * 抓取空结果防线测试
 *
 * 核心价值：用真实事故数据固化「源返回 0 条 = 故障」这条判据，
 * 避免将来有人把它改回「0 条也算成功」——那正是 47/57 天静默断流的根因。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { shouldFailOnEmptyFetch, assertNonEmptyFetch } from '@/lib/scrape-guard'

describe('shouldFailOnEmptyFetch', () => {
  it('0 条 → 判定失败', () => {
    expect(shouldFailOnEmptyFetch(0)).toBe(true)
  })

  it('>0 条 → 不算失败', () => {
    expect(shouldFailOnEmptyFetch(1)).toBe(false)
    expect(shouldFailOnEmptyFetch(19)).toBe(false)
  })

  it('回归防线：X 源连续 10 天 Fetched 0 的场景必须全部判失败', () => {
    // 真实数据：2026-09-09 ~ 09-18 连续 10 次运行 Fetched 0 items，
    // 而 workflow 全绿。修复凭据注入后恢复 19~20 条。
    const outageSamples = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const healthySamples = [19, 20, 19, 20]
    expect(outageSamples.every(shouldFailOnEmptyFetch)).toBe(true)
    expect(healthySamples.some(shouldFailOnEmptyFetch)).toBe(false)
  })
})

describe('assertNonEmptyFetch', () => {
  const ENV = 'SKIP_SOURCE_TWITTER'
  afterEach(() => {
    delete process.env[ENV]
  })

  it('非空时静默通过', () => {
    expect(() => assertNonEmptyFetch('twitter', 'X / Twitter', 20)).not.toThrow()
  })

  it('为空时抛错，错误信息给出基线与处置方式', () => {
    let msg = ''
    try {
      assertNonEmptyFetch('twitter', 'X / Twitter', 0)
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toContain('0 条')
    expect(msg).toContain('X / Twitter')
    expect(msg).toContain('SKIP_SOURCE_TWITTER')
  })

  it('显式停用的源允许为空（停用是有意识的决定，不算故障）', () => {
    process.env[ENV] = '1'
    expect(() => assertNonEmptyFetch('twitter', 'X / Twitter', 0)).not.toThrow()
  })
})
