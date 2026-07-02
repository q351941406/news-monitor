/**
 * 独立抓取脚本 - 由 GitHub Actions 调用
 * 用法: npx tsx scripts/scrape.ts --source=github
 */
import 'dotenv/config'
import { sources, getSource } from '../src/sources'
import { storeNews, isProcessed, markProcessed } from '../src/lib/redis'

async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find(a => a.startsWith('--source='))
  const sourceSlug = sourceArg?.split('=')[1]

  if (!sourceSlug) {
    console.error('Usage: npx tsx scripts/scrape.ts --source=<slug>')
    console.error('Available sources:', sources.map(s => s.slug).join(', '))
    process.exit(1)
  }

  const source = getSource(sourceSlug)
  if (!source) {
    console.error(`Unknown source: ${sourceSlug}`)
    console.error('Available sources:', sources.map(s => s.slug).join(', '))
    process.exit(1)
  }

  console.log(`[${new Date().toISOString()}] Scraping ${source.name}...`)

  try {
    const items = await source.fetch()
    console.log(`  Fetched ${items.length} items`)

    // 过滤已处理的
    const newItems = []
    for (const item of items) {
      if (!(await isProcessed(source.slug, item.id))) {
        newItems.push(item)
        await markProcessed(source.slug, item.id)
      }
    }

    console.log(`  ${newItems.length} new items after dedup`)

    if (newItems.length > 0) {
      await storeNews(source.slug, newItems)
      console.log(`  ✅ Stored ${newItems.length} items to Redis`)
    } else {
      console.log('  No new items to store')
    }

    // 输出 JSON 结果供 GitHub Actions 使用
    console.log(JSON.stringify({
      source: source.slug,
      total: items.length,
      new: newItems.length,
      timestamp: Date.now()
    }))
  } catch (error) {
    console.error(`  ❌ Error: ${error}`)
    process.exit(1)
  }
}

main()
