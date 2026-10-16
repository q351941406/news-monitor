import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// mock 数据层与 Sentry：路由只测 HTTP 语义与鉴权（沿用 archive 路由测试套路）
const mocks = vi.hoisted(() => ({
  getCustomPromptTemplate: vi.fn(),
  saveCustomPromptTemplate: vi.fn(),
  deleteCustomPromptTemplate: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/db/prompt-repo', () => ({
  getCustomPromptTemplate: mocks.getCustomPromptTemplate,
  saveCustomPromptTemplate: mocks.saveCustomPromptTemplate,
  deleteCustomPromptTemplate: mocks.deleteCustomPromptTemplate,
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
}))

// 用真实 admin-auth：token 校验逻辑本身也要被覆盖到
import { GET, PUT, DELETE } from '../route'

const TOKEN = 'test-admin-token'

function getRequest(key?: string, token?: string) {
  const url = `http://localhost/api/admin/prompts${key !== undefined ? `?key=${key}` : ''}`
  const headers = new Headers()
  if (token) headers.set('x-admin-token', token)
  return new NextRequest(url, { headers })
}
function putRequest(body: unknown, token?: string) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token) headers.set('x-admin-token', token)
  return new NextRequest('http://localhost/api/admin/prompts', {
    method: 'PUT',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
function deleteRequest(key: string | null, token?: string) {
  const url =
    key === null
      ? 'http://localhost/api/admin/prompts'
      : `http://localhost/api/admin/prompts?key=${key}`
  const headers = new Headers()
  if (token) headers.set('x-admin-token', token)
  return new NextRequest(url, { method: 'DELETE', headers })
}

describe('GET /api/admin/prompts', () => {
  const originalToken = process.env.ADMIN_TOKEN
  beforeEach(() => {
    process.env.ADMIN_TOKEN = TOKEN
    vi.clearAllMocks()
    mocks.getCustomPromptTemplate.mockResolvedValue(null)
  })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = originalToken
  })

  it('无 token 时 403', async () => {
    const res = await GET(getRequest())
    expect(res.status).toBe(403)
  })

  it('未知 key 返回 400', async () => {
    const res = await GET(getRequest('not-a-key', TOKEN))
    expect(res.status).toBe(400)
  })

  it('未定制时返回默认模板 + 变量说明', async () => {
    const res = await GET(getRequest(undefined, TOKEN))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.key).toBe('github-single-summary')
    expect(data.isCustom).toBe(false)
    expect(data.template).toContain('请用中文详细分析')
    expect(data.maxLength).toBeGreaterThan(0)
    expect(data.variables).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'readme' })]),
    )
  })

  it('已定制时返回库里模板', async () => {
    mocks.getCustomPromptTemplate.mockResolvedValue('定制模板 {{title}}')
    const res = await GET(getRequest('github-single-summary', TOKEN))
    const data = await res.json()
    expect(data.template).toBe('定制模板 {{title}}')
    expect(data.isCustom).toBe(true)
  })

  it('读库异常时 500 并上报 Sentry', async () => {
    mocks.getCustomPromptTemplate.mockRejectedValueOnce(new Error('db down'))
    const res = await GET(getRequest(undefined, TOKEN))
    expect(res.status).toBe(500)
    expect(mocks.captureException).toHaveBeenCalledOnce()
  })
})

describe('PUT /api/admin/prompts', () => {
  const originalToken = process.env.ADMIN_TOKEN
  beforeEach(() => {
    process.env.ADMIN_TOKEN = TOKEN
    vi.clearAllMocks()
  })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = originalToken
  })

  it('无 token 时 403 且不写库', async () => {
    const res = await PUT(putRequest({ key: 'github-single-summary', template: 'x' }))
    expect(res.status).toBe(403)
    expect(mocks.saveCustomPromptTemplate).not.toHaveBeenCalled()
  })

  it('非法 JSON body 返回 400', async () => {
    const res = await PUT(putRequest('{oops', TOKEN))
    expect(res.status).toBe(400)
  })

  it('未知 key 返回 400', async () => {
    const res = await PUT(putRequest({ key: 'nope', template: 'x' }, TOKEN))
    expect(res.status).toBe(400)
  })

  it('空模板被拒绝', async () => {
    const res = await PUT(putRequest({ key: 'github-single-summary', template: '   ' }, TOKEN))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('不能为空')
  })

  it('超长模板被拒绝', async () => {
    const res = await PUT(
      putRequest({ key: 'github-single-summary', template: 'x'.repeat(20_001) }, TOKEN),
    )
    expect(res.status).toBe(400)
  })

  it('保存成功（首尾空白被清理）', async () => {
    const res = await PUT(
      putRequest({ key: 'github-single-summary', template: '  定制 {{title}}  ' }, TOKEN),
    )
    expect(res.status).toBe(200)
    expect(mocks.saveCustomPromptTemplate).toHaveBeenCalledWith(
      'github-single-summary',
      '定制 {{title}}',
    )
  })

  it('省略 key 时默认存 github-single-summary', async () => {
    const res = await PUT(putRequest({ template: '定制' }, TOKEN))
    expect(res.status).toBe(200)
    expect(mocks.saveCustomPromptTemplate).toHaveBeenCalledWith('github-single-summary', '定制')
  })

  it('写库异常时 500 并上报 Sentry', async () => {
    mocks.saveCustomPromptTemplate.mockRejectedValueOnce(new Error('db down'))
    const res = await PUT(putRequest({ template: '定制' }, TOKEN))
    expect(res.status).toBe(500)
    expect(mocks.captureException).toHaveBeenCalledOnce()
  })
})

describe('DELETE /api/admin/prompts', () => {
  const originalToken = process.env.ADMIN_TOKEN
  beforeEach(() => {
    process.env.ADMIN_TOKEN = TOKEN
    vi.clearAllMocks()
  })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = originalToken
  })

  it('无 token 时 403 且不删库', async () => {
    const res = await DELETE(deleteRequest('github-single-summary'))
    expect(res.status).toBe(403)
    expect(mocks.deleteCustomPromptTemplate).not.toHaveBeenCalled()
  })

  it('未知 key 返回 400', async () => {
    const res = await DELETE(deleteRequest('nope', TOKEN))
    expect(res.status).toBe(400)
  })

  it('恢复默认成功', async () => {
    const res = await DELETE(deleteRequest('github-single-summary', TOKEN))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ success: true, isCustom: false })
    expect(mocks.deleteCustomPromptTemplate).toHaveBeenCalledWith('github-single-summary')
  })

  it('删库异常时 500 并上报 Sentry', async () => {
    mocks.deleteCustomPromptTemplate.mockRejectedValueOnce(new Error('db down'))
    const res = await DELETE(deleteRequest(null, TOKEN))
    expect(res.status).toBe(500)
    expect(mocks.captureException).toHaveBeenCalledOnce()
  })
})
