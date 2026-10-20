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

import {
  splitByPromptLen,
  itemPromptLen,
  hasAggregatableBatch,
  buildFallbackGroup,
} from '../topic-aggregate'

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

describe('hasAggregatableBatch - 是否存在可聚合子批', () => {
  it('子批均 >= 3 条 → 可聚合', () => {
    expect(hasAggregatableBatch([['a', 'b', 'c']])).toBe(true)
    expect(
      hasAggregatableBatch([
        ['a', 'b'],
        ['c', 'd', 'e'],
      ]),
    ).toBe(true)
  })

  it('回归防线：只有 1 条也算「可聚合」（阈值曾为 3，把低频源饿死）', () => {
    // 真实事故（2026-10）：阈值 3 + GitHub 每天净增 2-4 条
    // → 永远凑不满 → 主题组长期为 0 → 徽标计数、列表空白。
    // 现在 1 条即可聚合；空批才是真的没有可聚合内容。
    expect(hasAggregatableBatch([['a'], ['b', 'c']])).toBe(true)
    expect(hasAggregatableBatch([['a']])).toBe(true)
    expect(hasAggregatableBatch([])).toBe(false)
    expect(hasAggregatableBatch([[], []])).toBe(false)
  })

  it('回归防线：可聚合却 0 组产出时应判定失败（配合 shouldFailRun）', () => {
    // 线上 AI 聚类全线失败时，因「保留 pending」的刻意设计而以 success 退出，
    // 导致聚合停摆近 20 天无人察觉。此断言确保该场景能被识别为「存在可聚合子批」，
    // 从而在 totalGroups === 0 时抛错。
    const subBatches = [
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g'],
    ]
    expect(hasAggregatableBatch(subBatches)).toBe(true)
  })
})

describe('buildFallbackGroup - 小批量兜底成组', () => {
  it('条目为空时返回空数组', () => {
    expect(buildFallbackGroup([])).toEqual([])
  })

  it('用首条标题作主题名、各条摘要拼接概括', () => {
    const groups = buildFallbackGroup([
      { id: 'github:a/b', title: 'a/b', summary: '摘要一' },
      { id: 'github:c/d', title: 'c/d', summary: '摘要二' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].topic).toBe('a/b')
    expect(groups[0].summary).toContain('摘要一')
    expect(groups[0].summary).toContain('摘要二')
    expect(groups[0].itemIds).toEqual(['github:a/b', 'github:c/d'])
  })

  it('缺摘要时给出占位概括（不留空串）', () => {
    const groups = buildFallbackGroup([{ id: 'x:1', title: '标题', summary: null }])
    expect(groups[0].summary.length).toBeGreaterThan(0)
  })

  it('缺标题时给出兜底主题名', () => {
    const groups = buildFallbackGroup([{ id: 'x:1', title: null, summary: null }])
    expect(groups[0].topic.length).toBeGreaterThan(0)
  })
})
