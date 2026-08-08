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

/** 估算单条 item 在聚合 prompt 中的字符数（与 buildTopicPrompt 格式一致） */
function itemPromptLen(item: {
  id: string
  title: string | null
  summary: string | null
  details: string | null
}): number {
  return (
    `[x] ID: ${item.id}
标题: ${item.title || '无'}
摘要: ${item.summary || '无'}
重点: ${item.details || '无'}`.length + 6
  )
}
/** 按 prompt 字符数切分批次：每批总长不超过 MAX_PROMPT_CHARS，避免 DeepSeek 结构化输出失败 */
function splitByPromptLen<
  T extends { id: string; title: string | null; summary: string | null; details: string | null },
>(items: T[], maxChars: number = 8000): T[][] {
  const batches: T[][] = []
  let cur: T[] = []
  let curLen = 0
  for (const item of items) {
    const len = itemPromptLen(item)
    if (cur.length > 0 && curLen + len > maxChars) {
      batches.push(cur)
      cur = []
      curLen = 0
    }
    cur.push(item)
    curLen += len
  }
  if (cur.length > 0) batches.push(cur)
  return batches
}
/** 单批聚合：取一批 → 按字符数切分子批 → 逐子批 AI 聚合 → 增量 upsert → 标记已聚合 */
async function aggregateOneBatch(
  source: string,
  aiService: ReturnType<typeof createAIService>,
): Promise<number> {
  // 1. 取该 source 的待聚合批次（新数据优先 + 最旧补足）
  const items = await getAggregationBatch(source, 50)
  console.log(`  Found ${items.length} pending items`)
  if (items.length < 3) {
    console.log('  Not enough items to aggregate (< 3), skip')
    return 0
  }
  // 2. 取该 source 已有主题（作 AI 历史上下文）
  const existingTopics = await getExistingTopics(source)
  console.log(`  Existing topics: ${existingTopics.map((t) => t.topic).join(', ') || '（无）'}`)
  // 3. 按 prompt 字符数切分子批（关键修复：prompt 过大 → DeepSeek NoOutput）
  //    预算需扣除「已有主题历史块」的长度（每批 prompt = items + 全部已有主题）
  const historyChars = existingTopics.reduce(
    (sum, t) => sum + t.topic.length + (t.summary?.length || 0) + 8,
    0,
  )
  const itemBudget = Math.max(1500, 8000 - historyChars)
  const subBatches = splitByPromptLen(items, itemBudget)
  console.log(`  Split into ${subBatches.length} sub-batch(es) by prompt length`)
  let totalGroups = 0
  for (let si = 0; si < subBatches.length; si++) {
    const sub = subBatches[si]
    console.log(`  --- Sub-batch ${si + 1}/${subBatches.length} (${sub.length} items) ---`)
    // 子批不足 3 条时，AI 无法聚类（generateTopicAggregation 返回空是正常降级），跳过即可
    if (sub.length < 3) {
      console.log(`  Sub-batch ${si + 1} has ${sub.length} item(s) < 3, skip`)
      continue
    }
    const groups = await aiService.generateTopicAggregation(sub, existingTopics)
    if (!groups || groups.length === 0) {
      throw new Error(
        `AI topic aggregation failed for ${source}: no topics generated for sub-batch ${si + 1} (${sub.length} items)`,
      )
    }
    await storeTopicGroups(source, groups)
    totalGroups += groups.length
  }
  // 4. 删除该 source 下已无任何 items 的空主题
  const deleted = await deleteEmptyTopics(source)
  console.log(`  ✅ Stored ${totalGroups} topic groups, deleted ${deleted} empty topics`)
  // 5. 标记本批已聚合（队列消费完成，挪到队尾）
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
