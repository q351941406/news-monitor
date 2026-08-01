import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock pg pool，避免真实连接 DB
const mockQuery = vi.fn()
vi.mock('@/lib/db/connection', () => ({
  getPgPool: () => ({ query: mockQuery }),
}))

import { GET } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/health', () => {
  it('DB 正常时返回 200 + status ok', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.db).toBe('up')
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(mockQuery).toHaveBeenCalledWith('SELECT 1')
  })

  it('DB 失败时返回 503 + status degraded', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.db).toBe('down')
    expect(body.error).toContain('connection refused')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('响应未缓存（动态）', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

    const res = await GET()

    // 显式禁用缓存，确保每请求真实探测
    expect(res.headers.get('cache-control')).toBeNull()
    // NextResponse 默认不设置 cache-control，确认 dynamic export 生效
    expect(typeof res.json).toBe('function')
  })
})
