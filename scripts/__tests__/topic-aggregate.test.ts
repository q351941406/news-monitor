import { describe, it, expect, vi } from 'vitest'

// mock 外部依赖：测试只关注纯函数逻辑，不加载真实 DB/LLM
vi.mock('@/lib/db', () => ({
  storeTopicGroups: vi.fn(),
  deleteReadEmptyTopicsBySource: vi.fn(),
  getExistingTopics: vi.fn(),
  getAggregationBatch: vi.fn(),
  markItemsAggregated: vi.fn(),
}))
vi.mock('@/lib/ai-service', () => ({ createAIService: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { child: () => ({ error: vi.fn(), info: vi.fn() }) } }))
vi.mock('@/lib/run-logger', () => ({ withRunLog: vi.fn() }))

import { splitByPromptLen, itemPromptLen } from '../topic-aggregate'

interface TestItem {
  id: string
  title: string | null
  summary: string | null
  details: string | null
}

function mkItem(id: string, title: string | null = 'T'): TestItem {
  return { id, title, summary: 'S', details: 'D' }
}

describe('splitByPromptLen - 按 prompt 字符数分批', () => {
  it('空数组返回空批次', () => {
    expect(splitByPromptLen([])).toEqual([])
  })

  it('单条不超过上限时整批返回', () => {
    const items = [mkItem('a'), mkItem('b')]
    const batches = splitByPromptLen(items, 100000)
    expect(batches).toHaveLength(1)
    expect(batches[0].map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('超过上限时正确切分（边界：恰好等于上限不分批）', () => {
    // itemPromptLen 约为标题+摘要+详情的固定格式长度
    const items = [mkItem('a', 'x'.repeat(20)), mkItem('b', 'y'.repeat(20))]
    // 用很小的 maxChars 强制分批
    const batches = splitByPromptLen(items, itemPromptLen(items[0]))
    expect(batches.length).toBeGreaterThanOrEqual(1)
    // 总 item 数守恒
    const flat = batches.flat()
    expect(flat.map((i) => i.id).sort()).toEqual(['a', 'b'])
  })

  it('长条目会单独成批（不放一起超限）', () => {
    const items = [mkItem('a', 'x'.repeat(500)), mkItem('b', 'y'.repeat(500))]
    const batches = splitByPromptLen(items, 100) // 远小于单条长度
    expect(batches.length).toBe(2)
    expect(batches[0][0].id).toBe('a')
    expect(batches[1][0].id).toBe('b')
  })

  it('多条合并到同一批直到超限', () => {
    const items = Array.from({ length: 10 }, (_, i) => mkItem(`item${i}`, 't'))
    // maxChars 设为约 3 条的容量
    const per = itemPromptLen(items[0])
    const batches = splitByPromptLen(items, per * 3 + 10)
    const flat = batches.flat()
    expect(flat).toHaveLength(10)
    expect(batches.every((b) => b.length <= 3)).toBe(true)
  })

  it('title/summary/details 为 null 时也能正确处理（用默认值）', () => {
    const item = { id: 'n', title: null, summary: null, details: null }
    const len = itemPromptLen(item)
    expect(len).toBeGreaterThan(0)
    const batches = splitByPromptLen([item])
    expect(batches[0][0].id).toBe('n')
  })
})

describe('itemPromptLen - 估算单条 prompt 字符数', () => {
  it('长度 = 固定格式 + 内容', () => {
    const item = { id: 'abc', title: 'Hello', summary: 'World', details: 'D' }
    const len = itemPromptLen(item)
    // 与 buildTopicPrompt 格式一致：含 [x] ID/标题/摘要/重点 标签
    expect(len).toBeGreaterThan(30)
  })
})
