import { describe, it, expect, vi, beforeEach } from 'vitest'

// 模拟 AI 用量埋点仓库：单元测试不连真实数据库（避免 ECONNREFUSED 噪音）
vi.mock('../db/ai-usage-repo', () => ({
  logAIUsage: vi.fn(),
}))

// 模拟提示词模板仓库：同属 DB 边界；默认未定制（回退默认模板）
vi.mock('../db/prompt-repo', () => ({
  getCustomPromptTemplate: vi.fn(),
}))

// 模拟 generateText 模块
vi.mock('ai', () => {
  const mockGenerateText = vi.fn()
  return {
    generateText: mockGenerateText,
    Output: {
      object: ({ schema }: { schema: unknown }) => ({ schema }),
    },
    NoObjectGeneratedError: class NoObjectGeneratedError extends Error {
      static isInstance(err: unknown): err is NoObjectGeneratedError {
        return err instanceof NoObjectGeneratedError
      }
      cause?: string
    },
    NoOutputGeneratedError: class NoOutputGeneratedError extends Error {
      static isInstance(err: unknown): err is NoOutputGeneratedError {
        return err instanceof NoOutputGeneratedError
      }
    },
  }
})

import { createAIService, estimateTokens, __resetPromptCacheForTest } from '../ai-service'
import { getCustomPromptTemplate } from '../db/prompt-repo'
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError } from 'ai'

function mockGenTextResult(output: unknown, text = '') {
  return {
    output,
    text,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    experimental_providerMetadata: {},
    warnings: [],
    response: {
      id: 'mock',
      modelId: 'mock',
      timestamp: new Date(),
      messages: [],
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetPromptCacheForTest()
  vi.mocked(getCustomPromptTemplate).mockResolvedValue(null)
})

describe('estimateTokens', () => {
  it('估算英文文本 token', () => {
    expect(estimateTokens('hello world')).toBe(3)
  })

  it('估算中文文本 token', () => {
    expect(estimateTokens('你好世界')).toBe(2)
  })

  it('估算混合文本', () => {
    expect(estimateTokens('hello 你好 world 世界')).toBe(6)
  })
})

describe('AIService - generateBatchSummary', () => {
  it('空 items 返回空数组', async () => {
    const service = createAIService()
    const result = await service.generateBatchSummary([])
    expect(result).toEqual([])
    expect(generateText).not.toHaveBeenCalled()
  })

  it('单批处理成功返回结果', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({
        results: [{ id: 'test:1', summary: '测试摘要', details: '测试详情' }],
      }),
    )

    const service = createAIService()
    const items = [{ id: 'test:1', title: 'Test Item', rawData: { description: 'test' } }]
    const result = await service.generateBatchSummary(items)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('test:1')
    expect(result[0].summary).toBe('测试摘要')
    expect(generateText).toHaveBeenCalledOnce()
  })

  it('大 items 自动分批', async () => {
    vi.mocked(generateText).mockResolvedValue(mockGenTextResult({ results: [] }))

    // 8 个超大 item，每个 ~125K tokens，应触发分批
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `test:${i}`,
      title: `Item ${i}`,
      rawData: { text: 'x'.repeat(500000) },
    }))

    const service = createAIService()
    await service.generateBatchSummary(items)

    // 应被分成 3 批
    expect(generateText).toHaveBeenCalledTimes(3)
  })
})

