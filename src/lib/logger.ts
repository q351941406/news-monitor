/**
 * 结构化日志（pino）
 *
 * 设计目标:
 * - 生产环境: JSON 输出，便于日志聚合（Vercel Logs / Axiom / Loki）
 * - 本地开发: pretty 输出，便于人眼阅读
 * - 通过 `logger.child({ script: 'xxx' })` 创建带上下文的子 logger
 *
 * 用法:
 *   import { logger } from '@/lib/logger'
 *   const log = logger.child({ script: 'scrape' })
 *   log.info({ source: 'github' }, 'fetched 10 items')
 *   log.error({ err }, 'scrape failed')
 */
import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  // CI / 生产 → JSON；本地 → pretty
  transport:
    !isProduction && !isCI
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        }
      : undefined,
  // 基础字段
  base: {
    app: 'news-monitor',
    env: isProduction ? 'production' : 'development',
  },
  // 时间戳格式
  timestamp: pino.stdTimeFunctions.isoTime,
  // 错误堆栈追踪
  formatters: {
    level(label) {
      return { level: label }
    },
  },
})

/**
 * 性能计时包装器
 * 自动记录函数执行耗时
 */
export async function withTiming<T>(name: string, fn: () => Promise<T>, log = logger): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    log.info({ durationMs: Date.now() - start, op: name }, `${name} completed`)
    return result
  } catch (err) {
    log.error({ durationMs: Date.now() - start, op: name, err }, `${name} failed`)
    throw err
  }
}

/**
 * 给 logger 合并字段（不可变副本）
 */
export function withFields(base: ReturnType<typeof logger.child>, fields: Record<string, unknown>) {
  return base.child(fields)
}
