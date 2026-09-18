/**
 * 数据新鲜度巡检 —— 由 GitHub Actions 定时调用
 *
 * 为什么需要（真实事故）：
 * /api/admin/metrics 是 admin-only 的**被动拉取**接口。管道断了不会有人知道，
 * 除非碰巧登进去看。X 断流 57 天、PH 断流 47 天，全程无人察觉。
 *
 * 本脚本把「新鲜度」变成**主动推送**的指标：
 * 任一源超出容忍窗口 → 非 0 退出 → workflow 红 → GitHub 通知 + Sentry。
 *
 * 用法: npx tsx scripts/check-freshness.ts
 */
import { logger } from '@/lib/logger'
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { getLastIngestedBySource } from '@/lib/db'
import { detectStaleSources } from '@/lib/freshness'

const log = logger.child({ script: 'check-freshness' })

async function main() {
  const lastIngested = await getLastIngestedBySource()
  const alerts = detectStaleSources(lastIngested)
  const now = Date.now()

  console.log(`[${new Date().toISOString()}] 数据新鲜度巡检`)
  for (const { source, lastIngestedAt } of lastIngested) {
    const age = lastIngestedAt ? `${Math.floor((now - lastIngestedAt) / 3600000)}h 前` : '从未'
    console.log(`  ${source}: 最后入库 ${age}`)
  }

  if (alerts.length === 0) {
    console.log('  ✅ 所有数据源新鲜')
    return
  }

  // 输出结构化告警，供 workflow 拼进通知消息
  console.log(
    JSON.stringify({ stale: alerts.map((a) => ({ source: a.source, message: a.message })) }),
  )
  for (const a of alerts) {
    log.error(`  ⚠️ ${a.source}: ${a.message}`)
  }
  // 非 0 退出 → workflow 红 → 触发通知
  process.exit(1)
}

main().catch((err) => {
  log.error('巡检脚本自身失败:', err)
  process.exit(1)
})
