/**
 * 端到端业务链路集成测试（github + producthunt）
 *
 * 覆盖真实主链路（外部网络边界 mock、内部全真实）：
 *   数据源抓取（mock fetch）→ storeRawItems（真 DB）
 *   → AI 摘要落库（真 DB）→ 主题聚合（真 DB）→ API 读取（真查询）
 *
 * twitter 链路因依赖 child_process + retry mock，独立在
 * e2e-pipeline-twitter.test.ts（避免文件级 vi.mock 相互污染）。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { githubSource } from '@/sources/github'
import { productHuntSource } from '@/sources/producthunt'
import { storeRawItems } from '../news-repo'
import { storeAIAnalysis } from '../ai-repo'
import { storeTopicGroups, getTopicGroupMeta } from '../topic-repo'
import { getNews } from '../news-repo'
import { createTestTables, dropTestSchema } from './db-test-helper'
import type { NewRawItem } from '../../schema'

/** 与 src/sources/__tests__/github.test.ts 相同的真实页面结构 fixture（2 个仓库） */
const MOCK_TRENDING_HTML = `
<html><body>
<article class="Box-row">
  <div class="float-right d-flex"><a href="/sponsors/foo">Sponsor</a></div>
  <h2 class="h3 lh-condensed">
    <a data-hydro-click="{}" href="/owner/repo1" data-view-component="true" class="Link">
      <svg></svg>
      <span data-view-component="true" class="text-normal">owner /</span>
      repo1</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 tmp-pr-4">
    A trending test repo for parsing
  </p>
  <div class="f6 color-fg-muted mt-2">
    <span class="tmp-mr-3 d-inline-block ml-0 tmp-ml-0">
      <span itemprop="programmingLanguage">TypeScript</span>
    </span>
    <a href="/owner/repo1/stargazers" data-view-component="true" class="tmp-mr-3 Link Link--muted d-inline-block"><svg></svg>
      3,973</a>
    <span data-view-component="true" class="d-inline-block float-sm-right">
      <svg></svg>
      967 stars today
    </span>
  </div>
</article>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/owner/repo2" data-view-component="true" class="Link">
      <span class="text-normal">owner /</span>
      repo2</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 tmp-pr-4"></p>
  <div class="f6 color-fg-muted mt-2">
    <a href="/owner/repo2/stargazers" data-view-component="true" class="tmp-mr-3 Link Link--muted d-inline-block"><svg></svg>
      100</a>
    <span data-view-component="true" class="d-inline-block float-sm-right">42 stars today</span>
  </div>
</article>
</body></html>
`

/** Product Hunt GraphQL 响应 fixture（与单测一致：2 个产品） */
const MOCK_PH_RESPONSE = {
  data: {
    posts: {
      edges: [
        {
          node: {
            id: '12345',
            name: 'Test Product',
            tagline: 'A test product for parsing',
            description: 'Full description',
            url: 'https://www.producthunt.com/posts/test-product',
            votesCount: 100,
            commentsCount: 5,
            website: 'https://testproduct.com',
            thumbnail: { url: 'https://ph-uploads.imgix.net/test-thumb.png' },
            media: [{ type: 'photo', url: 'https://ph-uploads.imgix.net/test.png' }],
            user: { name: 'TestMaker' },
          },
        },
        {
          node: {
            id: '67890',
            name: 'Second Product',
            tagline: '',
            description: '',
            url: 'https://www.producthunt.com/posts/second-product',
            votesCount: 50,
            commentsCount: 2,
            website: 'https://second.com',
            thumbnail: null,
            media: null,
            user: { name: 'Anonymous' },
          },
        },
      ],
    },
  },
}

describe('端到端业务链路（github + producthunt）', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('GitHub 链路：抓取(mock网络) → 存储 → AI摘要 → 聚合 → API读取', async () => {
    // mock 网络边界（github 用全局 fetch 拉取页面）
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(MOCK_TRENDING_HTML),
    })
    vi.stubGlobal('fetch', fetchMock)

    // 抓取（真实解析器 + mock 网络）
    const items = await githubSource.fetch()
    expect(items).toHaveLength(2)
    expect(items[0].title).toContain('repo1')

    // 存储（真实 DB）
    const stored = await storeRawItems(items as unknown as NewRawItem[])
    expect(stored).toBe(2)

    // AI 摘要落库（真实 DB；AI 输出在链路测试中直接构造——
    // LLM 防护在 vitest.setup.ts 全局生效，这里只验证数据层连通）
    for (const item of items) {
      await storeAIAnalysis(item.id, `Summary for ${item.title}`, 'Details here')
    }

    // 主题聚合（真实 DB：storeTopicGroups 的 upsert 逻辑）
    const groups = [
      { topic: 'TypeScript 工具链', summary: 'Repo1 相关', itemIds: [items[0].id] },
      { topic: '前端框架', summary: 'Repo2 相关', itemIds: [items[1].id] },
    ]
    // storeTopicGroups 返回 void，通过 getTopicGroupMeta 验证落库结果
    await storeTopicGroups('github', groups)

    // API 读取（真实 news-repo 查询，模拟 GET /api/news?source=github 数据路径）
    const news = await getNews('github', 50, false)
    expect(news.length).toBeGreaterThanOrEqual(2)
    const topics = await getTopicGroupMeta('github', false)
    expect(topics.some((t) => t.topic === 'TypeScript 工具链')).toBe(true)

    vi.unstubAllGlobals()
  })

  it('Product Hunt 链路：mock GraphQL → 存储 → 可查询', async () => {
    process.env.PRODUCTHUNT_TOKEN = 'test-token'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_PH_RESPONSE),
    })
    vi.stubGlobal('fetch', fetchMock)
    const items = await productHuntSource.fetch()
    expect(items).toHaveLength(2)
    const stored = await storeRawItems(items as unknown as NewRawItem[])
    expect(stored).toBe(2)
    const news = await getNews('producthunt', 50, false)
    expect(news.some((n) => n.title === 'Test Product')).toBe(true)
    delete process.env.PRODUCTHUNT_TOKEN
    vi.unstubAllGlobals()
  })

  it('全链路完整性：重复抓取不产生重复行', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(MOCK_TRENDING_HTML),
    })
    vi.stubGlobal('fetch', fetchMock)
    const items = await githubSource.fetch()
    // owner/repo1 上面已存过 → 重复抓取返回 0 新增
    const stored = await storeRawItems(items as unknown as NewRawItem[])
    expect(stored).toBe(0)
    vi.unstubAllGlobals()
  })
})
