import { describe, it, expect } from 'vitest'
import {
  DEFAULT_READ_RETENTION_DAYS,
  MAX_READ_RETENTION_DAYS,
  DAY_MS,
  resolveRetentionDays,
  computeCutoff,
} from '../retention'

describe('保留期计算', () => {
  it('未配置 / 非法 / 非正数都回落默认 30 天', () => {
    expect(resolveRetentionDays(undefined)).toBe(DEFAULT_READ_RETENTION_DAYS)
    expect(resolveRetentionDays(null)).toBe(DEFAULT_READ_RETENTION_DAYS)
    expect(resolveRetentionDays('')).toBe(DEFAULT_READ_RETENTION_DAYS)
    expect(resolveRetentionDays('abc')).toBe(DEFAULT_READ_RETENTION_DAYS)
    expect(resolveRetentionDays('0')).toBe(DEFAULT_READ_RETENTION_DAYS)
    expect(resolveRetentionDays('-7')).toBe(DEFAULT_READ_RETENTION_DAYS)
  })

  it('支持字符串与数字，并取整', () => {
    expect(resolveRetentionDays('90')).toBe(90)
    expect(resolveRetentionDays(' 45 ')).toBe(45)
    expect(resolveRetentionDays(7.9)).toBe(7)
  })

  it('上限封顶，避免误配导致永不清理', () => {
    expect(resolveRetentionDays('999999')).toBe(MAX_READ_RETENTION_DAYS)
  })

  it('截止时间 = 当前时间 - N 天', () => {
    const now = 1_700_000_000_000
    expect(computeCutoff(now, 30)).toBe(now - 30 * DAY_MS)
    expect(computeCutoff(now, 0)).toBe(now)
  })
})
