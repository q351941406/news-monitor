import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseGithubRepoUrl, fetchRepoPreview, PreviewError } from '../repo-preview'

describe('parseGithubRepoUrl', () => {
  it('标准链接', () => {
    expect(parseGithubRepoUrl('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
  })
  it('容忍尾 slash / .git / 子路径 / 大小写域名', () => {
    expect(parseGithubRepoUrl('https://github.com/owner/repo/')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
    expect(parseGithubRepoUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
    expect(parseGithubRepoUrl('https://github.com/owner/repo/tree/main')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
    expect(parseGithubRepoUrl('https://GitHub.com/Owner/Repo')).toEqual({
      owner: 'Owner',
      repo: 'Repo',
    })
  })
  it('裸域名写法自动补 https', () => {
    expect(parseGithubRepoUrl('github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
  })
  it('非法输入返回 null', () => {
    expect(parseGithubRepoUrl('')).toBeNull()
    expect(parseGithubRepoUrl('   ')).toBeNull()
    expect(parseGithubRepoUrl('not a url at all')).toBeNull()
    expect(parseGithubRepoUrl('https://gitlab.com/owner/repo')).toBeNull()
    expect(parseGithubRepoUrl('https://github.com/onlyowner')).toBeNull()
    expect(parseGithubRepoUrl('https://github.com/')).toBeNull()
    // 路径穿越与非法字符
    expect(parseGithubRepoUrl('https://github.com/../repo')).toBeNull()
    expect(parseGithubRepoUrl('https://github.com/owner/re po')).toBeNull()
  })
})

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }
}

describe('fetchRepoPreview', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GITHUB_TOKEN
  })

  function mockGithub(metaStatus: number, metaBody: unknown, readmeBody: string | null) {
    const fn = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('https://api.github.com/')) {
        return Promise.resolve(jsonResponse(metaStatus, metaBody))
      }
      if (readmeBody === null) {
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(readmeBody) })
    })
    vi.stubGlobal('fetch', fn)
    return fn
  }

  it('成功：元数据 + README（首个候选即中）', async () => {
    mockGithub(
      200,
      { description: 'desc', language: 'TypeScript', stargazers_count: 42 },
      '# readme',
    )
    const r = await fetchRepoPreview('owner', 'repo')
    expect(r).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      fullName: 'owner/repo',
      description: 'desc',
      language: 'TypeScript',
      stars: 42,
      readme: '# readme',
    })
  })

  it('README 全 miss 时仍成功，readme 为空', async () => {
    mockGithub(200, { description: null, language: null, stargazers_count: null }, null)
    const r = await fetchRepoPreview('owner', 'repo')
    expect(r.readme).toBe('')
    expect(r.description).toBe('')
    expect(r.stars).toBe(0)
  })

  it('仓库不存在抛可展示的错误', async () => {
    mockGithub(404, { message: 'Not Found' }, null)
    await expect(fetchRepoPreview('owner', 'nope')).rejects.toThrow(PreviewError)
    await expect(fetchRepoPreview('owner', 'nope')).rejects.toThrow('仓库不存在或为私有仓库')
  })

  it('限流时提示配 token', async () => {
    mockGithub(403, { message: 'rate limit' }, null)
    await expect(fetchRepoPreview('owner', 'repo')).rejects.toThrow('GITHUB_TOKEN')
  })

  it('GitHub 5xx 透出状态码', async () => {
    mockGithub(500, {}, null)
    await expect(fetchRepoPreview('owner', 'repo')).rejects.toThrow('GitHub 返回 500')
  })

  it('网络异常转为友好错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('boom')))
    await expect(fetchRepoPreview('owner', 'repo')).rejects.toThrow('获取仓库信息失败')
  })

  it('配了 GITHUB_TOKEN 则带上 Authorization', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    const fn = mockGithub(200, {}, null)
    await fetchRepoPreview('owner', 'repo')
    const headers = fn.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer ghp_test')
  })
})
