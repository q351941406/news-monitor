/**
 * 主题大扫除脚本 - 全量重聚
 * 用法: npx tsx scripts/topic-reaggregate.ts --source=github
 *
 * 三阶段：
 *  A. AI 整理主题清单（合并/重命名/删除碎片主题）
 *  B. 全部 items 分批归并到整理后的清单
 *  C. 全删重建 + 标记全部已聚合
 */
import { logger } from '@/lib/logger'
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import {
  getAllSummarizedItems,
  getExistingTopics,
  deleteAllTopics,
  storeTopicGroups,
  markItemsAggregated,
} from '@/lib/db'
import { createAIService } from '@/lib/ai-service'
import { withRunLog } from '@/lib/run-logger'

const log = logger.child({ script: 'topic-reaggregate' })

function parseArgs() {
  const sourceArg = process.argv.find((a) => a.startsWith('--source='))
  if (!sourceArg) throw new Error('--source=xxx required')
  return { source: sourceArg.split('=')[1] }
}

/** 规则预合并：按主题名的公共核心词聚类（如「游戏作弊与脚本执行工具」/「游戏破解与作弊工具」都含"作弊"） */
function ruleMergeTopics(topics: Array<{ topic: string; summary: string }>) {
  const groups: Array<{ topic: string; summary: string }> = []
  const used = new Set<number>()
  const keywords = (name: string): string[] => {
    const words = new Set<string>()
    name.match(/[a-zA-Z][a-zA-Z0-9\-]{2,}/g)?.forEach((w) => words.add(w.toLowerCase()))
    const cn = name.replace(/[a-zA-Z0-9\s（）()、/_-]/g, '')
    for (let i = 0; i + 1 < cn.length; i++) {
      const bigram = cn.slice(i, i + 2)
      if (
        ['工具', '相关', '项目', '技术', '平台', '系统', '应用', '与', '和', '及', '类'].includes(
          bigram,
        )
      )
        continue
      if (cn.split(bigram).length > 2) words.add(bigram)
    }
    return [...words]
  }
  for (let i = 0; i < topics.length; i++) {
    if (used.has(i)) continue
    const ki = new Set(keywords(topics[i].topic))
    const cluster = [topics[i]]
    used.add(i)
    for (let j = i + 1; j < topics.length; j++) {
      if (used.has(j)) continue
      const kj = new Set(keywords(topics[j].topic))
      const shared = [...ki].filter((w) => kj.has(w))
      if (shared.length >= 2) {
        cluster.push(topics[j])
        used.add(j)
        shared.forEach((w) => ki.add(w))
      }
    }
    if (cluster.length > 1) {
      cluster.sort((a, b) => b.topic.length - a.topic.length)
      groups.push({ topic: cluster[0].topic, summary: cluster[0].summary })
      console.log(`  🔗 合并 ${cluster.length} 个 → "${cluster[0].topic}"`)
    } else {
      groups.push(topics[i])
    }
  }
  return groups
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
  await withRunLog(
    { source, stage: 'topic-reaggregate' },
    async (): Promise<{ itemsCount: number }> => {
      const ai = createAIService()

      // ── 阶段 A：规则预合并主题清单（不依赖 AI，避免超长 prompt）──
      console.log(`\n[${new Date().toISOString()}] 阶段 A：规则预合并主题...`)
      const existingTopics = await getExistingTopics(source)
      console.log(`  现有主题: ${existingTopics.length} 个`)
      const reorganized = ruleMergeTopics(existingTopics)
      console.log(`  规则预合并后: ${reorganized.length} 个主题`)
      reorganized.forEach((t, i) => console.log(`    ${i + 1}. ${t.topic}`))

      // ── 阶段 B：全量 items 分批归并 ──
      console.log(`\n[${new Date().toISOString()}] 阶段 B：分批归并...`)
      const allItems = await getAllSummarizedItems(source)
      console.log(`  全部已摘要 items: ${allItems.length} 条`)
      const historyChars = reorganized.reduce(
        (s, t) => s + t.topic.length + (t.summary?.length || 0) + 8,
        0,
      )
      const batches = splitByPromptLen(allItems, historyChars)
      console.log(`  切分为 ${batches.length} 批`)

      // 每批归并 → 收集该批的 TopicGroup
      const allGroups: Array<{ topic: string; summary: string; itemIds: string[] }> = []
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        if (batch.length < 3) {
          console.log(
            `  --- Batch ${i + 1}/${batches.length} (${batch.length} items) < 3, skip ---`,
          )
          continue
        }
        console.log(`  --- Batch ${i + 1}/${batches.length} (${batch.length} items) ---`)
        const groups = await ai.generateTopicAggregation(batch, reorganized)
        if (!groups || groups.length === 0) {
          console.log(`  ⚠️ Batch ${i + 1} no groups, retrying with larger budget...`)
          const retry = await ai.generateTopicAggregation(batch, reorganized.slice(0, 15))
          if (retry?.length) allGroups.push(...retry)
          continue
        }
        allGroups.push(...groups)
      }

      // ── 阶段 C：合并 + 全删重建 ──
      console.log(`\n[${new Date().toISOString()}] 阶段 C：合并重建...`)
      // 按 topic 名合并（同名去重）
      const mergedMap = new Map<string, { topic: string; summary: string; itemIds: Set<string> }>()
      for (const g of allGroups) {
        const key = g.topic.trim()
        if (!mergedMap.has(key)) {
          mergedMap.set(key, { topic: key, summary: g.summary, itemIds: new Set() })
        }
        const target = mergedMap.get(key)!
        if (g.summary && g.summary.length > target.summary.length) target.summary = g.summary
        g.itemIds.forEach((id) => target.itemIds.add(id))
      }
      const finalGroups = [...mergedMap.values()].map((g) => ({
        topic: g.topic,
        summary: g.summary,
        itemIds: [...g.itemIds],
      }))
      console.log(
        `  合并后主题: ${finalGroups.length} 个（覆盖 ${finalGroups.reduce((s, g) => s + g.itemIds.length, 0)} 条）`,
      )

      // 全删重建
      const deleted = await deleteAllTopics(source)
      console.log(`  删除旧主题: ${deleted} 个`)
      await storeTopicGroups(source, finalGroups)
      console.log(`  ✅ 已写入 ${finalGroups.length} 个新主题`)

      // 标记全部已聚合
      await markItemsAggregated(allItems.map((i) => i.id))
      console.log(`  ✅ 已标记 ${allItems.length} 条全部聚合完成`)
      return { itemsCount: allItems.length }
    },
  )
}

main().catch((err) => {
  console.error(`❌ 大扫除失败:`, err)
  process.exit(1)
})
