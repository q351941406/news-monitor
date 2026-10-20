/**
 * 未归组条目重入队 —— 修复「徽标有数字、列表没内容」的存量数据
 *
 * 背景（2026-10 线上事故）：
 * 徽标数字统计 raw_items 的未读行数，列表渲染 topic_groups。
 * 一批条目被标记成「已聚合」、却没挂上任何主题组（AI 漏项 / id 大小写对不上），
 * 于是它们既不在主题组里、也不会被队列再次捡起（队列只捞 aggregated_at IS NULL），
 * 全站无处可寻 —— GitHub 徽标 8、列表整页空白。
 *
 * 本脚本把这些条目的 aggregated_at 置回 NULL，让它们重新进入聚合队列。
 *
 * 默认**只处理未读**：已读条目按产品语义「读完即消失」，不该重新冒出来。
 *
 * 用法:
 *   npx tsx scripts/requeue-ungrouped.ts --dry-run          # 只看会改什么
 *   npx tsx scripts/requeue-ungrouped.ts --source=github     # 只处理某个源
 *   npx tsx scripts/requeue-ungrouped.ts --include-read      # 连已读的一起重入队
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { requeueUngroupedItems } from '@/lib/db'
import { logger } from '@/lib/logger'

const log = logger.child({ script: 'requeue-ungrouped' })

function parseArgs() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => a.startsWith('--source='))
  return {
    source: sourceArg?.split('=')[1] ?? 'all',
    includeRead: args.includes('--include-read'),
    dryRun: args.includes('--dry-run'),
  }
}

async function main() {
  const { source, includeRead, dryRun } = parseArgs()
  console.log(
    `[${new Date().toISOString()}] 未归组条目重入队 source=${source} includeRead=${includeRead} dryRun=${dryRun}`,
  )

  if (dryRun) {
    // dry-run 只读：用 ungrouped 查询预览
    const { getUngroupedItems } = await import('@/lib/db')
    const items = await getUngroupedItems(source, 200)
    const target = includeRead ? items : items.filter((i) => !i.isRead)
    console.log(`  将重入队 ${target.length} 条（预览，未实际写入）：`)
    for (const i of target.slice(0, 20)) {
      console.log(`    ${i.id}  ${i.pendingSummary ? '[待摘要]' : '[有摘要]'} ${i.title ?? ''}`)
    }
    if (target.length > 20) console.log(`    … 其余 ${target.length - 20} 条省略`)
    return
  }

  const result = await requeueUngroupedItems({ source, includeRead })
  console.log(`  ✅ 已重入队 ${result.requeued} 条`)
  console.log(
    `     其中 ${result.withoutSummary} 条还没有 AI 摘要（需等富化流程补齐后才会进入聚类）`,
  )
  for (const id of result.ids.slice(0, 20)) console.log(`     - ${id}`)
  if (result.ids.length > 20) console.log(`     … 其余 ${result.ids.length - 20} 条省略`)
  log.info({ requeued: result.requeued }, '未归组条目已重入队')
}

main().catch((err) => {
  log.error(`重入队失败: ${err}`)
  process.exit(1)
})
