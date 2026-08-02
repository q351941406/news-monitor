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
  // 2. 调用 AIService（内部处理分批、重试）
  const aiService = createAIService()
  const results = await aiService.generateBatchSummary(allItems)
  if (!results || results.length === 0) {
    console.log('  ❌ No results generated')
    await withRunLog({ source, stage: 'ai-process' }, async () => ({ itemsCount: 0 }))
    return
  }
  console.log(`  AI returned ${results.length} results`)
  // 3. 批量存储
  const db = getDb()
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
  if (!process.env.ANTHROPIC_API_KEY) {
    log.error('❌ ANTHROPIC_API_KEY not configured')
    process.exit(1)
  }
  await processBatch(source)
}
main().catch((error) => {
  log.error({ err: error }, '❌ Fatal error')
  process.exit(1)
})
