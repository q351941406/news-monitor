/**
 * 可展示性巡检 —— 「有数字、没内容」的唯一兜底
 *
 * 为什么需要（真实事故 2026-10）：
 * 徽标数字统计 raw_items 的未读行数，列表渲染 topic_groups。
 * 两套口径脱钩时（内容已入库、但没挂上任何主题组），
 * 用户看到的是一个无法解释的数字：GitHub 徽标 8、列表整页空白，
 * 而这 8 条在首页、归档页全都无处可寻。
 *
 * 而新鲜度巡检（check-freshness）只看「最后入库时间」——
 * 数据天天有入库，巡检永远绿，永远发现不了这件事。
 *
 * 本脚本把「可展示性」变成主动推送的指标：
 * 某源有未读内容却一个主题组都没有 / 未读内容卡在未归组超过阈值
 * → 非 0 退出 → workflow 红 → GitHub 通知 + Sentry。
 *
 * 用法: npx tsx scripts/check-visibility.ts
 */
import { logger } from '@/lib/logger'
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { getNewsCounts, getUngroupedSummaryBySource, getTopicGroupCountsBySource } from '@/lib/db'
import { detectVisibilityIssues } from '@/lib/visibility'

const log = logger.child({ script: 'check-visibility' })

async function main() {
  const [counts, ungrouped, groupCounts] = await Promise.all([
    getNewsCounts(),
    getUngroupedSummaryBySource(),
    getTopicGroupCountsBySource(),
  ])

  const inputs = Object.keys(counts).map((source) => {
    const summary = ungrouped.find((u) => u.source === source)
    return {
      source,
      unread: counts[source]?.unread ?? 0,
      groupCount: groupCounts[source] ?? 0,
      ungroupedCount: summary?.count ?? 0,
      oldestUngroupedAt: summary?.oldestFetchedAt ?? null,
    }
  })

  console.log(`[${new Date().toISOString()}] 可展示性巡检`)
  for (const i of inputs) {
    console.log(
      `  ${i.source}: 未读 ${i.unread} · 主题组 ${i.groupCount} · 未归组 ${i.ungroupedCount}`,
    )
  }

  const alerts = detectVisibilityIssues(inputs)
  if (alerts.length === 0) {
    console.log('  ✅ 所有来源的未读内容都能在页面上找到')
    return
  }

  // 输出结构化告警，供 workflow 拼进通知消息
  console.log(
    JSON.stringify({
      alerts: alerts.map((a) => ({ source: a.source, type: a.type, message: a.message })),
    }),
  )
  for (const a of alerts) {
    log.error(`  ⚠️ ${a.source}: ${a.message}`)
  }
  // 非 0 退出 → workflow 红 → 触发通知
  process.exit(1)
}

main().catch((err) => {
  log.error(`巡检脚本自身失败: ${err}`)
  process.exit(1)
})
