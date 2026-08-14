import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

vi.mock('@/lib/cache', () => ({
  invalidateNewsCounts: vi.fn(),
}))

describe('POST /api/admin/revalidate', () => {
  const originalToken = process.env.ADMIN_TOKEN

  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token'
    vi.clearAllMocks()
  })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = originalToken
  })

  function makeRequest(token?: string) {
    const headers = new Headers()
    if (token) headers.set('x-admin-token', token)
    return new NextRequest('http://localhost/api/admin/revalidate', {
      method: 'POST',
      headers,
    })
  }

  it('valid token revalidates', async () => {
    const { invalidateNewsCounts } = await import('@/lib/cache')
    const res = await POST(makeRequest('test-admin-token'))
    expect(res.status).toBe(200)
    expect(vi.mocked(invalidateNewsCounts)).toHaveBeenCalledTimes(1)
  })

  it('invalid token 403', async () => {
    const { invalidateNewsCounts } = await import('@/lib/cache')
    const res = await POST(makeRequest('wrong'))
    expect(res.status).toBe(403)
    expect(vi.mocked(invalidateNewsCounts)).not.toHaveBeenCalled()
  })

  it('missing ADMIN_TOKEN fail-closed 403', async () => {
    delete process.env.ADMIN_TOKEN
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })
})
