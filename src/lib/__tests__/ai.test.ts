import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// mock 'ai' 模块的 generateText
vi.mock('ai', () => ({
  generateText: vi.fn(),
}))
import { generateText } from 'ai'
import { aiSummarize, aiSummarizeWithRetry } from '../ai'

describe('aiSummarize', () => {
  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    vi.stubEnv('AI_BASE_URL', 'http://localhost:9999/v1')
    vi.stubEnv('AI_MODEL', 'test-model')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('无 API key 时返回空字符串', async () => {
    vi.stubEnv('AI_API_KEY', '')
    const result = await aiSummarize({ prompt: 'hello' })
    expect(result).toBe('')
    expect(generateText).not.toHaveBeenCalled()
  })

  it('成功时返回 trim 后的文本', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '  摘要内容  ' } as never)
    const result = await aiSummarize({
      prompt: 'summarize',
      system: 'sys',
      maxOutputTokens: 512,
      temperature: 0.1,
    })
    expect(result).toBe('摘要内容')
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'summarize',
        system: 'sys',
        maxOutputTokens: 512,
        temperature: 0.1,
      }),
    )
  })

  it('AI 调用异常时返回空字符串', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('api down'))
    const result = await aiSummarize({ prompt: 'x' })
    expect(result).toBe('')
  })

  it('使用默认 system 提示词', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: 'ok' } as never)
    await aiSummarize({ prompt: 'x' })
    const arg = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>
    expect(arg.system).toContain('内容分析助手')
  })
})

describe('aiSummarizeWithRetry', () => {
  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('第一次成功即返回', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: 'ok' } as never)
    const result = await aiSummarizeWithRetry({ prompt: 'x' })
    expect(result).toBe('ok')
    expect(generateText).toHaveBeenCalledTimes(1)
  })

  it('连续失败后重试，最终返回空字符串', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('down'))
    const p = aiSummarizeWithRetry({ prompt: 'x' }, 3)
    await vi.runAllTimersAsync()
    const result = await p
    expect(result).toBe('')
    expect(generateText).toHaveBeenCalledTimes(3)
  })
})
