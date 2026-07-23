/**
 * AIService — AI 调用接缝模块
 *
 * 接口小，实现深。生产环境调真实 LLM，测试时通过 vi.mock 替换。
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { z } from 'zod'

// ─── 类型定义 ───────────────────────────────────────────

export interface BatchSummaryResult {
  id: string
  summary: string
  details: string
}

export interface TopicGroup {
  topic: string
  summary: string
  itemIds: string[]
}

// ─── 接口 ───────────────────────────────────────────────

export interface AIService {
  /** 批量生成摘要：对 items 分批，每批调一次 LLM */
  generateBatchSummary(
    items: Array<{ id: string; title: string | null; rawData: unknown }>,
  ): Promise<BatchSummaryResult[]>

  /** 主题聚合：基于已有摘要，将相关 items 聚合到主题下 */
  generateTopicAggregation(
    items: Array<{
      id: string
      title: string | null
      summary: string | null
      details: string | null
    }>,
  ): Promise<TopicGroup[]>
}

// ─── 生产实现 ───────────────────────────────────────────

const MAX_CONTEXT_TOKENS = 500000

const batchSchema = z.object({
  results: z.array(
    z.object({
      id: z.string().describe('原始数据的 ID'),
      summary: z.string().describe('一句话概括核心内容'),
      details: z.string().describe('补充重要信息，可以自由发挥'),
    }),
  ),
})

const topicSchema = z.object({
  groups: z.array(
    z.object({
      topic: z.string().describe('主题名称，简洁明了'),
      summary: z.string().describe('该主题的一句话概括'),
      itemIds: z.array(z.string()).describe('该主题包含的新闻 ID'),
    }),
  ),
})

function createClient() {
  const anthropic = createAnthropic({
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  })
  return anthropic(process.env.ANTHROPIC_MODEL || 'deepseek-v4-flash')
}

/** 估算 token 数量（中文约 2 字符/token，英文约 4 字符/token） */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 2 + otherChars / 4)
}

/** 动态分批：确保每批不超过 MAX_CONTEXT_TOKENS */
function splitBatches<T>(
  items: T[],
  estimateFn: (item: T) => number,
  maxTokens: number = MAX_CONTEXT_TOKENS,
): T[][] {
  const batches: T[][] = []
  let currentBatch: T[] = []
  let currentTokens = 0

  for (const item of items) {
    const itemTokens = estimateFn(item)
    if (currentTokens + itemTokens > maxTokens && currentBatch.length > 0) {
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
  return batches
}

function buildBatchPrompt(
  items: Array<{ id: string; title: string | null; rawData: unknown }>,
): string {
  const content = items
    .map((item, i) => {
      const data = item.rawData as Record<string, unknown>
      let keyInfo = ''
      if (data.description) keyInfo += `描述: ${data.description}\n`
      if (data.tagline) keyInfo += `标语: ${data.tagline}\n`
      if (data.text) keyInfo += `内容: ${data.text}\n`
      if (data.language) keyInfo += `语言: ${data.language}\n`
      if (data.stars) keyInfo += `Stars: ${data.stars}\n`
      return `[${i + 1}] ID: ${item.id}
标题: ${item.title || '无'}
${keyInfo}`
    })
    .join('\n---\n')

  return `请用中文详细分析以下 ${items.length} 条内容。
${content}
要求：
- 每条返回 id、摘要、重点
- 摘要：详细概括核心内容，包含关键背景和上下文
- 重点：提取所有重要细节、技术要点、应用场景
- 保留原文中的具体数据、技术术语、关键信息
- 按顺序返回，不要遗漏任何一条`
}

function buildTopicPrompt(
  items: Array<{
    id: string
    title: string | null
    summary: string | null
    details: string | null
  }>,
): string {
  const content = items
    .map((item, i) => {
      return `[${i + 1}] ID: ${item.id}
标题: ${item.title || '无'}
摘要: ${item.summary || '无'}
重点: ${item.details || '无'}`
    })
    .join('\n---\n')

  return `请分析以下 ${items.length} 条内容，将相关的内容聚合到一起。
${content}
每个主题包含：topic（主题名称）、summary（一句话概括）、itemIds（包含的新闻 ID）。
itemIds 使用每条开头的 ID 字段值。`
}

async function callAIWithRetry<T>(
  model: ReturnType<typeof createClient>,
  schema: z.ZodSchema<T>,
  prompt: string,
  maxRetries: number = 3,
  maxOutputTokens: number = 100000,
): Promise<T | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateText({
        model,
        output: Output.object({ schema }),
        prompt,
        maxOutputTokens,
      })
      return result.output as T
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        console.log(`  ⚠️ Attempt ${attempt}/${maxRetries} failed: ${error.cause}`)
      } else {
        console.log(`  ⚠️ Attempt ${attempt}/${maxRetries} failed: ${error}`)
      }
      if (attempt === maxRetries) {
        console.log('  ❌ All attempts failed')
        return null
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }
  }
  return null
}

// ─── Factory ────────────────────────────────────────────

export function createAIService(): AIService {
  const model = createClient()

  return {
    async generateBatchSummary(items) {
      if (items.length === 0) return []

      const batches = splitBatches(items, (item) => estimateTokens(JSON.stringify(item.rawData)))
      const allResults: BatchSummaryResult[] = []

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        console.log(`  Batch ${i + 1}/${batches.length} (${batch.length} items)`)
        const prompt = buildBatchPrompt(batch)

        const output = await callAIWithRetry(model, batchSchema, prompt, 3, 100000)
        if (output?.results) {
          allResults.push(...output.results)
        }
      }

      return allResults
    },

    async generateTopicAggregation(items) {
      if (items.length < 3) return []

      const prompt = buildTopicPrompt(items)
      const output = await callAIWithRetry(model, topicSchema, prompt, 3, 16000)
      return output?.groups || []
    },
  }
}
