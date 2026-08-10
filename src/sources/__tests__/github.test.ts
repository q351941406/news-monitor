import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { githubSource, parseTrendingHtml } from '../github'

/**
 * 模拟 github.com/trending 的真实 HTML 结构（2 个仓库）
 * 结构与线上页面一致：h2 仓库链接、col-9 描述、programmingLanguage、stargazers 链接、stars today
 */
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

describe('parseTrendingHtml', () => {
  it('解析仓库名、描述、总 star、今日 star、语言', () => {
    const repos = parseTrendingHtml(MOCK_TRENDING_HTML)
    expect(repos).toHaveLength(2)
    expect(repos[0].fullname).toBe('owner/repo1')
    expect(repos[0].author).toBe('owner')
    expect(repos[0].name).toBe('repo1')
    expect(repos[0].description).toBe('A trending test repo for parsing')
    expect(repos[0].stars).toBe(3973)
    expect(repos[0].starsToday).toBe(967)
    expect(repos[0].language).toBe('TypeScript')
    expect(repos[0].url).toBe('https://github.com/owner/repo1')
  })
  it('缺少描述和语言时使用默认值', () => {
    const repos = parseTrendingHtml(MOCK_TRENDING_HTML)
    expect(repos[1].description).toBe('')
    expect(repos[1].language).toBe('Unknown')
    expect(repos[1].stars).toBe(100)
    expect(repos[1].starsToday).toBe(42)
  })
  it('无仓库时返回空数组', () => {
    expect(parseTrendingHtml('<html><body>no articles</body></html>')).toHaveLength(0)
  })
})

describe('GitHubSource', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        // Trending 页面请求
        if (url.includes('github.com/trending')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(MOCK_TRENDING_HTML),
          })
        }
        // README 请求
        if (url.includes('raw.githubusercontent.com')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('# Test README\n\nThis is a test.'),
          })
        }
        return Promise.resolve({ ok: false })
      }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('正常解析 Trending 页面并返回 RawItem', async () => {
    const items = await githubSource.fetch()
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('github:owner/repo1')
    expect(items[0].title).toBe('owner/repo1')
    expect(items[0].rawData.stars).toBe(3973)
    expect(items[0].rawData.starsToday).toBe(967)
    expect(items[0].rawData.language).toBe('TypeScript')
    expect(items[0].rawData.description).toBe('A trending test repo for parsing')
    expect(items[0].rawData.readme).toContain('# Test README')
  })
  it('页面无仓库时抛出异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><body>no articles</body></html>'),
      }),
    )
    await expect(githubSource.fetch()).rejects.toThrow('no repositories found')
  })
  it('Trending 页面返回错误时抛出异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }),
    )
    await expect(githubSource.fetch()).rejects.toThrow('GitHub Trending error: 403')
  })
  it('读取全部仓库（不截断 10 条）', async () => {
    // 构造 15 个仓库的页面，验证 fetch 返回全部而不是截断为 10
    const manyArticles = Array.from(
      { length: 15 },
      (_, i) => `
<article class="Box-row">
  <h2 class="h3 lh-condensed"><a href="/owner/repo${i}">owner/repo${i}</a></h2>
  <p class="col-9 color-fg-muted my-1 tmp-pr-4">desc ${i}</p>
  <div class="f6 color-fg-muted mt-2">
    <span itemprop="programmingLanguage">Python</span>
    <a href="/owner/repo${i}/stargazers">${100 + i}</a>
    <span class="d-inline-block float-sm-right">${i} stars today</span>
  </div>
</article>`,
    ).join('\n')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('github.com/trending')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(`<html><body>${manyArticles}</body></html>`),
          })
        }
        // README
        return Promise.resolve({ ok: true, text: () => Promise.resolve('# README') })
      }),
    )
    const items = await githubSource.fetch()
    expect(items).toHaveLength(15)
    expect(items[14].id).toBe('github:owner/repo14')
  })
})
