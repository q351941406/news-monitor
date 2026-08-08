/**
 * 运行日志工具 - 供 scrape/ai-process/topic-aggregate 脚本使用
 * 自动记录执行耗时、处理条数和错误信息
 */
import { logRun } from './db'

export interface RunContext {
  source: string
  stage: 'scrape' | 'ai-process' | 'topic-aggregate' | 'topic-reaggregate'
}

/**
 * 包装一个异步函数，自动记录执行日志
 *
 * 用法:
 *   const result = await withRunLog({ source: 'github', stage: 'scrape' }, async () => {
 *     const items = await source.fetch()
 *     const stored = await storeRawItems(items)
 *     return { itemsCount: stored }
 *   })
 */
export async function withRunLog<T extends { itemsCount?: number }>(
  ctx: RunContext,
  fn: () => Promise<T>,
): Promise<T> {
  const startTime = Date.now()
  try {
    const result = await fn()
    const durationMs = Date.now() - startTime
    await logRun({
      source: ctx.source,
      stage: ctx.stage,
      status: 'success',
      itemsCount: result.itemsCount ?? 0,
      durationMs,
    })
    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    await logRun({
      source: ctx.source,
      stage: ctx.stage,
      status: 'failure',
      itemsCount: 0,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
