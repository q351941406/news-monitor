import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// mock 外部边界（GitHub 网络 + AI 调用 + Sentry）：路由只测编排语义
const mocks = vi.hoisted(() => ({
  fetchRepoPreview: vi.fn(),
  runSingleSummaryPrompt: vi.fn(),
  captureException: vi.fn(),
}))

const { FakePreviewError } = vi.hoisted(() => ({
  FakePreviewError: class FakePreviewError extends Error {},
}))
vi.mock('@/lib/repo-preview', () => ({
  PreviewError: FakePreviewError,
  parseGithubRepoUrl: (input: unknown) =>
    typeof input === 'string' && input.includes('github.com/owner/repo')
      ? { owner: 'owner', repo: 'repo' }
      : null,
  fetchRepoPreview: mocks.fetchRepoPreview,
}))
vi.mock('@/lib/ai-service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/ai-service')>()
  return { ...mod, runSingleSummaryPrompt: mocks.runSingleSummaryPrompt }
})
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
}))

import { POST } from '../route'
import { PreviewError } from '@/lib/repo-preview'

const TOKEN = 'test-admin-token'

function postRequest(body: unknown, token?: string) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token) headers.set('x-admin-token', token)
  return new NextRequest('http://localhost/api/admin/prompts/test', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const goodBody = {
  key: 'github-single-summary',
  template: '分析 {{title}}',
  url: 'https://github.com/owner/repo',
}

describe('POST /api/admin/prompts/test', () => {
  const originalToken = process.env.ADMIN_TOKEN
  beforeEach(() => {
    process.env.ADMIN_TOKEN = TOKEN
    vi.clearAllMocks()
    mocks.fetchRepoPreview.mockResolvedValue({
      owner: 'owner',
      repo: 'repo',
      fullName: 'owner/repo',
      description: 'd',
      language: 'TypeScript',
      stars: 10,
      readme: 'readme',
    })
    mocks.runSingleSummaryPrompt.mockResolvedValue({ summary: 's', details: 'd' })
  })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = originalToken
  })

  it('无 token 时 403 且不调外部', async () => {
    const res = await POST(postRequest(goodBody))
    expect(res.status).toBe(403)
    expect(mocks.fetchRepoPreview).not.toHaveBeenCalled()
  })

  it('非法 JSON 返回 400', async () => {
    const res = await POST(postRequest('{oops', TOKEN))
    expect(res.status).toBe(400)
  })

  it('未知 key 返回 400', async () => {
    const res = await POST(postRequest({ ...goodBody, key: 'nope' }, TOKEN))
    expect(res.status).toBe(400)
  })

  it('空模板被拒绝', async () => {
    const res = await POST(postRequest({ ...goodBody, template: '  ' }, TOKEN))
    expect(res.status).toBe(400)
  })

  it('非法链接返回 400 并给示例', async () => {
    const res = await POST(postRequest({ ...goodBody, url: 'https://example.com/x' }, TOKEN))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('https://github.com/owner/repo')
    expect(mocks.fetchRepoPreview).not.toHaveBeenCalled()
  })

  it('仓库拉取失败透出可展示错误（502，不上报 Sentry）', async () => {
    mocks.fetchRepoPreview.mockRejectedValueOnce(
      new PreviewError('仓库不存在或为私有仓库，请检查链接'),
    )
    const res = await POST(postRequest(goodBody, TOKEN))
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toContain('仓库不存在')
    expect(mocks.runSingleSummaryPrompt).not.toHaveBeenCalled()
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it('仓库拉取未知异常时 500 并上报', async () => {
    mocks.fetchRepoPreview.mockRejectedValueOnce(new Error('weird'))
    const res = await POST(postRequest(goodBody, TOKEN))
    expect(res.status).toBe(500)
    expect(mocks.captureException).toHaveBeenCalledOnce()
  })

  it('AI 无结果时 502 并给重试建议', async () => {
    mocks.runSingleSummaryPrompt.mockResolvedValueOnce(null)
    const res = await POST(postRequest(goodBody, TOKEN))
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toContain('重试')
  })

  it('成功：返回摘要 + 渲染后 prompt + 仓库信息', async () => {
    const res = await POST(postRequest(goodBody, TOKEN))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.summary).toBe('s')
    expect(data.details).toBe('d')
    expect(data.repo).toMatchObject({ fullName: 'owner/repo', stars: 10 })
    expect(data.renderedPrompt).toContain('分析 owner/repo')
    expect(typeof data.durationMs).toBe('number')
    // 测试走快速重试 + 独立用量归属
    expect(mocks.runSingleSummaryPrompt).toHaveBeenCalledWith(
      expect.stringContaining('分析 owner/repo'),
      { maxRetries: 2, operation: 'singleSummaryTest' },
    )
    expect(mocks.fetchRepoPreview).toHaveBeenCalledWith('owner', 'repo')
  })
})
