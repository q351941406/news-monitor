import { logger } from '@/lib/logger'
/**
 * 保留期清理 —— 删掉「已读超过 N 天」的内容
 *
 * 用法:
 *   npx tsx scripts/cleanup.ts                # 默认 30 天
 *   npx tsx scripts/cleanup.ts --days=90      # 临时改保留期
 *   npx tsx scripts/cleanup.ts --dry-run      # 只统计不删除
 *
 * 删除 raw_items 会级联清掉 ai_analysis 与 topic_items；随后清理因此变空的主题组。
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { countReadItemsBefore, purgeReadItemsBefore, deleteEmptyTopicGroups } from '@/lib/db'
import { computeCutoff, resolveRetentionDays } from '@/lib/retention'
import { revalidateCacheAfterRun } from './revalidate-cache'
const log = logger.child({ script: 'cleanup' })

function argValue(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const days = resolveRetentionDays(argValue('days') ?? process.env.READ_RETENTION_DAYS)
  const cutoff = computeCutoff(Date.now(), days)
  const cutoffDate = new Date(cutoff).toISOString()

  console.log(
    `[cleanup] 保留期 ${days} 天，截止 ${cutoffDate} 之前的已读条目将${dryRun ? '被统计（dry-run）' : '被删除'}`,
  )

  const candidates = await countReadItemsBefore(cutoff)
  console.log(`  待清理：${candidates} 条`)

  if (dryRun) {
    console.log('  ⏭ dry-run，未执行删除')
    return
  }

  if (candidates === 0) {
    console.log('  ✅ 无需清理')
    return
  }

  const result = await purgeReadItemsBefore(cutoff)
  console.log(`  🗑 已删除 ${result.deleted} 条（${result.batches} 批）`)
  if (result.reachedLimit) {
    log.warn(`⚠️ 达到单次清理批次数上限，仍有积压留待下次运行`)
  }

  const emptyGroups = await deleteEmptyTopicGroups()
  if (emptyGroups > 0) console.log(`  🧹 清理空主题组 ${emptyGroups} 个`)

  // 删除会影响未读数 / 归档 / 主题列表，主动失效缓存
  await revalidateCacheAfterRun('cleanup')
}

main().catch((error) => {
  log.error({ err: error }, '❌ Cleanup failed')
  process.exit(1)
})
