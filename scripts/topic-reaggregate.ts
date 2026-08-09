/**
 * 主题大扫除脚本 - 全量重聚
 * 用法: npx tsx scripts/topic-reaggregate.ts --source=github
 *
 * 流程：
 *  A. 取全部现有主题作归并上下文（AI 自行合并/重命名/去重）
 *  B. 队列循环消费：每轮 getAggregationBatch(50) → 直接 AI 归并 → 增量 upsert → 标记
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

      // ── 阶段 B：队列循环消费（每轮 50 条直接 AI 归并）──
      console.log(`\n[${new Date().toISOString()}] 阶段 B：队列循环消费...`)
      const reset = await resetAggregationMarks(source)
      console.log(`  重置聚合标记: ${reset} 条`)

      let totalItems = 0
      let totalGroups = 0
      let rounds = 0
      while (rounds < 20) {
        const batch = await getAggregationBatch(source, 30)
        if (batch.length < 3) break
        rounds++
        console.log(`  --- 轮 ${rounds}: ${batch.length} 条 ---`)
        const existing = await getExistingTopics(source)
        const groups = await ai.generateTopicAggregation(batch, existing)
        if (groups?.length) {
          await storeTopicGroups(source, groups)
          totalGroups += groups.length
        }
        await markItemsAggregated(batch.map((i) => i.id))
        totalItems += batch.length
      }

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
