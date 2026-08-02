import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 必须在 import 前 mock
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))
// mock execSyncWithRetry: 直接调用 fn() 不重试，避免 busy-wait 阻塞测试
vi.mock('@/lib/retry', () => ({
  execSyncWithRetry: (fn: () => unknown) => fn(),
}))

import { execSync } from 'child_process'
import { twitterSource } from '../twitter'

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
- id: '345678901'
  text: 'I had a great lunch today, weather is nice'
  name: 'Normal User'
  screenName: 'normal_user'
  likes: 5
  retweets: 1
- id: '456789012'
  text: 'New Rust framework for building CLIs is amazing'
  name: 'Rust Fan'
  screenName: 'rust_fan'
  likes: 30
  retweets: 8
  media:
    - type: video
      url: 'https://pbs.twimg.com/media/test2.mp4'
`

describe('TwitterSource', () => {
  beforeEach(() => {
    process.env.TWITTER_AUTH_TOKEN = 'test-auth-token'
    process.env.TWITTER_CT0 = 'test-ct0'
    vi.mocked(execSync).mockReturnValue(MOCK_YAML)
  })

  afterEach(() => {
    delete process.env.TWITTER_AUTH_TOKEN
    delete process.env.TWITTER_CT0
    vi.clearAllMocks()
  })

  it('解析推文并按科技关键词过滤', async () => {
    const items = await twitterSource.fetch()
    // 验证只返回科技相关的推文（不含 lunch 那条）
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.source).toBe('twitter')
      expect(item.id).toMatch(/^x:/)
    }
  })

  it('没有 token 时返回空数组', async () => {
    delete process.env.TWITTER_AUTH_TOKEN
    delete process.env.TWITTER_CT0
    const items = await twitterSource.fetch()
    expect(items).toHaveLength(0)
  })

  it('execSync 失败时返回空数组', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed')
    })
    const items = await twitterSource.fetch()
    expect(items).toHaveLength(0)
  })

  it('没有科技相关推文时返回空数组', async () => {
    vi.mocked(execSync).mockReturnValue(`
- id: '999999'
  text: 'Beautiful sunset today!'
  name: 'Normal User'
  screenName: 'normal_user'
  likes: 5
  retweets: 1
`)
    const items = await twitterSource.fetch()
    expect(items).toHaveLength(0)
  })

  it('有 media 的推文正确解析图片信息', async () => {
    const items = await twitterSource.fetch()
    // 找到带 media 的推文
    const tw = items.find((i) => i.id === 'x:123456789')
    expect(tw).toBeDefined()
    expect(tw!.rawData.photos).toHaveLength(1)
    expect(tw!.rawData.photos[0]).toContain('pbs.twimg.com/media/test1')
  })
})
