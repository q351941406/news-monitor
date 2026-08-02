import { logger } from '@/lib/logger'
/**
 * 主题聚合脚本 - 将 AI 分析结果按主题分组
 * 用法: npx tsx scripts/topic-aggregate.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, and, desc } from 'drizzle-orm'
import { rawItems, aiAnalysis } from '../src/lib/schema'
import { storeTopicGroups } from '@/lib/db'
import { createAIService } from '@/lib/ai-service'
import { withRunLog } from '@/lib/run-logger'
const log = logger.child({ script: 'topic-aggregate' })

// 数据库连接（独立连接，与 ai-process.ts 保持一致）
function getDb() {
  const sqlClient = neon(process.env.DATABASE_URL!)
  return drizzle(sqlClient)
}

// 获取未读的 AI 摘要（带 summary + details）
async function getUnreadSummaries(source: string) {
  const db = getDb()
  const results = await db
    .select({
      id: rawItems.id,
      title: rawItems.title,
      summary: aiAnalysis.summary,
      details: aiAnalysis.details,
    })
    .from(rawItems)
    .leftJoin(aiAnalysis, eq(rawItems.id, aiAnalysis.itemId))
    .where(and(eq(rawItems.source, source), eq(rawItems.isRead, false)))
    .orderBy(desc(rawItems.fetchedAt))
    .limit(50)
  return results.filter((r) => r.summary)
}

// 聚合主题
async function aggregateTopics(source: string) {
  console.log(`\n[${new Date().toISOString()}] Aggregating topics for ${source}...`)
  const result = await withRunLog({ source, stage: 'topic-aggregate' }, async () => {
    // 1. 获取未读的 AI 分析结果
    const items = await getUnreadSummaries(source)
    console.log(`  Found ${items.length} unread items with summaries`)
    if (items.length === 0) {
      console.log('  No items to aggregate')
      return { itemsCount: 0 }
    }
    // 2. 调用 AI 进行主题聚合
    const aiService = createAIService()
    const groups = await aiService.generateTopicAggregation(items)
    if (!groups || groups.length === 0) {
      console.log('  ❌ No topics generated')
      return { itemsCount: 0 }
    }
    console.log(`  AI returned ${groups.length} topics`)
    // 3. 存储主题聚合
    await storeTopicGroups(source, groups)
    console.log(`  ✅ Stored ${groups.length} topic groups`)
    return { itemsCount: groups.length }
  })
  return result
}

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => a.startsWith('--source='))
  const source = sourceArg?.split('=')[1]
  if (!source) {
    log.error('Usage: npx tsx scripts/topic-aggregate.ts --source=<slug>')
    log.error('Available sources: github, producthunt, twitter')
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    log.error('❌ ANTHROPIC_API_KEY not configured')
    process.exit(1)
  }
  await aggregateTopics(source)
}
main().catch((error) => {
  log.error({ err: error }, '❌ Fatal error')
  process.exit(1)
})
