/**
 * AI 批处理脚本 - 处理未分析的内容
 * 用法: npx tsx scripts/ai-process.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createAnthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, isNull, and, sql } from 'drizzle-orm'
import { rawItems, aiAnalysis } from '../src/lib/schema'

// AI 配置
const anthropic = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

const model = anthropic(process.env.ANTHROPIC_MODEL || 'deepseek-v4-flash')

// 结果 schema
const batchSchema = z.object({
  results: z.array(z.object({
    id: z.string().describe('原始数据的 ID'),
    summary: z.string().describe('一句话概括核心内容'),
    details: z.string().describe('补充重要信息，可以自由发挥'),
  }))
})

// 数据库连接
function getDb() {
  const sqlClient = neon(process.env.DATABASE_URL!)
  return drizzle(sqlClient)
}

// 获取未处理的数据
async function getUnprocessedItems(source: string, limit: number = 50) {
  const db = getDb()

  const results = await db.select({
    id: rawItems.id,
    title: rawItems.title,
    rawData: rawItems.rawData,
  })
    .from(rawItems)
    .leftJoin(aiAnalysis, eq(rawItems.id, aiAnalysis.itemId))
    .where(
      and(eq(rawItems.source, source), isNull(aiAnalysis.itemId))
    )
    .limit(limit)

  return results
}

// 构建 prompt
function buildPrompt(items: Array<{ id: string; title: string | null; rawData: unknown }>): string {
  const content = items.map((item, i) => {
    const data = item.rawData as Record<string, unknown>

    // 根据数据源提取关键信息
    let keyInfo = ''
    if (data.description) keyInfo += `描述: ${data.description}\n`
    if (data.tagline) keyInfo += `标语: ${data.tagline}\n`
    if (data.text) keyInfo += `内容: ${data.text}\n`
    if (data.language) keyInfo += `语言: ${data.language}\n`
    if (data.stars) keyInfo += `Stars: ${data.stars}\n`

    return `[${i + 1}] ID: ${item.id}
标题: ${item.title || '无'}
${keyInfo}`
  }).join('\n---\n')

  return `请用中文详细分析以下 ${items.length} 条内容。

${content}

要求：
- 每条返回 id、摘要、重点
- 摘要：详细概括核心内容，包含关键背景和上下文
- 重点：提取所有重要细节、技术要点、应用场景
- 保留原文中的具体数据、技术术语、关键信息
- 按顺序返回，不要遗漏任何一条`
}

// 估算 token 数量（中文约 2 字符/token，英文约 4 字符/token）
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 2 + otherChars / 4)
}

// 批处理函数
async function processBatch(source: string) {
  console.log(`\n[${new Date().toISOString()}] Processing ${source}...`)

  // 1. 查询未处理数据
  const allItems = await getUnprocessedItems(source, 50)
  console.log(`  Found ${allItems.length} unprocessed items`)

  if (allItems.length === 0) {
    console.log('  No items to process')
    return
  }

  // 2. 动态分批：确保每批不超过 500K token
  const MAX_CONTEXT_TOKENS = 500000
  const batches: typeof allItems[] = []
  let currentBatch: typeof allItems = []
  let currentTokens = 0

  for (const item of allItems) {
    const itemTokens = estimateTokens(JSON.stringify(item.rawData))

    if (currentTokens + itemTokens > MAX_CONTEXT_TOKENS && currentBatch.length > 0) {
      batches.push(currentBatch)
      currentBatch = []
      currentTokens = 0
    }

    currentBatch.push(item)
    currentTokens += itemTokens
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  console.log(`  Split into ${batches.length} batches`)

  // 3. 逐批处理
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    console.log(`\n  Batch ${i + 1}/${batches.length} (${batch.length} items)`)

    const prompt = buildPrompt(batch)

    console.log(`  Calling AI...`)
    const { object } = await generateObject({
      model,
      schema: batchSchema,
      prompt,
      maxOutputTokens: 100000,
    })

    console.log(`  AI returned ${object.results.length} results`)

    // 批量存储
    const db = getDb()
    let successCount = 0

    for (const result of object.results) {
      try {
        await db.insert(aiAnalysis)
          .values({
            itemId: result.id,
            summary: result.summary,
            details: result.details,
          })
          .onConflictDoUpdate({
            target: aiAnalysis.itemId,
            set: {
              summary: result.summary,
              details: result.details,
              processedAt: new Date(),
            },
          })
        successCount++
      } catch (error) {
        console.error(`  ❌ Failed to store result for ${result.id}:`, error)
      }
    }

    console.log(`  ✅ Stored ${successCount}/${object.results.length} results`)
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find(a => a.startsWith('--source='))
  const source = sourceArg?.split('=')[1]

  if (!source) {
    console.error('Usage: npx tsx scripts/ai-process.ts --source=<slug>')
    console.error('Available sources: github, producthunt, twitter')
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not configured')
    process.exit(1)
  }

  await processBatch(source)
}

main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
