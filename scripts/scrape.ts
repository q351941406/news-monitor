import { logger } from '@/lib/logger'
/**
 * 独立抓取脚本 - 由 GitHub Actions 调用
 * 用法: npx tsx scripts/scrape.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { sources, getSource } from '../src/sources'
import { storeRawItems } from '@/lib/db'
import { withRunLog } from '@/lib/run-logger'
import { revalidateCacheAfterRun } from './revalidate-cache'
const log = logger.child({ script: 'scrape' })
async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => a.startsWith('--source='))
  const sourceSlug = sourceArg?.split('=')[1]
  if (!sourceSlug) {
    log.error('Usage: npx tsx scripts/scrape.ts --source=<slug>')
    log.error(`Available sources: ${sources.map((s) => s.slug).join(', ')}`)
    process.exit(1)
  }
  const source = getSource(sourceSlug)
  if (!source) {
    log.error(`Unknown source: ${sourceSlug}`)
    log.error(`Available sources: ${sources.map((s) => s.slug).join(', ')}`)
    process.exit(1)
  }
  console.log(`[${new Date().toISOString()}] Scraping ${source.name}...`)
  try {
    const result = await withRunLog({ source: source.slug, stage: 'scrape' }, async () => {
      const items = await source.fetch()
      console.log(`  ✅ Fetched ${items.length} items`)
      const stored = await storeRawItems(items)
      console.log(`  📦 Stored ${stored} new items`)
      return { itemsCount: stored }
    })
    // 输出 JSON 结果供 GitHub Actions 使用
    console.log(
      JSON.stringify({
        source: source.slug,
        total: result.itemsCount,
        timestamp: Date.now(),
      }),
    )
    // 抓取产生新数据 → 失效前端缓存（需配置 REVALIDATE_URL/ADMIN_TOKEN）
    await revalidateCacheAfterRun('scrape')
  } catch (error) {
    log.error(`  ❌ Error: ${error}`)
    process.exit(1)
  }
}
main()
