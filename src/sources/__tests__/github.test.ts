import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { githubSource } from '../github'

const MOCK_API_RESPONSE = {
  items: [
    {
      full_name: 'owner/repo1',
      owner: { login: 'owner' },
      name: 'repo1',
      description: 'A test repo for testing',
      html_url: 'https://github.com/owner/repo1',
      stargazers_count: 500,
      language: 'TypeScript',
    },
    {
      full_name: 'owner/repo2',
      owner: { login: 'owner' },
      name: 'repo2',
      description: '',
      html_url: 'https://github.com/owner/repo2',
      stargazers_count: 100,
      language: null,
    },
  ],
}

describe('GitHubSource', () => {
  beforeEach(() => {
    // Mock global fetch
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        // GitHub API 请求
        if (url.includes('api.github.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MOCK_API_RESPONSE),
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

  it('正常解析 GitHub API 返回的数据', async () => {
    const items = await githubSource.fetch()
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('github:owner/repo1')
    expect(items[0].title).toBe('owner/repo1')
    expect(items[0].rawData.stars).toBe(500)
    expect(items[0].rawData.language).toBe('TypeScript')
    expect(items[0].rawData.description).toBe('A test repo for testing')
    expect(items[0].rawData.readme).toContain('# Test README')
  })

  it('缺少 description 和 language 时使用默认值', async () => {
    const items = await githubSource.fetch()
    expect(items[1].rawData.description).toBe('')
    expect(items[1].rawData.language).toBe('Unknown')
  })

  it('API 返回错误时抛出异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }),
    )
    await expect(githubSource.fetch()).rejects.toThrow('GitHub API error: 403')
  })
})
