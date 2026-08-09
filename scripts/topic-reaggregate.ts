/**
 * 主题大扫除脚本 - 全删重建
 * 用法: npx tsx scripts/topic-reaggregate.ts --source=github
 *
 * 流程（全删重建，彻底去碎片）：
 *  A. 删除该 source 全部旧主题（topic_items 级联清理）→ 重置全部聚合标记
 *  B. 队列循环消费：每轮 getAggregationBatch(30) → 直接 AI 归并 →
 *     增量 upsert（轮间按主题名复用）→ 标记已聚合，消费完为止
 *  C. 删除空主题 + 完整性检测（仍有积压则抛错，让 workflow 失败告警）
 */
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
  deleteAllTopics,
  getPendingItemCount,
} from '@/lib/db'
import { createAIService } from '@/lib/ai-service'
import { withRunLog } from '@/lib/run-logger'
function parseArgs() {
  const sourceArg = process.argv.find((a) => a.startsWith('--source='))
  if (!sourceArg) throw new Error('--source=xxx required')
  return { source: sourceArg.split('=')[1] }
}
async function main() {
  const { source } = parseArgs()
  console.log(`
[${new Date().toISOString()}] 主题大扫除（全删重建）开始 source=${source}`)
  const result = await withRunLog(
    { source, stage: 'topic-reaggregate' },
    async (): Promise<{ itemsCount: number; deletedTopics: number }> => {
      const ai = createAIService()
      // ── 阶段 A：全删重建 ──
      // 先删光旧主题（topic_items 级联删除），再重置聚合标记，
      // 保证所有 items 会被重新聚类，历史碎片主题彻底清除。
      console.log(`\n[${new Date().toISOString()}] 阶段 A：全删重建...`)
      const deletedTopics = await deleteAllTopics(source)
      console.log(`  删除旧主题: ${deletedTopics} 个`)
      const reset = await resetAggregationMarks(source)
      console.log(`  重置聚合标记: ${reset} 条（全部 items 等待重新聚类）`)
      // ── 阶段 B：队列循环消费（每轮 30 条直接 AI 归并，轮间按主题名增量复用）──
      console.log(`\n[${new Date().toISOString()}] 阶段 B：队列循环消费...`)
      let totalItems = 0
      let totalGroups = 0
      let rounds = 0
      const MAX_ROUNDS = 200 // 上限足够大，实际以「消费完」为准；workflow timeout 兜底
      while (rounds < MAX_ROUNDS) {
        const batch = await getAggregationBatch(source, 30)
        if (batch.length < 3) break
        rounds++
        console.log(`  --- 轮 ${rounds}: ${batch.length} 条 ---`)
        const existing = await getExistingTopics(source)
        const tStart = Date.now()
        const groups = await ai.generateTopicAggregation(batch, existing)
        const elapsed = ((Date.now() - tStart) / 1000).toFixed(1)
        const promptEst =
          batch.reduce(
            (s, it) =>
              s + (it.title || '').length + (it.summary || '').length + (it.details || '').length,
            0,
          ) + existing.reduce((s, t) => s + t.topic.length + (t.summary || '').length, 0)
        if (groups?.length) {
          await storeTopicGroups(source, groups)
          totalGroups += groups.length
          console.log(
            `    ✅ 归并 ${groups.length} 组 | 耗时 ${elapsed}s | items≈${Math.round(promptEst / 100) / 10}K chars | 当前主题 ${existing.length} 个`,
          )
        } else {
          console.log(
            `    ⚠️ 本轮无输出 | 耗时 ${elapsed}s | items≈${Math.round(promptEst / 100) / 10}K chars`,
          )
        }
        await markItemsAggregated(batch.map((i) => i.id))
        totalItems += batch.length
      }
      // ── 阶段 C：收尾 ──
      const deleted = await deleteEmptyTopics(source)
      console.log(`  ✅ 消费 ${totalItems} 条 / ${totalGroups} 个主题组，删除空主题 ${deleted} 个`)
      const remaining = await getPendingItemCount(source)
      if (remaining > 2) {
        // 积压未消化完 = 全删重建未完成，主题体系残缺。宁可失败告警让人工介入重跑
        throw new Error(
          `大扫除未完成：仍有 ${remaining} 条 items 未重聚（轮次上限/异常中断），请重跑或人工处理`,
        )
      }
      console.log(`  ✅ 完整性检测通过：剩余未聚合 ${remaining} 条（≤2 属正常边界）`)
      return { itemsCount: totalItems, deletedTopics }
    },
  )
  console.log(`\n[${new Date().toISOString()}] 完成: ${JSON.stringify(result)}`)
}
main().catch((err) => {
  console.error(`❌ 大扫除失败:`, err)
  process.exit(1)
})
