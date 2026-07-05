/**
 * 主题聚合脚本 - 基于 AI 摘要动态生成主题分组
 * 用法: npx tsx scripts/topic-aggregate.ts --source=github
 */
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createAnthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { rawItems, aiAnalysis } from '../src/lib/schema'
import { storeTopicGroups } from '../src/lib/db'

// AI 配置
const anthropic = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

const model = anthropic(process.env.ANTHROPIC_MODEL || 'deepseek-v4-flash')

// 结果 schema
const topicSchema = z.object({
  groups: z.array(z.object({
    topic: z.string().describe('主题名称，简洁明了'),
    summary: z.string().describe('该主题的一句话概括'),
    itemIds: z.array(z.string()).describe('该主题包含的新闻 ID'),
  }))
})

// 数据库连接
function getDb() {
  const sqlClient = neon(process.env.DATABASE_URL!)
  return drizzle(sqlClient)
}

// 获取未读的 AI 摘要
async function getUnreadSummaries(source: string) {
  const db = getDb()

  const results = await db.select({
    id: rawItems.id,
    title: rawItems.title,
    summary: aiAnalysis.summary,
    details: aiAnalysis.details,
  })
    .from(rawItems)
    .leftJoin(aiAnalysis, eq(rawItems.id, aiAnalysis.itemId))
    .where(
      and(
        eq(rawItems.source, source),
        eq(rawItems.isRead, false)
      )
    )
    .orderBy(desc(rawItems.fetchedAt))
    .limit(50)

  return results.filter(r => r.summary) // 只取有摘要的
}

// 构建 prompt
function buildPrompt(items: Array<{ id: string; title: string | null; summary: string | null; details: string | null }>): string {
  const content = items.map((item, i) => {
    return `[${i + 1}] ID: ${item.id}
标题: ${item.title || '无'}
摘要: ${item.summary || '无'}
重点: ${item.details || '无'}`
  }).join('\n---\n')

  return `请分析以下 ${items.length} 条内容，将相关的内容聚合到一起。

${content}

每个主题包含：topic（主题名称）、summary（一句话概括）、itemIds（包含的新闻 ID）。
itemIds 使用每条开头的 ID 字段值。`
}

// 主题聚合函数
async function aggregateTopics(source: string) {
  console.log(`\n[${new Date().toISOString()}] Aggregating topics for ${source}...`)

  // 1. 获取未读摘要
  const items = await getUnreadSummaries(source)
  console.log(`  Found ${items.length} unread items with summaries`)

  if (items.length === 0) {
    console.log('  No items to aggregate')
    return
  }

  // 如果数据太少，跳过聚合
  if (items.length < 3) {
    console.log('  Too few items for aggregation, skipping')
    return
  }

  // 2. 构建 prompt
  const prompt = buildPrompt(items)

  // 3. 调用 AI（带重试）
  console.log(`  Calling AI for topic aggregation...`)
  let object
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await generateObject({
        model,
        schema: topicSchema,
        prompt,
        maxOutputTokens: 16000,
      })
      object = result.object
      break
    } catch (error) {
      console.log(`  ⚠️ Attempt ${attempt}/3 failed: ${error}`)
      if (attempt === 3) {
        console.log('  ❌ All attempts failed, skipping topic aggregation')
        return
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  if (!object || !object.groups || object.groups.length === 0) {
    console.log('  ❌ No topics generated')
    return
  }

  console.log(`  AI returned ${object.groups.length} topics`)

  // 4. 存储主题聚合
  await storeTopicGroups(source, object.groups)

  console.log(`  ✅ Stored ${object.groups.length} topic groups`)
}

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find(a => a.startsWith('--source='))
  const source = sourceArg?.split('=')[1]

  if (!source) {
    console.error('Usage: npx tsx scripts/topic-aggregate.ts --source=<slug>')
    console.error('Available sources: github, producthunt, twitter')
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not configured')
    process.exit(1)
  }

  await aggregateTopics(source)
}

main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
