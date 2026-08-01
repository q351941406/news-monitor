import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry, defaultShouldRetry } from '../retry'

describe('defaultShouldRetry', () => {
  it('rejects AbortError (no retry)', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(defaultShouldRetry(err)).toBe(false)
  })

  it('retries on network codes', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']) {
      const err = Object.assign(new Error('boom'), { code })
      expect(defaultShouldRetry(err)).toBe(true)
    }
  })

  it('retries on retryable HTTP statuses (408, 429, 5xx)', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      const err = Object.assign(new Error('http'), { status })
      expect(defaultShouldRetry(err)).toBe(true)
    }
  })

  it('does not retry on other 4xx statuses', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const err = Object.assign(new Error('http'), { status })
      expect(defaultShouldRetry(err)).toBe(false)
    }
  })

  it('retries on generic Error (defaults to retry)', () => {
    expect(defaultShouldRetry(new Error('boom'))).toBe(true)
  })
})

describe('fetchWithRetry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(fetchWithRetry(fn, { backoffMs: 100 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries up to N times and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'ECONNRESET' }))
      .mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce('ok')

    const p = fetchWithRetry(fn, { retries: 3, backoffMs: 100, factor: 2 })
    // 推进 setTimeout 定时器
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws last error after exhausting retries', async () => {
    const err = Object.assign(new Error('down'), { code: 'ECONNRESET' })
    const fn = vi.fn().mockRejectedValue(err)

    const p = fetchWithRetry(fn, { retries: 2, backoffMs: 10 }).catch((e) => e)
    await vi.runAllTimersAsync()
    const result = await p
    expect(result).toBe(err)
    expect(fn).toHaveBeenCalledTimes(3) // 1 + 2 retries
  })

  it('does not retry when retryOn returns false', async () => {
    const err = new Error('boom')
    const fn = vi.fn().mockRejectedValue(err)
    const p = fetchWithRetry(fn, { retryOn: () => false }).catch((e) => e)
    const result = await p
    expect(result).toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses exponential backoff between retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce('ok')

    const onRetry = vi.fn()
    const p = fetchWithRetry(fn, {
      retries: 3,
      backoffMs: 100,
      factor: 2,
      maxBackoffMs: 10000,
      onRetry,
    })
    await vi.runAllTimersAsync()
    await p

    expect(onRetry).toHaveBeenCalledTimes(2)
    // 第一次退避 ~100ms, 第二次 ~200ms (含 30% 抖动，断言区间)
    const d1 = onRetry.mock.calls[0][2]
    const d2 = onRetry.mock.calls[1][2]
    expect(d1).toBeGreaterThanOrEqual(100)
    expect(d1).toBeLessThan(150)
    expect(d2).toBeGreaterThanOrEqual(200)
    expect(d2).toBeLessThan(280)
  })

  it('caps backoff at maxBackoffMs', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('net'), { code: 'ETIMEDOUT' }))
    const onRetry = vi.fn()
    const p = fetchWithRetry(fn, {
      retries: 5,
      backoffMs: 1000,
      factor: 10,
      maxBackoffMs: 5000,
      onRetry,
    })
    await vi.runAllTimersAsync()
    await p.catch(() => {})

    // base 1000*10^5=1000000 → cap 到 5000；30% jitter ⇒ 最大 ~6500
    // 只要不无限增长（即最大 delay 不超过 cap+30%）即可
    const delays = onRetry.mock.calls.map(([, , d]) => d)
    expect(delays.length).toBe(5)
    expect(Math.max(...delays)).toBeLessThanOrEqual(5000 * 1.31)
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(5000 * 0.7)
  })
})
