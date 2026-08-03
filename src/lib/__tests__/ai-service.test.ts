import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  }
})

import { createAIService, estimateTokens } from '../ai-service'
import { generateText } from 'ai'

function mockGenTextResult(output: unknown) {
  return {
    output,
    text: '',
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
