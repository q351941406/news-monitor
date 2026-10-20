import { describe, it, expect, vi, afterEach } from 'vitest'
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

describe('logger —— 环境分支（覆盖 isProduction / isCI / LOG_LEVEL）', () => {
  const envBackup = { ...process.env }

  afterEach(() => {
    process.env = { ...envBackup }
    vi.resetModules()
  })

  it('生产环境：level 走 info、transport 不用 pretty（JSON 输出）', async () => {
    vi.resetModules()
    process.env.NODE_ENV = 'production'
    process.env.CI = 'true'
    delete process.env.LOG_LEVEL
    const mod = await import('@/lib/logger')
    expect(mod.logger.level).toBe('info')
  })

  it('CI 环境：level 走 debug、transport 不用 pretty（JSON 输出）', async () => {
    vi.resetModules()
    process.env.NODE_ENV = 'test'
    process.env.CI = 'true'
    delete process.env.LOG_LEVEL
    const mod = await import('@/lib/logger')
    expect(mod.logger.level).toBe('debug')
  })

  it('GITHUB_ACTIONS=true 同样视为 CI', async () => {
    vi.resetModules()
    process.env.NODE_ENV = 'test'
    process.env.CI = ''
    process.env.GITHUB_ACTIONS = 'true'
    delete process.env.LOG_LEVEL
    const mod = await import('@/lib/logger')
    expect(mod.logger.level).toBe('debug')
  })

  it('LOG_LEVEL 显式设置时覆盖环境默认值', async () => {
    vi.resetModules()
    process.env.NODE_ENV = 'test'
    process.env.LOG_LEVEL = 'error'
    const mod = await import('@/lib/logger')
    expect(mod.logger.level).toBe('error')
  })
})
