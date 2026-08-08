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

  /** 主题聚合：基于已有摘要 + 已有主题列表（历史上下文），将 items 聚合/归并到主题下 */
  generateTopicAggregation(
    items: Array<{
      id: string
      title: string | null
      summary: string | null
      details: string | null
    }>,
    existingTopics: Array<{ topic: string; summary: string }>,
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
  existingTopics: Array<{ topic: string; summary: string }> = [],
): string {
  const content = items
    .map((item, i) => {
      return `[${i + 1}] ID: ${item.id}
标题: ${item.title || '无'}
摘要: ${item.summary || '无'}
重点: ${item.details || '无'}`
    })
    .join('\n---\n')
  // 注入全部已有主题作为历史上下文（不再截断），让 AI 有全局视角、避免碎片化
  const history = existingTopics.map((t) => `- ${t.topic}：${t.summary || '无概括'}`).join('\n')
  const historyBlock =
    existingTopics.length > 0
      ? `\n以下是你之前已经建立的全部主题（历史上下文）：\n${history}\n`
      : ''
  return `请分析以下 ${items.length} 条内容，将相关的内容聚合到一起。${historyBlock}
规则：
- 已有主题是你的「当前知识」：可以把新内容归并进去；也可以**修改已有主题**——
  合并相近主题、重命名成更准确的名称、调整概括，让整个主题体系更整洁
- 只有确实无法归入任何已有主题的新方向，才创建新主题（数量尽量少）
- 同类内容必须合并为一个主题，禁止为同类内容重复建主题
- 输出**全部相关主题**（包括你有把握的已有主题 + 新建主题），不要遗漏任何一条内容
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
      const isNoOutput = NoObjectGeneratedError.isInstance(error)
      const errObj = error as { cause?: unknown; message?: string; constructor?: { name?: string } }
      // 失败诊断：打印 prompt 规模 + 错误细节，便于定位（如 prompt 过长 / 内容异常）
      console.log(
        `  📊 Attempt ${attempt}/${maxRetries} | prompt=${prompt.length} chars | model=${process.env.ANTHROPIC_MODEL || 'default'}`,
      )
      if (isNoOutput) {
        console.log(`  ⚠️ NoObjectGeneratedError: ${errObj.cause || errObj.message || error}`)
      } else {
        console.log(`  ⚠️ ${errObj.constructor?.name || 'Error'}: ${errObj.message || error}`)
        // 展开 cause（AI SDK 常在 cause 里带原始响应）
        if (errObj.cause) {
          const causeStr =
            typeof errObj.cause === 'string' ? errObj.cause : JSON.stringify(errObj.cause)
          console.log(`  🔍 cause: ${causeStr.slice(0, 500)}`)
        }
      }
      if (attempt === maxRetries) {
        console.log('  ❌ All attempts failed')
        return null
      }
      // NoOutput/瞬时错误：指数退避 + 30% 抖动（对齐 retry.ts），给 DeepSeek 更多恢复时间
      // 普通错误：短退避即可
      const baseMs = isNoOutput ? 5000 : 2000
      const backoff = baseMs * Math.pow(2, attempt - 1)
      const jitter = backoff * 0.3 * Math.random()
      const delay = Math.round(backoff + jitter)
      console.log(`  ⏳ Retrying in ${(delay / 1000).toFixed(1)}s...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
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

    async generateTopicAggregation(items, existingTopics) {
      if (items.length < 3) return []
      const prompt = buildTopicPrompt(items, existingTopics)
      const output = await callAIWithRetry(model, topicSchema, prompt, 3, 16000)
      return output?.groups || []
    },
  }
}
