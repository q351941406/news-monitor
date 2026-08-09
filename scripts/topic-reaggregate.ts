/**
 * 主题大扫除脚本 - 全量重聚
 * 用法: npx tsx scripts/topic-reaggregate.ts --source=github
 *
 * 流程：
 *  A. 取全部现有主题作归并上下文（AI 自行合并/重命名/去重）
 *  B. 队列循环消费：getAggregationBatch(50) → 子批 → AI 归并 → 增量 upsert → 标记
 *  C. 删除空主题
 */
import { logger } from '@/lib/logger'
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import {
  getExistingTopics,
  storeTopicGroups,
  markItemsAggregated,
  resetAggregationMarks,
  getAggregationBatch,
  deleteEmptyTopics,
} from '@/lib/db'
import { createAIService } from '@/lib/ai-service'
import { withRunLog } from '@/lib/run-logger'
const log = logger.child({ script: 'topic-reaggregate' })

function parseArgs() {
  const sourceArg = process.argv.find((a) => a.startsWith('--source='))
  if (!sourceArg) throw new Error('--source=xxx required')
  return { source: sourceArg.split('=')[1] }
}

/** 估算单条 item 在聚合 prompt 中的字符数 */
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

/** 按 prompt 字符数切分（预算扣除历史主题块） */
function splitByPromptLen<
  T extends { id: string; title: string | null; summary: string | null; details: string | null },
>(items: T[], historyChars: number, maxChars: number = 8000): T[][] {
  const budget = Math.max(1500, maxChars - historyChars)
  const batches: T[][] = []
  let cur: T[] = []
  let curLen = 0
  for (const item of items) {
    const len = itemPromptLen(item)
    if (cur.length > 0 && curLen + len > budget) {
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

async function main() {
  const { source } = parseArgs()
  console.log(`
[${new Date().toISOString()}] 主题大扫除（全量重聚）开始 source=${source}`)
  const result = await withRunLog(
    { source, stage: 'topic-reaggregate' },
    async (): Promise<{ itemsCount: number }> => {
      const ai = createAIService()

      // ── 阶段 A：取全部现有主题作归并上下文（AI 自行合并/重命名/去重）──
      console.log(`\n[${new Date().toISOString()}] 阶段 A：获取现有主题...`)
      const existingTopics = await getExistingTopics(source)
      console.log(`  现有主题: ${existingTopics.length} 个（AI 归并时自行处理去重/合并）`)

      // ── 阶段 B：队列循环消费（复用爬虫模式：一次 getAggregationBatch 50 条）──
      console.log(`\n[${new Date().toISOString()}] 阶段 B：队列循环消费...`)
      // 1. 重置队列：让全部数据（含已聚合）重新进队列，实现全量重聚
      const reset = await resetAggregationMarks(source)
      console.log(`  重置聚合标记: ${reset} 条`)

      // 2. 循环消费：每次取 50 条 → 切子批 → AI 归并 → 增量 upsert → 标记
      let totalItems = 0
      let totalGroups = 0
      let rounds = 0
      while (rounds < 20) {
        const batch = await getAggregationBatch(source, 50)
        if (batch.length < 3) break
        rounds++
        console.log(`  --- 轮 ${rounds}: ${batch.length} 条 ---`)
        // 已有主题（含本轮之前归并的）作历史上下文
        const existing = await getExistingTopics(source)
        const historyChars = existing.reduce(
          (s, t) => s + t.topic.length + (t.summary?.length || 0) + 8,
          0,
        )
        const subBatches = splitByPromptLen(batch, historyChars)
        for (let si = 0; si < subBatches.length; si++) {
          const sub = subBatches[si]
          if (sub.length < 3) continue
          console.log(`    子批 ${si + 1}/${subBatches.length} (${sub.length} 条)`)
          const groups = await ai.generateTopicAggregation(sub, existing)
          if (groups?.length) {
            await storeTopicGroups(source, groups)
            totalGroups += groups.length
          }
        }
        await markItemsAggregated(batch.map((i) => i.id))
        totalItems += batch.length
      }

      // 3. 删除空主题
      const deleted = await deleteEmptyTopics(source)
      console.log(`  ✅ 消费 ${totalItems} 条 / ${totalGroups} 个主题组，删除空主题 ${deleted} 个`)
      return { itemsCount: totalItems }
    },
  )
  console.log(`\n[${new Date().toISOString()}] 完成: ${JSON.stringify(result)}`)
}

main().catch((err) => {
  console.error(`❌ 大扫除失败:`, err)
  process.exit(1)
})
