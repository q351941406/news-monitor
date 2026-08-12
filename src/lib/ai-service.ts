/**
 * AIService — AI 调用接缝模块
 *
 * 接口小，实现深。生产环境调真实 LLM，测试时通过 vi.mock 替换。
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { logAIUsage } from './db/ai-usage-repo'
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
  /**
   * 单条详细摘要：一条内容一个 prompt，rawData 全量喂给 AI（如 readme）。
   * 用于内容体积大的 source（如 github），避免批量塞爆上下文。
   * 返回 null 表示 AI 调用失败（已内部重试）。
   */
  generateSingleSummary(item: {
    id: string
    title: string | null
    rawData: unknown
  }): Promise<BatchSummaryResult | null>
  /** 主题聚合：基于已有摘要 + 已有主题列表（历史上下文），将 items 聚合/归并到主题下 */
  generateTopicAggregation(
    items: Array<{
      id: string
      title: string | null
      summary: string | null
      details: string | null
    }>,
    existingTopics: Array<{ topic: string; summary: string; itemCount: number }>,
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

const singleSchema = z.object({
  id: z.string().describe('原始数据的 ID'),
  summary: z.string().describe('一句话概括核心内容'),
  details: z.string().describe('补充重要信息，可以自由发挥'),
})
const topicSchema = z.object({
  groups: z.array(
    z.object({
      topic: z
        .string()
        .describe(
          '主题名称：简洁核心名（≤12字），禁止括号、禁止包含平台/工具/家族等细节，如「游戏作弊与外挂工具」；细节一律放 summary',
        ),
      summary: z
        .string()
        .describe(
          '该主题的完整概括：把平台、工具、具体细节（如 Roblox/Minecraft/Aimbot 等）全部写在这里',
        ),
      itemIds: z
        .array(z.string())
        .describe(
          '该主题包含的新闻 ID，必须使用完整 ID（如 github:owner/repo），禁止使用序号 [1] 或缩写',
        ),
    }),
  ),
})

function createClient() {
  const provider = createOpenAICompatible({
    name: 'ai-provider',
    baseURL: process.env.AI_BASE_URL || 'https://opencode.ai/zen/go/v1',
    apiKey: process.env.AI_API_KEY || '',
  })
  return provider(process.env.AI_MODEL || 'deepseek-v4-flash')
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

function buildSingleSummaryPrompt(item: {
  id: string
  title: string | null
  rawData: unknown
}): string {
  const data = item.rawData as Record<string, unknown>
  let keyInfo = ''
  if (data.description) keyInfo += `描述: ${data.description}\n`
  if (data.language) keyInfo += `语言: ${data.language}\n`
  if (data.stars) keyInfo += `Stars: ${data.stars}\n`
  if (data.starsToday) keyInfo += `今日新增 Stars: ${data.starsToday}\n`
  const readmeBlock =
    typeof data.readme === 'string' && data.readme
      ? `\nREADME 全文（可能含 HTML，忽略其中的图片/徽章/样式）：\n${data.readme}\n`
      : ''
  return `请用中文详细分析以下 GitHub 仓库内容。
ID: ${item.id}
标题: ${item.title || '无'}
${keyInfo}${readmeBlock}
要求：
- 摘要：详细概括仓库核心内容，包含关键背景和上下文
- 重点：提取所有重要细节、技术要点、应用场景、特性
严格按以下 JSON 结构输出：
{"id":"${item.id}","summary":"一句话概括","details":"补充信息"}
- id 必须原样返回，不要改动
- 保留原文中的具体数据、技术术语、关键信息`
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
严格按以下 JSON 结构输出（顶层 key 必须是 results，数组里每个对象三个字段）：
{"results":[{"id":"完整ID","summary":"一句话概括","details":"补充信息"}]}
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
  existingTopics: Array<{ topic: string; summary: string; itemCount: number }> = [],
): string {
  const content = items
    .map((item, i) => {
      return `条目 ${i + 1}
ID: "${item.id}"
标题: ${item.title || '无'}
摘要: ${item.summary || '无'}
重点: ${item.details || '无'}`
    })
    .join('\n---\n')
  // 注入全部已有主题作为历史上下文，让 AI 有全局视角、避免碎片化
  // 注入完整主题名 + 概括（summary 是 AI 判断「两个主题是否相同」的关键，
  // 截断会导致同义主题无法合并 → 碎片化。prompt 体积问题由「每轮 30 条」控制）
  const history = existingTopics
    .map((t) => `- ${t.topic}：${t.summary || '无概括'}（当前 ${t.itemCount} 条）`)
    .join('\n')
  const historyBlock =
    existingTopics.length > 0
      ? `\n以下是你之前已经建立的全部主题（历史上下文）：\n${history}\n`
      : ''
  return `请分析以下 ${items.length} 条内容，将相关的内容聚合到一起。${historyBlock}
规则：
- 已有主题是你的「当前知识」：可以把新内容归并进去；也可以**修改已有主题**——
  合并相近主题、重命名成更准确的名称、调整概括，让整个主题体系更整洁
- 已有主题后的「（当前 N 条）」是它的规模：新内容优先归入已有规模的主题；
  只有零散或明显同义的小主题才考虑合并，且合并后名称保持准确、简短
- 只有确实无法归入任何已有主题的新方向，才创建新主题（数量尽量少）
- 同类或相似内容最好合并为一个主题，禁止为同类内容重复建主题
- 输出**全部相关主题**（包括你有把握的已有主题 + 新建主题），不要遗漏任何一条内容
${content}
每个主题包含：topic（主题名称，必须简洁：≤12字、无括号、无平台/工具细节）、summary（完整概括：平台/工具/细节全放这里）、itemIds（包含的新闻 ID）。
规则：同类内容的 topic 名称必须完全一致（如「游戏作弊与外挂工具」），禁止用括号加细节区分。
itemIds 必须**原样照抄**条目中 ID: 后面引号内的完整值（如 "github:owner/repo"、"ph:123"、"x:456"），
**绝对不要**省略前缀、**绝对不要**使用「条目 N」序号或自行改写。
严格按以下 JSON 结构输出（顶层 key 必须是 groups，数组里每个对象三个字段）：
{"groups":[{"topic":"主题名","summary":"完整概括","itemIds":["完整ID1","完整ID2"]}]}`
}

async function callAIWithRetry<T>(
  model: ReturnType<typeof createClient>,
  schema: z.ZodSchema<T>,
  prompt: string,
  maxRetries: number = 3,
  maxOutputTokens: number = 384000,
  operation: string = 'batchSummarize',
): Promise<T | null> {
  const startedAt = Date.now()
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateText({
        model,
        output: Output.object({ schema }),
        maxOutputTokens,
        // OpenAI 兼容协议：json_object 模式要求 prompt 含 "json" 字样；
        // 思考模式由服务端（deepseek reasoning）默认开启，无需 providerOptions
        prompt: `${prompt}\n\n严格以 JSON 格式输出，不要包含任何 JSON 以外的内容。`,
      })
      // AI 用量埋点（fire-and-forget）：输入/输出 token、耗时、成败
      const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage
      void logAIUsage({
        operation,
        inputTokens: usage?.inputTokens ?? estimateTokens(prompt),
        outputTokens: usage?.outputTokens ?? 0,
        durationMs: Date.now() - startedAt,
        status: 'success',
        attempts: attempt,
      })
      return result.output as T
    } catch (error) {
      const isNoOutput = NoObjectGeneratedError.isInstance(error)
      const errObj = error as { cause?: unknown; message?: string; constructor?: { name?: string } }
      // 失败诊断：打印 prompt 规模 + 错误细节，便于定位（如 prompt 过长 / 内容异常）
      console.log(
        `  📊 Attempt ${attempt}/${maxRetries} | prompt=${prompt.length} chars | model=${process.env.AI_MODEL || 'default'}`,
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
        // 记录失败埋点（实际尝试次数）后退出
        void logAIUsage({
          operation,
          inputTokens: estimateTokens(prompt),
          outputTokens: 0,
          durationMs: Date.now() - startedAt,
          status: 'failure',
          attempts: attempt,
        })
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

        const output = await callAIWithRetry(
          model,
          batchSchema,
          prompt,
          3,
          100000,
          'batchSummarize',
        )
        if (output?.results) {
          allResults.push(...output.results)
        }
      }

      return allResults
    },

    async generateSingleSummary(item) {
      const prompt = buildSingleSummaryPrompt(item)
      const output = await callAIWithRetry(model, singleSchema, prompt, 3, 8192, 'singleSummary')
      return output || null
    },
    async generateTopicAggregation(items, existingTopics) {
      if (items.length < 3) return []
      const prompt = buildTopicPrompt(items, existingTopics)
      const output = await callAIWithRetry(model, topicSchema, prompt, 3, 16000, 'topicAggregation')
      return output?.groups || []
    },
  }
}
