import { logger } from '@/lib/logger'
import { sources } from '../src/sources'
import { drainBatches } from './drain'

/** 全部数据源（从适配器派生，新增源自动覆盖） */
export const ALL_SOURCES = sources.map((s) => s.slug)
/**
 * 主题聚合脚本 - 将 AI 分析结果按主题分组
 * 用法: npx tsx scripts/topic-aggregate.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import {
  storeTopicGroups,
  deleteReadEmptyTopicsBySource,
  getExistingTopics,
  getAggregationBatch,
  markItemsAggregated,
} from '@/lib/db'
import { createAIService } from '@/lib/ai-service'
import { withRunLog } from '@/lib/run-logger'
import { revalidateCacheAfterRun } from './revalidate-cache'
const log = logger.child({ script: 'topic-aggregate' })

/** 估算单条 item 在聚合 prompt 中的字符数（与 buildTopicPrompt 格式一致） */
export function itemPromptLen(item: {
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
export function splitByPromptLen<
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
/**
 * 是否存在「可聚合子批」：只要有 1 条待聚合就算存在。
 *
 * 阈值曾为 3 —— 于是「少于 3 条」被当成正常降级直接跳过，
 * 而低频数据源（GitHub 每天净增 2-4 条）**永远**凑不满 3 条，
 * 主题组因此长期为 0：条目照样入库、照样被徽标计数，列表却是空的。
 * 现在 1 条也要聚类，「有内容却无组」不再是常态。
 */
export function hasAggregatableBatch(batches: unknown[][]): boolean {
  return batches.some((b) => b.length >= 1)
}

/**
 * 小批量兜底成组：AI 偶尔对 1-2 条内容返回空数组（"内容太少，无法聚类"）。
 *
 * 不兜底的后果很严重：这些条目既不在主题组里、又永远 pending，
 * 于是「不在任何列表里，但徽标在数」—— 正是本次事故的形态。
 * 兜底策略：把该子批的条目收进一个组，主题名取首条标题，概括取各条摘要。
 */
export function buildFallbackGroup(
  items: Array<{ id: string; title: string | null; summary: string | null }>,
): Array<{ topic: string; summary: string; itemIds: string[] }> {
  if (items.length === 0) return []
  const topic = (items[0].title || '待归组内容').trim().slice(0, 40)
  const summary =
    items
      .map((i) => i.summary)
      .filter((s): s is string => !!s)
      .join('；')
      .slice(0, 500) || '（AI 尚未生成概括）'
  return [{ topic, summary, itemIds: items.map((i) => i.id) }]
}

async function aggregateOneBatch(
  source: string,
  aiService: ReturnType<typeof createAIService>,
): Promise<number> {
  // 1. 取该 source 的待聚合批次（新数据优先 + 最旧补足）
  const items = await getAggregationBatch(source, 50)
  console.log(`  Found ${items.length} pending items`)
  if (items.length < 1) {
    console.log('  No pending items to aggregate, skip')
    return 0
  }
  // 2. 取该 source 已有主题（作 AI 历史上下文）
  const existingTopics = await getExistingTopics(source)
  console.log(`  Existing topics: ${existingTopics.map((t) => t.topic).join(', ') || '（无）'}`)
  // 3. 按 prompt 字符数切分子批（防止单批 items 过多导致 prompt 超限）
  //    github 条目长（details 含仓库详情），不受 8000 字符分批约束：一次整批送 AI，避免被切碎成单条小批
  //    其余源条目短，维持 8000 防爆
  const itemBudget = source === 'github' ? Infinity : 8000
  const subBatches = splitByPromptLen(items, itemBudget)
  console.log(`  Split into ${subBatches.length} sub-batch(es) by prompt length`)
  let totalGroups = 0
  // [FIX-C] 只收集真正聚合成功的 item id；跳过/AI 失败的保持 pending，下轮重试，绝不被"假消费"
  const consumedIds: string[] = []
  for (let si = 0; si < subBatches.length; si++) {
    const sub = subBatches[si]
    console.log(`  --- Sub-batch ${si + 1}/${subBatches.length} (${sub.length} items) ---`)
    const groups = await aiService.generateTopicAggregation(sub, existingTopics)
    let effectiveGroups = groups
    if (!groups || groups.length === 0) {
      if (sub.length <= 2) {
        // 小批量：AI 返回空是"内容太少"的常见响应，兜底建组，
        // 避免条目永远悬空（不在组里、也不在列表里，徽标却在数）
        effectiveGroups = buildFallbackGroup(sub)
        console.log(
          `  ⚠️ AI returned no topics for sub-batch ${si + 1} (${sub.length} items), fallback group created`,
        )
      } else {
        // [FIX-C] 不再 throw：AI 返回空时保留 pending，避免整批数据被"假消费"后永久隐身
        console.log(
          `  ⚠️ AI returned no topics for sub-batch ${si + 1} (${sub.length} items), keep pending`,
        )
        continue
      }
    }
    const stored = await storeTopicGroups(source, effectiveGroups)
    totalGroups += effectiveGroups.length
    // 只把**真正落进主题组**的条目标记为已消费。
    // 此前是整批都标记：AI 漏掉的、或 id 对不上的条目被"假消费"——
    // 它们不在任何组里（前台看不见），却已被 aggregated_at 标记，
    // 而聚合队列只捞 aggregated_at IS NULL 的条目 → 永久隐身。
    // 线上实测：github 365 条全部不在任何主题组，PH/Twitter 另有 63 条同类。
    consumedIds.push(...stored.linked)
    if (stored.skipped.length > 0) {
      console.log(
        `  ⚠️ ${stored.skipped.length} item(s) not linked to any group, keep pending: ${stored.skipped.slice(0, 3).join(', ')}`,
      )
    }
  }
  // 4. 清理"已读空组"（物理删除：空壳组 + 全已读组，级联删关联，防止主题组无限膨胀）
  const deleted = await deleteReadEmptyTopicsBySource(source)
  console.log(`  ✅ Stored ${totalGroups} topic groups, deleted ${deleted} read-empty topics`)
  // 5. 标记本批已聚合（队列消费完成，挪到队尾）—— 仅标记真正聚合成功的
  await markItemsAggregated(consumedIds)
  console.log(
    `  ✅ Marked ${consumedIds.length}/${items.length} items as aggregated (${items.length - consumedIds.length} kept pending)`,
  )
  // 存在可聚合子批却一组都没产出 = AI 侧不可用。失败条目已保持 pending 待下轮重试，
  // 但必须让 run 失败以便告警 —— 否则 AI 长期故障会完全静默（线上曾发生近 20 天）。
  if (hasAggregatableBatch(subBatches) && totalGroups === 0) {
    throw new Error(
      `AI 主题聚类全部失败：${items.length} 条待聚合、0 组产出（已保持 pending 待下轮重试）`,
    )
  }
  return consumedIds.length
}

async function aggregateTopics(source: string) {
  console.log(`
[${new Date().toISOString()}] Aggregating topics for ${source}...`)
  return withRunLog({ source, stage: 'topic-aggregate' }, async () => {
    const aiService = createAIService()
    // 循环消费直到无待聚合或达轮次上限（拆分后单次要消化一天累积的积压，见 ADR-0009）
    const result = await drainBatches(() => aggregateOneBatch(source, aiService), MAX_ROUNDS)
    if (result.hitLimit) {
      log.warn(`⚠️ ${source}: 达到单次运行上限 ${MAX_ROUNDS} 轮仍有积压，留待下轮继续`)
    }
    console.log(`  ✅ Total: ${result.total} items aggregated in ${result.rounds} round(s)`)
    return { itemsCount: result.total }
  })
}

/** 单次运行每个源最多消费多少轮（每轮 50 条），防止单次运行失控 */
const MAX_ROUNDS = 20

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => a.startsWith('--source='))
  const raw = sourceArg?.split('=')[1]
  if (!raw) {
    log.error('Usage: npx tsx scripts/topic-aggregate.ts --source=<slug|all>')
    log.error('Available sources: github, producthunt, twitter, all')
    process.exit(1)
  }
  if (!process.env.AI_API_KEY) {
    log.error('❌ AI_API_KEY not configured')
    process.exit(1)
  }
  const targets = raw === 'all' ? ALL_SOURCES : [raw]
  for (const source of targets) {
    await aggregateTopics(source)
  }
  await revalidateCacheAfterRun('topic-aggregate')
}
// 仅当作为 CLI 直接执行时才运行 main（被测试 import 时跳过）
// require.main === module：tsx 运行脚本时成立，vitest import 时失败
if (require.main === module) {
  main().catch((error) => {
    log.error({ err: error }, '❌ Fatal error')
    process.exit(1)
  })
}
