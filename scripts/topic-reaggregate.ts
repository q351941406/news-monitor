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
/** 规则预合并：提取主题名的特征词（英文词 + 中文 2-gram），
 * 两两比较共享特征数，共享 ≥ MIN_SHARED 即视为同类主题合并。
 * 仅用于大扫除：把明显重复的碎片主题先压一遍，再交给后续归并。
 */
const STOP_BIGRAMS = new Set([
  '工具',
  '相关',
  '项目',
  '技术',
  '平台',
  '系统',
  '应用',
  '与',
  '和',
  '及',
  '类',
  '库',
  '的',
  '在',
  '中',
  '基于',
  '方案',
  '合集',
])
function extractFeatures(name: string): Set<string> {
  const feats = new Set<string>()
  // 英文词（≥3 字母，含连字符）
  name.match(/[a-zA-Z][a-zA-Z0-9-]{2,}/g)?.forEach((w) => feats.add(w.toLowerCase()))
  // 中文 2-gram
  const cn = name.replace(/[a-zA-Z0-9\s（）()、/_-]/g, '')
  for (let i = 0; i + 1 < cn.length; i++) {
    const g = cn.slice(i, i + 2)
    if (!STOP_BIGRAMS.has(g)) feats.add(g)
  }
  return feats
}
function ruleMergeTopics(topics: Array<{ topic: string; summary: string }>) {
  const features = topics.map((t) => extractFeatures(t.topic))
  const used = new Set<number>()
  const groups: Array<{ topic: string; summary: string }> = []
  const MIN_SHARED = 2
  for (let i = 0; i < topics.length; i++) {
    if (used.has(i)) continue
    const cluster = [topics[i]]
    used.add(i)
    for (let j = i + 1; j < topics.length; j++) {
      if (used.has(j)) continue
      const shared = [...features[i]].filter((w) => features[j].has(w)).length
      if (shared >= MIN_SHARED) {
        cluster.push(topics[j])
        used.add(j)
      }
    }
    if (cluster.length > 1) {
      // 取最长名字作代表（通常信息最全）
      cluster.sort((a, b) => b.topic.length - a.topic.length)
      groups.push({ topic: cluster[0].topic, summary: cluster[0].summary })
      console.log(`  🔗 合并 ${cluster.length} 个 → "${cluster[0].topic}"`)
      cluster.forEach((t) => console.log(`      - ${t.topic}`))
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

      // ── 阶段 C：合并 + 全删重建 ──
      // ── 阶段 B：全量 items 一次性归并（不分批）──
      console.log(`\n[${new Date().toISOString()}] 阶段 B：归并...`)
      const allItems = await getAllSummarizedItems(source)
      console.log(`  全部已摘要 items: ${allItems.length} 条`)
      const t0 = Date.now()
      const allGroups = (await ai.generateTopicAggregation(allItems, reorganized)) || []
      console.log(
        `  AI 归并耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，产出 ${allGroups.length} 个主题`,
      )
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
