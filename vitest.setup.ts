/**
 * Vitest 全局测试环境
 *
 * 核心防线：测试环境永远不真实调用 LLM API。
 *
 * 真实 LLM 调用的唯一出口是 `ai` 包的 `generateText`（createClient 只是
 * 构造 model 对象，不发网络请求）。这里在全局 mock `ai` 模块：
 * - 默认 generateText 抛"哨兵错误"：任何测试忘记显式 mock 而触发 AI 调用
 *   时，立刻失败并提示，而不是真的发出 LLM 请求（避免慢、贵、不确定）
 * - 测试文件可用文件级 `vi.mock('ai', ...)` 覆盖（优先级更高），
 *   例如 ai-service.test.ts 需要测试重试/分批逻辑时显式提供假响应
 */
import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

vi.mock('ai', () => {
  const mockGenerateText = vi.fn().mockImplementation(() => {
    throw new Error(
      '[测试防护] generateText 被调用但未显式 mock：测试环境禁止真实调用 LLM API。' +
        "请在该测试文件中 vi.mock('ai') 并提供假响应。",
    )
  })
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
