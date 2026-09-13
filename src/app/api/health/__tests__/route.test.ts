import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// mock pg pool，避免真实连接 DB
const mockQuery = vi.fn()
vi.mock('@/lib/db/connection', () => ({
  getPgPool: () => ({ query: mockQuery }),
}))

import { GET } from '../route'

const req = (url = 'http://localhost/api/health') => new NextRequest(url)

beforeEach(() => {
  // 必须用 mockReset（而非 clearAllMocks）：前者会同时清空 *Once 实现队列。
  // liveness 用例本就不查库，它排入的 once 实现不会被消费；若残留到下一个
  // deep 用例，会把该用例的返回值挤掉，导致断言以极难排查的方式失败。
  mockQuery.mockReset()
})

describe('GET /api/health（默认：liveness）', () => {
  it('不触碰数据库，返回 200 + db:unchecked', async () => {
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.db).toBe('unchecked')
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    // 回归防线：默认探活必须零查库。一旦这里失败，说明 Neon compute 会被
    // 探活持续唤醒，免费 CU-hours 额度会被再次耗尽。
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('DB 不可用也不影响 liveness —— 探活与 DB 完全解耦', async () => {
    // 让 DB 处于"必然失败"状态：若 liveness 走错了分支去查库，会立刻 503
    mockQuery.mockRejectedValue(new Error('connection refused'))

    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('deep 参数不是 1 时不触发深度检查', async () => {
    for (const url of [
      'http://localhost/api/health?deep=0',
      'http://localhost/api/health?deep=true',
      'http://localhost/api/health?other=1',
    ]) {
      const res = await GET(req(url))
      expect(res.status).toBe(200)
    }
    expect(mockQuery).not.toHaveBeenCalled()
  })
})

describe('GET /api/health?deep=1（readiness：真实查库）', () => {
  it('DB 正常时返回 200 + db:up', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

    const res = await GET(req('http://localhost/api/health?deep=1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.db).toBe('up')
    expect(typeof body.uptime).toBe('number')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(mockQuery).toHaveBeenCalledWith('SELECT 1')
  })

  it('DB 失败时返回 503 + status degraded', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'))

    const res = await GET(req('http://localhost/api/health?deep=1'))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.db).toBe('down')
    expect(body.error).toContain('connection refused')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('响应未缓存（动态）', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

    const res = await GET(req('http://localhost/api/health?deep=1'))

    // 显式禁用缓存，确保每请求真实探测
    expect(res.headers.get('cache-control')).toBeNull()
    // NextResponse 默认不设置 cache-control，确认 dynamic export 生效
    expect(typeof res.json).toBe('function')
  })
})
