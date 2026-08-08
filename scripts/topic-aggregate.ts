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

/** 单批聚合：取一批 → AI 聚合 → 增量 upsert → 标记已聚合，返回消费条数（0=无积压/失败） */
async function aggregateOneBatch(
  source: string,
  aiService: ReturnType<typeof createAIService>,
): Promise<number> {
  // 1. 取该 source 的待聚合批次（新数据优先 + 最旧补足，每批 30 条，减小 prompt 保证 AI 可靠）
  const items = await getAggregationBatch(source, 30)
  console.log(`  Found ${items.length} pending items`)
  if (items.length < 3) {
    console.log('  Not enough items to aggregate (< 3), skip')
    return 0
  }
  // 2. 取该 source 已有主题（作 AI 历史上下文）
  const existingTopics = await getExistingTopics(source)
  console.log(`  Existing topics: ${existingTopics.map((t) => t.topic).join(', ') || '（无）'}`)
  // 3. 调用 AI 进行主题聚合（带历史上下文，增量归并）
  const groups = await aiService.generateTopicAggregation(items, existingTopics)
  if (!groups || groups.length === 0) {
    console.log('  ❌ No topics generated for this batch')
    return 0
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
  return items.length
}
async function aggregateTopics(source: string) {
  console.log(`
[${new Date().toISOString()}] Aggregating topics for ${source}...`)
  const result = await withRunLog({ source, stage: 'topic-aggregate' }, async () => {
    // 循环消费：单次脚本运行最多处理 5 批（每批 30 条 ≈ 150 条），消化积压
    // 直到积压清空（返回 0）或达到轮次上限
    const aiService = createAIService()
    let totalConsumed = 0
    let emptyRounds = 0
    const MAX_ROUNDS = 5
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      console.log(`--- Round ${round}/${MAX_ROUNDS} ---`)
      const consumed = await aggregateOneBatch(source, aiService)
      totalConsumed += consumed
      if (consumed === 0) {
        emptyRounds++
        // 连续两次取不到数据即认为积压已清空
        if (emptyRounds >= 2 || round === 1) break
      } else {
        emptyRounds = 0
      }
    }
    console.log(`  ✅ Total: ${totalConsumed} items aggregated in this run`)
    return { itemsCount: totalConsumed }
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
