/**
 * Twitter 端到端链路集成测试（独立文件）
 *
 * 依赖 child_process.execSync + @/lib/retry 的文件级 mock，
 * 与 github/producthunt 链路拆开，避免 vi.mock 文件作用域相互污染。
 *
 * 链路：mock CLI（execSync）→ 真实解析 → storeRawItems（真 DB）→ 可查询
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
// 必须在 import 前 mock（vitest hoist 要求）
vi.mock('child_process', () => ({ execSync: vi.fn() }))
// 只覆盖 execSyncWithRetry（保留 fetchWithRetry 供其它模块用）
vi.mock('@/lib/retry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/retry')>()
  return { ...actual, execSyncWithRetry: (fn: () => unknown) => fn() }
})
import { execSync } from 'child_process'
import { twitterSource } from '@/sources/twitter'
import { storeRawItems } from '../news-repo'
import { getNews } from '../news-repo'
import { createTestTables, dropTestSchema } from './db-test-helper'
import type { NewRawItem } from '../../schema'

/** 与 src/sources/__tests__/twitter.test.ts 相同格式的 CLI YAML fixture */
const MOCK_YAML = `
- id: '123456789'
  text: 'Excited about the new AI model from OpenAI! #llm #ai'
  name: 'AI Enthusiast'
  screenName: 'ai_fan'
  likes: 42
  retweets: 10
  media:
    - type: photo
      url: 'https://pbs.twimg.com/media/test1.jpg'
- id: '234567890'
  text: 'Just shipped a new React component library on GitHub'
  name: 'Dev Person'
  screenName: 'dev_person'
  likes: 15
  retweets: 3
`

describe('端到端业务链路（twitter）', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('Twitter 链路：mock CLI → 存储 → 可查询', async () => {
    process.env.TWITTER_AUTH_TOKEN = 'test-auth-token'
    process.env.TWITTER_CT0 = 'test-ct0'
    vi.mocked(execSync).mockReturnValue(MOCK_YAML as never)

    const items = await twitterSource.fetch()
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].source).toBe('twitter')

    const stored = await storeRawItems(items as unknown as NewRawItem[])
    expect(stored).toBe(items.length)

    const news = await getNews('twitter', 50, false)
    expect(news.length).toBeGreaterThanOrEqual(items.length)

    delete process.env.TWITTER_AUTH_TOKEN
    delete process.env.TWITTER_CT0
  })

  it('未配置 token 时安全跳过（返回空数组，不崩溃）', async () => {
    delete process.env.TWITTER_AUTH_TOKEN
    delete process.env.TWITTER_CT0
    const items = await twitterSource.fetch()
    expect(items).toEqual([])
  })
})
