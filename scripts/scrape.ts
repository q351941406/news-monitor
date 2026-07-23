/**
 * 独立抓取脚本 - 由 GitHub Actions 调用
 * 用法: npx tsx scripts/scrape.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { sources, getSource } from '../src/sources'
import { storeRawItems } from '@/lib/db'

async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => a.startsWith('--source='))
  const sourceSlug = sourceArg?.split('=')[1]
  if (!sourceSlug) {
    console.error('Usage: npx tsx scripts/scrape.ts --source=<slug>')
    console.error('Available sources:', sources.map((s) => s.slug).join(', '))
    process.exit(1)
  }
  const source = getSource(sourceSlug)
  if (!source) {
    console.error(`Unknown source: ${sourceSlug}`)
    console.error('Available sources:', sources.map((s) => s.slug).join(', '))
    process.exit(1)
  }
  console.log(`[${new Date().toISOString()}] Scraping ${source.name}...`)
  try {
    const items = await source.fetch()
    console.log(`  ✅ Fetched ${items.length} items`)
    // 存储到数据库（提取 + 存储分离，fetch() 本身不写 DB）
    const stored = await storeRawItems(items)
    console.log(`  📦 Stored ${stored} new items`)
    // 输出 JSON 结果供 GitHub Actions 使用
    console.log(
      JSON.stringify({
        source: source.slug,
        total: items.length,
        stored,
        timestamp: Date.now(),
      }),
    )
  } catch (error) {
    console.error(`  ❌ Error: ${error}`)
    process.exit(1)
  }
}
main()
