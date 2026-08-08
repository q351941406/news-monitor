import { logger } from '@/lib/logger'
/**
 * 主题聚合脚本 - 将 AI 分析结果按主题分组
 * 用法: npx tsx scripts/topic-aggregate.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import {
  storeTopicGroups,
  deleteEmptyTopics,
  getExistingTopics,
  getAggregationBatch,
  markItemsAggregated,
} from '@/lib/db'
import { createAIService } from '@/lib/ai-service'
import { withRunLog } from '@/lib/run-logger'
const log = logger.child({ script: 'topic-aggregate' })

async function aggregateTopics(source: string) {
  console.log(`
[${new Date().toISOString()}] Aggregating topics for ${source}...`)
  const result = await withRunLog({ source, stage: 'topic-aggregate' }, async () => {
    // 1. 取该 source 的待聚合批次（新数据优先 + 最旧补足，共 100 条）
    const items = await getAggregationBatch(source, 100)
    console.log(`  Found ${items.length} pending items`)
    if (items.length < 3) {
      console.log('  Not enough items to aggregate (< 3), skip')
      return { itemsCount: 0 }
    }
    // 2. 取该 source 已有主题（作 AI 历史上下文）
    const existingTopics = await getExistingTopics(source)
    console.log(`  Existing topics: ${existingTopics.map((t) => t.topic).join(', ') || '（无）'}`)
    // 3. 调用 AI 进行主题聚合（带历史上下文，增量归并）
    const aiService = createAIService()
    const groups = await aiService.generateTopicAggregation(items, existingTopics)
    if (!groups || groups.length === 0) {
      console.log('  ❌ No topics generated')
      return { itemsCount: 0 }
    }
    console.log(`  AI returned ${groups.length} topics`)
    // 4. 增量 upsert 存储（已有主题追加成员 / 新主题新建）
    await storeTopicGroups(source, groups)
    // 5. 删除该 source 下已无任何 items 的空主题
    const deleted = await deleteEmptyTopics(source)
    console.log(`  ✅ Stored ${groups.length} topic groups, deleted ${deleted} empty topics`)
    // 6. 标记本批已聚合（队列消费完成，挪到队尾）
    await markItemsAggregated(items.map((i) => i.id))
    console.log(`  ✅ Marked ${items.length} items as aggregated`)
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
