import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

// DeepSeek 兼容 OpenAI API
const deepseek = createOpenAI({
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

const model = deepseek(process.env.ANTHROPIC_MODEL || 'deepseek-v4-flash')

export interface AIOptions {
  system?: string
  prompt: string
  maxOutputTokens?: number
  temperature?: number
}

export async function aiSummarize(options: AIOptions): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  ⚠️ AI API key not configured, skipping AI processing')
    return ''
  }

  try {
    const { text } = await generateText({
      model,
      system: options.system || '你是一个专业的内容分析助手，擅长翻译和总结技术内容。输出简洁、有吸引力，适合群组分享。',
      prompt: options.prompt,
      maxOutputTokens: options.maxOutputTokens || 1024,
      temperature: options.temperature || 0.3,
    })

    return text.trim()
  } catch (error) {
    console.error('  ❌ AI processing error:', error)
    return ''
  }
}

// 批量处理，支持重试
export async function aiSummarizeWithRetry(
  options: AIOptions,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await aiSummarize(options)
    if (result) return result

    if (attempt < maxRetries) {
      const waitTime = 2000 * attempt
      console.log(`  ⏳ Retry ${attempt}/${maxRetries} in ${waitTime}ms...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  return ''
}
