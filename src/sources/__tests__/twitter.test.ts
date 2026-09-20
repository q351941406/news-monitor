import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// 必须在 import 前 mock
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))
// mock execSyncWithRetry: 直接调用 fn() 不重试，避免 busy-wait 阻塞测试
vi.mock('@/lib/retry', () => ({
  execSyncWithRetry: (fn: () => unknown) => fn(),
}))

import { execSync } from 'child_process'
import { twitterSource, parseTwitterCliOutput } from '../twitter'

const FIXTURES = path.join(__dirname, 'fixtures')
const REAL_SUCCESS = fs.readFileSync(path.join(FIXTURES, 'twitter-cli-0.8.5-success.yaml'), 'utf-8')
const REAL_FAILURE = fs.readFileSync(path.join(FIXTURES, 'twitter-cli-0.8.5-failure.yaml'), 'utf-8')

/**
 * 旧格式：twitter-cli 早期版本的扁平字段（顶层 id/text/name/screenName/likes）。
 * 这是**过时的**格式，保留少量用例是为了证明解析器对历史输出仍有兼容性，
 * 而不再是测试的主要依据 —— 主要依据是上面的 0.8.5 真实 fixture。
 */
const LEGACY_FLAT_YAML = `
- id: '123456789'
  text: 'Excited about the new AI model from OpenAI! #llm #ai'
  name: 'AI Enthusiast'
  screenName: 'ai_fan'
  likes: 42
  retweets: 10
  media:
    - type: photo
      url: 'https://pbs.twimg.com/media/test1.jpg'
`

describe('parseTwitterCliOutput —— 0.8.5 真实格式契约', () => {
  it('解析成功格式（ok:true + data 包装 + 嵌套 author/metrics）', () => {
    const tweets = parseTwitterCliOutput(REAL_SUCCESS)
    expect(tweets).toHaveLength(4)
    const first = tweets[0]
    expect(first.id).toBe('1234567890')
    expect(first.username).toBe('ai_fan') // 来自 author.screenName
    expect(first.author).toBe('AI Enthusiast') // 来自 author.name
    expect(first.likes).toBe(4200) // 来自 metrics.likes
    expect(first.retweets).toBe(310) // 来自 metrics.retweets
    expect(first.url).toBe('https://x.com/ai_fan/status/1234567890')
    expect(first.media).toEqual([{ type: 'photo', url: 'https://pbs.twimg.com/media/test1.jpg' }])
  })

  it('回归防线：失败格式（ok:false）必须抛错，而非静默返回 0 条', () => {
    // 这是 P1-4 的核心：旧逐行解析器看不见 ok:false 包装，
    // 会把「凭据失效」静默解析成「0 条推文」，workflow 依然绿。
    expect(() => parseTwitterCliOutput(REAL_FAILURE)).toThrow(/twitter-cli 报告失败/)
    expect(() => parseTwitterCliOutput(REAL_FAILURE)).toThrow(/not_authenticated/)
  })

  it('失败格式的错误信息给出凭据排查提示', () => {
    expect(() => parseTwitterCliOutput(REAL_FAILURE)).toThrow(/TWITTER_AUTH_TOKEN/)
  })

  it('多行推文（嵌套结构）不破坏解析', () => {
    const withMultiline = `
ok: true
schema_version: '1'
data:
- id: '999'
  text: |
    First line about AI
    second line about LLM
  author:
    id: u1
    name: Multi
    screenName: multi
  metrics:
    likes: 3
    retweets: 1
  media: []
`
    const tweets = parseTwitterCliOutput(withMultiline)
    expect(tweets).toHaveLength(1)
    expect(tweets[0].text).toContain('First line about AI')
    expect(tweets[0].text).toContain('second line about LLM')
  })

  it('兼容直接是数组的形态（旧版本 CLI / 无包装）', () => {
    const plainArray = `
- id: '111'
  text: 'plain array form about rust programming'
  author:
    name: A
    screenName: a
  metrics:
    likes: 1
    retweets: 2
`
    const tweets = parseTwitterCliOutput(plainArray)
    expect(tweets).toHaveLength(1)
    expect(tweets[0].id).toBe('111')
    expect(tweets[0].likes).toBe(1)
  })

  it('兼容旧扁平字段格式（向后兼容，非主依据）', () => {
    const tweets = parseTwitterCliOutput(LEGACY_FLAT_YAML)
    expect(tweets).toHaveLength(1)
    expect(tweets[0].id).toBe('123456789')
    expect(tweets[0].username).toBe('ai_fan')
    expect(tweets[0].likes).toBe(42)
  })

  it('空输出抛错', () => {
    expect(() => parseTwitterCliOutput('')).toThrow(/空输出/)
    expect(() => parseTwitterCliOutput('   \n  ')).toThrow(/空输出/)
  })

  it('非 YAML 输出抛错（CLI 崩溃文本落到 stdout 的场景）', () => {
    expect(() => parseTwitterCliOutput('Command failed: twitter feed\n{unbalanced')).toThrow(
      /不是合法 YAML/,
    )
  })

  it('缺少 data 数组时抛错，而非静默返回空', () => {
    expect(() => parseTwitterCliOutput('ok: true\nschema_version: "1"')).toThrow(/缺少 data 数组/)
  })

  it('丢弃缺少 id 或 text 的无效条目', () => {
    const partial = `
ok: true
schema_version: '1'
data:
- id: '1'
  text: 'valid AI tweet'
  author: { name: A, screenName: a }
  metrics: { likes: 1, retweets: 2 }
- id: ''
  text: 'no id'
- id: '3'
  text: ''
`
    const tweets = parseTwitterCliOutput(partial)
    expect(tweets).toHaveLength(1)
    expect(tweets[0].id).toBe('1')
  })
})