describe('AIService - generateSingleSummary', () => {
  it('单条摘要成功且 prompt 包含完整 readme', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({
        id: 'github:owner/repo',
        summary: '测试摘要',
        details: '测试详情',
      }),
    )
    const service = createAIService()
    const item = {
      id: 'github:owner/repo',
      title: 'owner/repo',
      rawData: {
        description: 'test desc',
        language: 'TypeScript',
        stars: 100,
        starsToday: 5,
        readme: '# Full README\n\nThis is the complete readme content.',
      },
    }
    const result = await service.generateSingleSummary(item)
    expect(result).toEqual({ id: 'github:owner/repo', summary: '测试摘要', details: '测试详情' })
    // 验证 prompt 把完整 readme 喂给了 AI
    const callArg = vi.mocked(generateText).mock.calls[0][0] as { prompt: string }
    expect(callArg.prompt).toContain('标题: owner/repo')
    expect(callArg.prompt).toContain('This is the complete readme content.')
  })
  it('无 readme 时 prompt 不包含 README 段落', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({ id: 'x', summary: 's', details: 'd' }),
    )
    const service = createAIService()
    await service.generateSingleSummary({ id: 'x', title: 'X', rawData: { description: 'd' } })
    const callArg = vi.mocked(generateText).mock.calls[0][0] as { prompt: string }
    expect(callArg.prompt).not.toContain('README 全文')
  })
  it('AI 调用失败返回 null', async () => {
    // 内部重试退避 ~6s，给足超时
    vi.mocked(generateText).mockRejectedValue(new Error('boom'))
    const service = createAIService()
    const result = await service.generateSingleSummary({
      id: 'x',
      title: null,
      rawData: { readme: 'big' },
    })
    expect(result).toBeNull()
  }, 20000)
})
describe('AIService - 提示词模板可配置', () => {
  const item = { id: 'github:o/r', title: 'o/r', rawData: { description: 'd' } }

  it('未定制时用默认模板（与历史行为一致）', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({ id: 'github:o/r', summary: 's', details: 'd' }),
    )
    await createAIService().generateSingleSummary(item)
    const callArg = vi.mocked(generateText).mock.calls[0][0] as { prompt: string }
    expect(callArg.prompt).toContain('请用中文详细分析以下 GitHub 仓库内容。')
    expect(callArg.prompt).toContain('描述: d')
  })

  it('已定制时用库里模板渲染', async () => {
    vi.mocked(getCustomPromptTemplate).mockResolvedValue('定制指令：分析 {{title}}（{{id}}）')
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({ id: 'github:o/r', summary: 's', details: 'd' }),
    )
    await createAIService().generateSingleSummary(item)
    const callArg = vi.mocked(generateText).mock.calls[0][0] as { prompt: string }
    // callAIWithRetry 会在模板后追加 JSON 输出约定行，故用包含断言
    expect(callArg.prompt).toContain('定制指令：分析 o/r（github:o/r）')
    expect(callArg.prompt).not.toContain('请用中文详细分析')
  })

  it('模板被缓存：单次进程内只查一次库', async () => {
    vi.mocked(generateText).mockResolvedValue(
      mockGenTextResult({ id: 'x', summary: 's', details: 'd' }),
    )
    const service = createAIService()
    await service.generateSingleSummary(item)
    await service.generateSingleSummary(item)
    expect(vi.mocked(getCustomPromptTemplate)).toHaveBeenCalledTimes(1)
    expect(generateText).toHaveBeenCalledTimes(2)
  })

  it('runSingleSummaryPrompt：成功时透出结果', async () => {
    const { runSingleSummaryPrompt } = await import('../ai-service')
    const rawJson = '{"id":"x","summary":"s","details":"d"}'
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({ id: 'x', summary: 's', details: 'd' }, rawJson),
    )
    const result = await runSingleSummaryPrompt('直接给的 prompt', { maxRetries: 1 })
    // 解析后 + 原始文本同时带出
    expect(result).toEqual({ result: { id: 'x', summary: 's', details: 'd' }, raw: rawJson })
    const callArg = vi.mocked(generateText).mock.calls[0][0] as { prompt: string }
    expect(callArg.prompt).toContain('直接给的 prompt')
  })

  it('超时中断（AbortError）直接回 null，不再重试', async () => {
    const { runSingleSummaryPrompt } = await import('../ai-service')
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    vi.mocked(generateText).mockRejectedValueOnce(abortError)
    const result = await runSingleSummaryPrompt('prompt', { maxRetries: 3, timeoutMs: 1000 })
    expect(result).toBeNull()
    // terminal：3 次机会只用 1 次
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1)
    // 超时信号确实透传给了 AI 调用
    const callArg = vi.mocked(generateText).mock.calls[0][0] as { abortSignal?: AbortSignal }
    expect(callArg.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('runSingleSummaryPrompt：失败返回 null', async () => {
    const { runSingleSummaryPrompt } = await import('../ai-service')
    vi.mocked(generateText).mockRejectedValueOnce(new Error('boom'))
    const result = await runSingleSummaryPrompt('prompt', { maxRetries: 1 })
    expect(result).toBeNull()
  })

  it('读库失败时回退默认模板继续跑（配置读不到不阻断 AI）', async () => {
    vi.mocked(getCustomPromptTemplate).mockRejectedValueOnce(new Error('db down'))
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({ id: 'github:o/r', summary: 's', details: 'd' }),
    )
    const result = await createAIService().generateSingleSummary(item)
    expect(result).not.toBeNull()
    const callArg = vi.mocked(generateText).mock.calls[0][0] as { prompt: string }
    expect(callArg.prompt).toContain('请用中文详细分析')
  })
})

