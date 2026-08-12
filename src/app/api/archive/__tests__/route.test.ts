import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// mock 数据层与管理鉴权，route 只测 HTTP 语义
const mocks = vi.hoisted(() => ({
  getArchivedNews: vi.fn(),
  markAsUnread: vi.fn(),
  deleteItem: vi.fn(),
  isAdminAuthorized: vi.fn(),
  unauthorized: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getArchivedNews: mocks.getArchivedNews,
  markAsUnread: mocks.markAsUnread,
  deleteItem: mocks.deleteItem,
}))
vi.mock('@/lib/admin-auth', () => ({
  isAdminAuthorized: mocks.isAdminAuthorized,
  unauthorized: mocks.unauthorized,
}))

import { GET, POST } from '../route'

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/archive${query}`)
}
function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/archive', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': 't' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getArchivedNews.mockResolvedValue({ items: [], total: 0 })
  mocks.isAdminAuthorized.mockReturnValue(true)
  mocks.unauthorized.mockReturnValue(
    new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
  )
})

describe('GET /api/archive', () => {
  it('默认参数：source=all, page=1, pageSize=20, 无 q/days', async () => {
    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    expect(mocks.getArchivedNews).toHaveBeenCalledWith({
      source: 'all',
      page: 1,
      pageSize: 20,
      q: undefined,
      days: undefined,
    })
  })
  it('带 source 过滤', async () => {
    await GET(getRequest('?source=github'))
    expect(mocks.getArchivedNews).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'github' }),
    )
  })
  it('page 非数字时回退为 1（parseInt NaN 分支）', async () => {
    await GET(getRequest('?page=abc'))
    expect(mocks.getArchivedNews).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
  })
  it('pageSize 超上限被截断为 50（Math.min 分支）', async () => {
    await GET(getRequest('?pageSize=999'))
    expect(mocks.getArchivedNews).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50 }))
  })
  it('pageSize=0 时回退默认 20（0 为 falsy）', async () => {
    await GET(getRequest('?pageSize=0'))
    expect(mocks.getArchivedNews).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 20 }))
  })
  it('带 q 关键词', async () => {
    await GET(getRequest('?q=AI'))
    expect(mocks.getArchivedNews).toHaveBeenCalledWith(expect.objectContaining({ q: 'AI' }))
  })
  it('带 days 且解析失败回退 7 天', async () => {
    await GET(getRequest('?days=abc'))
    expect(mocks.getArchivedNews).toHaveBeenCalledWith(expect.objectContaining({ days: 7 }))
  })
  it('带合法 days', async () => {
    await GET(getRequest('?days=30'))
    expect(mocks.getArchivedNews).toHaveBeenCalledWith(expect.objectContaining({ days: 30 }))
  })
  it('返回 items 与分页信息', async () => {
    mocks.getArchivedNews.mockResolvedValue({ items: [{ id: 'x' }], total: 1 })
    const res = await GET(getRequest('?page=3&pageSize=10'))
    const body = await res.json()
    expect(body).toEqual({ data: [{ id: 'x' }], total: 1, page: 3, pageSize: 10 })
  })
})

describe('POST /api/archive', () => {
  it('未授权返回 403（fail-closed 分支）', async () => {
    mocks.isAdminAuthorized.mockReturnValue(false)
    const res = await POST(postRequest({ action: 'restore', itemId: 'x' }))
    expect(res.status).toBe(403)
    expect(mocks.unauthorized).toHaveBeenCalled()
    expect(mocks.markAsUnread).not.toHaveBeenCalled()
  })
  it('restore：标记未读并返回 success', async () => {
    const res = await POST(postRequest({ action: 'restore', itemId: 'test:1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mocks.markAsUnread).toHaveBeenCalledWith('test:1')
  })
  it('restore 但 itemId 缺失时返回 400', async () => {
    const res = await POST(postRequest({ action: 'restore' }))
    expect(res.status).toBe(400)
    expect(mocks.markAsUnread).not.toHaveBeenCalled()
  })
  it('delete：彻底删除并返回 success', async () => {
    const res = await POST(postRequest({ action: 'delete', itemId: 'test:2' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mocks.deleteItem).toHaveBeenCalledWith('test:2')
  })
  it('delete 但 itemId 非 string 时返回 400', async () => {
    const res = await POST(postRequest({ action: 'delete', itemId: 42 }))
    expect(res.status).toBe(400)
    expect(mocks.deleteItem).not.toHaveBeenCalled()
  })
  it('未知 action 返回 400', async () => {
    const res = await POST(postRequest({ action: 'explode' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid action' })
  })
  it('空 body 返回 400', async () => {
    const req = new NextRequest('http://localhost/api/archive', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
  it('非法 JSON body 返回 400（request.json catch 分支）', async () => {
    const req = new NextRequest('http://localhost/api/archive', {
      method: 'POST',
      headers: { 'x-admin-token': 't' },
      body: '{not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
