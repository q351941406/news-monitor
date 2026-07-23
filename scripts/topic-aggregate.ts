/**
 * 主题聚合脚本 - 基于 AI 摘要动态生成主题分组
 * 用法: npx tsx scripts/topic-aggregate.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { rawItems, aiAnalysis } from '../src/lib/schema'
import { storeTopicGroups } from '../src/lib/db'
import { createAIService } from '../src/lib/ai-service'

// 数据库连接
function getDb() {
  const sqlClient = neon(process.env.DATABASE_URL!)
  return drizzle(sqlClient)
}

// 获取未读的 AI 摘要
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

// 主题聚合函数
async function aggregateTopics(source: string) {
  console.log(`\n[${new Date().toISOString()}] Aggregating topics for ${source}...`)

  // 1. 获取未读摘要
  const items = await getUnreadSummaries(source)
  console.log(`  Found ${items.length} unread items with summaries`)
  if (items.length === 0) {
    console.log('  No items to aggregate')
    return
  }

  // 2. 调用 AIService（内部处理重试）
  const aiService = createAIService()
  const groups = await aiService.generateTopicAggregation(items)

  if (!groups || groups.length === 0) {
    console.log('  ❌ No topics generated')
    return
  }
  console.log(`  AI returned ${groups.length} topics`)

  // 3. 存储主题聚合
  await storeTopicGroups(source, groups)
  console.log(`  ✅ Stored ${groups.length} topic groups`)
}

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => a.startsWith('--source='))
  const source = sourceArg?.split('=')[1]
  if (!source) {
    console.error('Usage: npx tsx scripts/topic-aggregate.ts --source=<slug>')
    console.error('Available sources: github, producthunt, twitter')
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not configured')
    process.exit(1)
  }
  await aggregateTopics(source)
}

main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