describe('TwitterSource', () => {
  beforeEach(() => {
    process.env.TWITTER_AUTH_TOKEN = 'test-auth-token'
    process.env.TWITTER_CT0 = 'test-ct0'
    vi.mocked(execSync).mockReturnValue(REAL_SUCCESS)
  })

  afterEach(() => {
    delete process.env.TWITTER_AUTH_TOKEN
    delete process.env.TWITTER_CT0
    vi.clearAllMocks()
  })

  it('解析真实 CLI 输出并按科技关键词过滤', async () => {
    const items = await twitterSource.fetch()
    // 真实 fixture 含 4 条：AI / React+GitHub / 午餐(非科技) / Rust → 过滤掉午餐
    expect(items).toHaveLength(3)
    expect(items.every((i) => i.source === 'twitter')).toBe(true)
    expect(items.every((i) => i.id.startsWith('x:'))).toBe(true)
    const texts = items.map((i) => i.rawData.text as string)
    expect(texts.some((t) => t.includes('lunch'))).toBe(false)
  })

  it('没有 token 时抛错（而非静默返回空）', async () => {
    // 历史故障：此处曾静默返回 []，使 workflow 全绿而抓取断流 57 天。
    delete process.env.TWITTER_AUTH_TOKEN
    delete process.env.TWITTER_CT0
    await expect(twitterSource.fetch()).rejects.toThrow(/缺少必需凭据/)
  })

  it('显式设置 SKIP_SOURCE_TWITTER=1 时跳过并返回空数组', async () => {
    delete process.env.TWITTER_AUTH_TOKEN
    delete process.env.TWITTER_CT0
    process.env.SKIP_SOURCE_TWITTER = '1'
    try {
      expect(await twitterSource.fetch()).toHaveLength(0)
    } finally {
      delete process.env.SKIP_SOURCE_TWITTER
    }
  })

  it('execSync 失败时抛错（而非静默返回空）', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed')
    })
    await expect(twitterSource.fetch()).rejects.toThrow(/twitter-cli 执行失败/)
  })

  it('twitter-cli 未安装时错误信息包含排查提示', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed: twitter feed\n/bin/sh: 1: twitter: not found')
    })
    await expect(twitterSource.fetch()).rejects.toThrow(/pip install twitter-cli/)
  })

  it('CLI 返回失败包装（ok:false）时 fetch 抛错 —— 端到端守住静默失败', async () => {
    vi.mocked(execSync).mockReturnValue(REAL_FAILURE)
    await expect(twitterSource.fetch()).rejects.toThrow(/not_authenticated/)
  })

  it('twitter-cli 返回空输出时抛错', async () => {
    vi.mocked(execSync).mockReturnValue('')
    await expect(twitterSource.fetch()).rejects.toThrow(/返回空输出/)
  })

  it('没有科技相关推文时返回空数组', async () => {
    vi.mocked(execSync).mockReturnValue(`
ok: true
schema_version: '1'
data:
- id: '999999'
  text: 'Beautiful sunset today!'
  author: { name: Normal User, screenName: normal_user }
  metrics: { likes: 5, retweets: 1 }
`)
    expect(await twitterSource.fetch()).toHaveLength(0)
  })

  it('有 media 的推文正确解析图片信息', async () => {
    const items = await twitterSource.fetch()
    const tw = items.find((i) => i.id === 'x:1234567890')
    expect(tw).toBeDefined()
    expect(tw!.rawData.photos as string[]).toHaveLength(1)
    expect((tw!.rawData.photos as string[])[0]).toContain('pbs.twimg.com/media/test1')
  })

  it('视频媒体被识别为 video 类型', async () => {
    const items = await twitterSource.fetch()
    const tw = items.find((i) => i.id === 'x:4567890123')
    expect(tw).toBeDefined()
    expect(tw!.rawData.mediaType).toBe('video')
    expect((tw!.rawData.videos as string[])[0]).toContain('test2.mp4')
  })

  it('data 为空数组（CLI 成功但无推文）必须抛错，而非静默返回 []', () => {
    // 命令成功却 0 条 = 登录态半失效/上游限流，属异常。
    // 历史上这里静默返回 []，让 workflow 全绿。
    const emptyData = "ok: true\nschema_version: '1'\ndata: []\n"
    expect(() => parseTwitterCliOutput(emptyData)).toThrow(/data 为空数组/)
  })

  it('关键词过滤后为空是合法的「没有相关内容」，交由上游兜底而非此处抛错', () => {
    // 分层原则：解析层只判「CLI 输出可信」，不判「过滤后是否有内容」。
    // 这条固化「不要为了防断流而把正常空结果也判成故障」。
    const allNonTech = [
      'ok: true',
      "schema_version: '1'",
      'data:',
      "- id: '1'",
      "  text: '今天天气真好，去公园散步了'",
      '  author:',
      '    screenName: someone',
      '  metrics:',
      '    likes: 5',
      '    retweets: 1',
      '',
    ].join('\n')
    const tweets = parseTwitterCliOutput(allNonTech)
    expect(tweets).toHaveLength(1)
    expect(tweets[0].text).toContain('天气')
  })
})
