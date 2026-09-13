import { logger } from '@/lib/logger'
/**
 * AI 批处理脚本 - 处理未分析的内容
 * 用法: npx tsx scripts/ai-process.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, isNull, and } from 'drizzle-orm'
import { rawItems, aiAnalysis } from '../src/lib/schema'
import { createAIService } from '../src/lib/ai-service'
import { withRunLog } from '@/lib/run-logger'
const log = logger.child({ script: 'ai-process' })
// 数据库连接
function getDb() {
  const sqlClient = neon(process.env.DATABASE_URL!)
  return drizzle(sqlClient)
}
// 获取未处理的数据
async function getUnprocessedItems(source: string, limit: number = 50) {
  const db = getDb()
  const results = await db
    .select({
      id: rawItems.id,
      title: rawItems.title,
      rawData: rawItems.rawData,
    })
    .from(rawItems)
    .leftJoin(aiAnalysis, eq(rawItems.id, aiAnalysis.itemId))
    .where(and(eq(rawItems.source, source), isNull(aiAnalysis.itemId)))
    .limit(limit)
  return results
}
/**
 * 判定「AI 侧整体不可用」：有数据待处理，却一条都没成功。
 *
 * 失败条目会保留未分析状态、下轮重试（这是刻意的，避免整批被"假消费"），
 * 但若因此让脚本照常以 success 退出，AI 侧长期故障就会完全静默 ——
 * 线上曾发生 AI 全线失败近 20 天而 workflow 一直显示绿色的情况。
 * 故此处返回 true 时应抛错，让 run 失败并触发 Sentry 告警。
 */
export function shouldFailRun(total: number, successCount: number): boolean {
  return total > 0 && successCount === 0
}

// 批处理函数
async function processBatch(source: string) {
  console.log(`\n[${new Date().toISOString()}] Processing ${source}...`)
  // 1. 查询未处理数据
  const allItems = await getUnprocessedItems(source, 50)
  console.log(`  Found ${allItems.length} unprocessed items`)
  if (allItems.length === 0) {
    console.log('  No items to process')
    // 仍然记录日志（0 条也是正常执行）
    await withRunLog({ source, stage: 'ai-process' }, async () => ({ itemsCount: 0 }))
    return
  }
  const aiService = createAIService()
  const db = getDb()
  // GitHub：逐条模式。每条一个 prompt（rawData 含完整 readme），AI 返回即落盘，
  // 一条失败不影响其他条；已成功落盘的条目不重复处理（onConflict 幂等）。
  if (source === 'github') {
    let successCount = 0
    let failCount = 0
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i]
      console.log(`  [${i + 1}/${allItems.length}] ${item.id} ...`)
      const result = await aiService.generateSingleSummary(item)
      if (!result) {
        failCount++
        console.log(`    ❌ AI failed for ${item.id}`)
        continue
      }
      try {
        // 逐条模式 item.id 即 raw_items 主键；AI 返回的 id 不可信（可能丢前缀），落盘用 item.id
        await db
          .insert(aiAnalysis)
          .values({
            itemId: item.id,
            summary: result.summary,
            details: result.details,
          })
          .onConflictDoUpdate({
            target: aiAnalysis.itemId,
            set: {
              summary: result.summary,
              details: result.details,
              processedAt: new Date(),
            },
          })
        successCount++
        console.log(`    ✅ Stored ${item.id}`)
      } catch (error) {
        failCount++
        log.error({ err: error }, `  ❌ Failed to store result for ${result.id}:`)
      }
    }
    console.log(`  ✅ Stored ${successCount} results (${failCount} failed)`)
    // 全部失败 = AI 侧不可用，必须让 run 失败以便告警（失败条目保持未分析，下轮重试）
    if (shouldFailRun(allItems.length, successCount)) {
      throw new Error(
        `AI 单条摘要全部失败：${failCount}/${allItems.length} 条失败、0 条成功（保留未分析状态待下轮重试）`,
      )
    }
    await withRunLog({ source, stage: 'ai-process' }, async () => ({ itemsCount: successCount }))
    return
  }
  // 其他 source：批量模式（内部分批、重试）
  const results = await aiService.generateBatchSummary(allItems)
  if (!results || results.length === 0) {
    console.log('  ❌ No results generated')
    // 有待处理数据却 0 产出 = AI 侧不可用，必须让 run 失败以便告警
    if (shouldFailRun(allItems.length, 0)) {
      throw new Error(`AI 批量摘要未产出任何结果（待处理 ${allItems.length} 条）`)
    }
    await withRunLog({ source, stage: 'ai-process' }, async () => ({ itemsCount: 0 }))
    return
  }
  console.log(`  AI returned ${results.length} results`)
  let successCount = 0
  for (const result of results) {
    try {
      await db
        .insert(aiAnalysis)
        .values({
          itemId: result.id,
          summary: result.summary,
          details: result.details,
        })
        .onConflictDoUpdate({
          target: aiAnalysis.itemId,
          set: {
            summary: result.summary,
            details: result.details,
            processedAt: new Date(),
          },
        })
      successCount++
    } catch (error) {
      log.error({ err: error }, `  ❌ Failed to store result for ${result.id}:`)
    }
  }
  console.log(`  ✅ Stored ${successCount}/${results.length} results`)
  // 记录运行日志
  await withRunLog({ source, stage: 'ai-process' }, async () => ({ itemsCount: successCount }))
}
// 主函数
async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => a.startsWith('--source='))
  const source = sourceArg?.split('=')[1]
  if (!source) {
    log.error('Usage: npx tsx scripts/ai-process.ts --source=<slug>')
    log.error('Available sources: github, producthunt, twitter')
    process.exit(1)
  }
  if (!process.env.AI_API_KEY) {
    log.error('❌ AI_API_KEY not configured')
    process.exit(1)
  }
  await processBatch(source)
}
// 仅当作为 CLI 直接执行时才运行 main（被测试 import 时跳过）
// require.main === module：tsx 运行脚本时成立，vitest import 时失败
if (require.main === module) {
  main().catch((error) => {
    log.error({ err: error }, '❌ Fatal error')
    process.exit(1)
  })
}
