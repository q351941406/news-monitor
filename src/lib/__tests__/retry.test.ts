import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry, defaultShouldRetry, execSyncWithRetry } from '../retry'

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
    const netErr = Object.assign(new Error('net'), { code: 'ETIMEDOUT' })
    const fn = vi
      .fn()
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
    const onRetry = vi.fn()
    const p = fetchWithRetry(fn, {
      retries: 5,
      backoffMs: 1000,
      factor: 10,
      maxBackoffMs: 5000,
      onRetry,
    })
    const settled = p.catch(() => {})
    await vi.runAllTimersAsync()
    await settled

    // base 1000*10^5=1000000 → cap 到 5000；30% jitter ⇒ 最大 ~6500
    // 只要不无限增长（即最大 delay 不超过 cap+30%）即可
    const delays = onRetry.mock.calls.map(([, , d]) => d)
    expect(delays.length).toBe(5)
    expect(Math.max(...delays)).toBeLessThanOrEqual(5000 * 1.31)
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(5000 * 0.7)
  })
})

describe('retry - 边界分支', () => {
  it('AbortError 不重试直接抛', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    await expect(fetchWithRetry(fn, { retries: 3 })).rejects.toThrow('aborted')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('网络错误码（ECONNRESET）触发重试', async () => {
    const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok')
    const result = await fetchWithRetry(fn, { retries: 2, backoffMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('可重试 HTTP 状态（500）触发重试', async () => {
    const err = Object.assign(new Error('server error'), { status: 500 })
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('recovered')
    const result = await fetchWithRetry(fn, { retries: 2, backoffMs: 1 })
    expect(result).toBe('recovered')
  })

  it('不可重试 HTTP 状态（404）直接抛出不重试', async () => {
    const err = Object.assign(new Error('not found'), { status: 404 })
    const fn = vi.fn().mockRejectedValue(err)
    await expect(fetchWithRetry(fn, { retries: 3 })).rejects.toThrow('not found')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('自定义 retryOn 覆盖默认策略', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('custom fail')).mockResolvedValueOnce('ok')
    const result = await fetchWithRetry(fn, {
      retries: 1,
      backoffMs: 1,
      retryOn: (e) => (e as Error).message === 'custom fail',
    })
    expect(result).toBe('ok')
  })

  it('onRetry 钩子被调用并收到退避时长', async () => {
    const onRetry = vi.fn()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce('ok')
    await fetchWithRetry(fn, { retries: 2, backoffMs: 5, onRetry })
    expect(onRetry).toHaveBeenCalledTimes(2)
    const [attempt, , delayMs] = onRetry.mock.calls[0]
    expect(attempt).toBe(1)
    expect(delayMs).toBeGreaterThanOrEqual(5)
  })
})

describe('execSyncWithRetry', () => {
  it('默认参数下首次成功即返回', () => {
    const fn = vi.fn().mockReturnValue('ok')
    expect(execSyncWithRetry(fn)).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('失败后重试并成功（覆盖 shouldRetry 继续分支）', () => {
    const fn = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('first fail')
      })
      .mockReturnValueOnce('ok')
    expect(execSyncWithRetry(fn, { retries: 3, baseDelayMs: 0, jitterRatio: 0 })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('耗尽所有重试后抛出最后一次错误（覆盖最后一次 break 分支）', () => {
    const err = new Error('always fail')
    const fn = vi.fn().mockImplementation(() => {
      throw err
    })
    expect(() => execSyncWithRetry(fn, { retries: 2, baseDelayMs: 0, jitterRatio: 0 })).toThrow(
      'always fail',
    )
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('shouldRetry 返回 false 时立即停止（覆盖提前 break 分支）', () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('stop now')
    })
    expect(() =>
      execSyncWithRetry(fn, {
        retries: 5,
        baseDelayMs: 0,
        jitterRatio: 0,
        shouldRetry: () => false,
      }),
    ).toThrow('stop now')
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('onRetry 钩子收到 attempt/error/delay', () => {
    const onRetry = vi.fn()
    const fn = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('boom')
      })
      .mockReturnValueOnce('ok')
    expect(execSyncWithRetry(fn, { retries: 3, baseDelayMs: 100, jitterRatio: 0, onRetry })).toBe(
      'ok',
    )
    expect(onRetry).toHaveBeenCalledTimes(1)
    const [attempt, err, delay] = onRetry.mock.calls[0]
    expect(attempt).toBe(1)
    expect((err as Error).message).toBe('boom')
    expect(delay).toBeGreaterThanOrEqual(100)
  })
  it('重试延迟被 maxBackoffMs 封顶', () => {
    const onRetry = vi.fn()
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('x')
    })
    expect(() =>
      execSyncWithRetry(fn, {
        retries: 4,
        baseDelayMs: 1000,
        maxBackoffMs: 1500,
        jitterRatio: 0,
        onRetry,
      }),
    ).toThrow()
    // 第一次 delay=1000, 第二次 min(1500, 1000*2)=1500（封顶），第三次 min(1500, 4000)=1500
    const delays = onRetry.mock.calls.map(([, , d]) => d as number)
    expect(delays).toEqual([1000, 1500, 1500])
  })
})