describe('AIService - generateTopicAggregation', () => {
  it('items 少于 3 个返回空数组', async () => {
    const service = createAIService()
    const result = await service.generateTopicAggregation([
      { id: '1', title: 'a', summary: 's', details: 'd' },
    ])
    expect(result).toEqual([])
    expect(generateText).not.toHaveBeenCalled()
  })

  it('正常返回主题分组', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({
        groups: [
          { topic: 'AI 技术', summary: 'AI 相关新闻', itemIds: ['1', '2'] },
          { topic: '开发工具', summary: '工具类新闻', itemIds: ['3'] },
        ],
      }),
    )

    const service = createAIService()
    const items = [
      { id: '1', title: 'a', summary: 's', details: 'd' },
      { id: '2', title: 'b', summary: 's', details: 'd' },
      { id: '3', title: 'c', summary: 's', details: 'd' },
    ]
    const result = await service.generateTopicAggregation(items)

    expect(result).toHaveLength(2)
    expect(result[0].topic).toBe('AI 技术')
    expect(result[1].itemIds).toEqual(['3'])
  })
})

describe('AIService - 主题聚合补充分支', () => {
  const items3 = [
    { id: '1', title: 'a', summary: 's', details: 'd' },
    { id: '2', title: 'b', summary: 's', details: 'd' },
    { id: '3', title: 'c', summary: 's', details: 'd' },
  ]
  it('existingTopics 非空时注入历史上下文（含 summary 空值回退）', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({ groups: [{ topic: '旧主题', summary: 's', itemIds: ['1', '2'] }] }),
    )
    const service = createAIService()
    await service.generateTopicAggregation(items3, [{ topic: '旧主题', summary: '', itemCount: 2 }])
    const callArg = vi.mocked(generateText).mock.calls[0][0] as { prompt: string }
    expect(callArg.prompt).toContain('历史上下文')
    expect(callArg.prompt).toContain('无概括')
  })
  it('NoObjectGeneratedError 触发重试后成功（isNoOutput 退避分支）', async () => {
    vi.useFakeTimers()
    try {
      const noOut1 = new NoObjectGeneratedError('has message')
      const noOut2 = new NoObjectGeneratedError('')
      vi.mocked(generateText)
        .mockRejectedValueOnce(noOut1)
        .mockRejectedValueOnce(noOut2)
        .mockResolvedValueOnce(
          mockGenTextResult({ groups: [{ topic: 'T', summary: 's', itemIds: ['1', '2'] }] }),
        )
      const service = createAIService()
      const promise = service.generateTopicAggregation(items3)
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result).toHaveLength(1)
      expect(generateText).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
  it('全部失败时返回空数组（output 为 null 的回退分支）', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(generateText).mockRejectedValue(new Error('ai down'))
      const service = createAIService()
      const promise = service.generateTopicAggregation(items3)
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result).toEqual([])
      expect(generateText).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('推理模型适配（DeepSeek 思考模式）', () => {
  it('默认关闭思考模式，避免思维链耗尽输出预算', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({ id: 'x', summary: 's', details: 'd' }) as never,
    )
    const service = createAIService()
    await service.generateSingleSummary({ id: 'x', title: 't', rawData: {} })

    const callArg = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: Record<string, unknown>
    }
    expect(callArg.providerOptions).toEqual({
      'ai-provider': { thinking: { type: 'disabled' } },
    })
  })

  it('AI_THINKING=enabled 时不发送 thinking 参数（兼容不支持该参数的 provider）', async () => {
    process.env.AI_THINKING = 'enabled'
    try {
      vi.mocked(generateText).mockResolvedValueOnce(
        mockGenTextResult({ id: 'x', summary: 's', details: 'd' }) as never,
      )
      const service = createAIService()
      await service.generateSingleSummary({ id: 'x', title: 't', rawData: {} })

      const callArg = vi.mocked(generateText).mock.calls[0][0] as {
        providerOptions?: unknown
      }
      expect(callArg.providerOptions).toBeUndefined()
    } finally {
      delete process.env.AI_THINKING
    }
  })

  it('输出上限不被人为压低：不再传 8192/16000 之类的小额度', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockGenTextResult({ id: 'x', summary: 's', details: 'd' }) as never,
    )
    const service = createAIService()
    await service.generateSingleSummary({ id: 'x', title: 't', rawData: {} })

    const callArg = vi.mocked(generateText).mock.calls[0][0] as { maxOutputTokens: number }
    // 思维链与正文共享该预算，额度必须给足（DeepSeek 上限 384K）
    expect(callArg.maxOutputTokens).toBeGreaterThanOrEqual(384_000)
  })

  it('NoOutputGeneratedError（JSON 被截断/无输出）也按可重试错误处理', async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new NoOutputGeneratedError('No output generated.'))
      .mockResolvedValueOnce(mockGenTextResult({ id: 'x', summary: 's', details: 'd' }) as never)

    const service = createAIService()
    const result = await service.generateSingleSummary({ id: 'x', title: 't', rawData: {} })

    expect(generateText).toHaveBeenCalledTimes(2)
    expect(result).not.toBeNull()
    // 无输出类错误的退避基准为 5s，故放宽该用例超时
  }, 20_000)
})
