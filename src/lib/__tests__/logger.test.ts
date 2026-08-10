import { describe, it, expect, vi } from 'vitest'
import { logger, withTiming, withFields } from '../logger'

describe('logger', () => {
  it('logger 基础方法可用', () => {
    expect(() => {
      logger.info({ test: 1 }, 'hello')
      logger.warn('warn msg')
      logger.debug({ x: 2 }, 'debug')
    }).not.toThrow()
  })

  it('child logger 带上下文', () => {
    const child = logger.child({ script: 'scrape' })
    expect(() => child.info('child log')).not.toThrow()
  })

  it('withFields 返回合并字段的子 logger', () => {
    const child = logger.child({ script: 'x' })
    const extended = withFields(child, { source: 'github' })
    expect(extended).toBeDefined()
    expect(() => extended.info('extended')).not.toThrow()
  })

  it('withTiming 成功时记录耗时并返回结果', async () => {
    const log = { info: vi.fn(), error: vi.fn() } as unknown as {
      info: typeof console.info
      error: typeof console.error
    }
    const result = await withTiming('op', async () => 'done', log)
    expect(result).toBe('done')
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'op' }),
      expect.stringContaining('completed'),
    )
  })

  it('withTiming 失败时记录错误并抛回', async () => {
    const log = { info: vi.fn(), error: vi.fn() } as unknown as {
      info: typeof console.info
      error: typeof console.error
    }
    await expect(
      withTiming(
        'op',
        async () => {
          throw new Error('boom')
        },
        log,
      ),
    ).rejects.toThrow('boom')
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'op' }),
      expect.stringContaining('failed'),
    )
  })
})
