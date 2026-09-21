import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { isAdminAuthorized, unauthorized, tooManyRequests } from '../admin-auth'

describe('admin-auth', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('未配置 ADMIN_TOKEN 时拒绝所有请求（fail-closed）', async () => {
    vi.stubEnv('ADMIN_TOKEN', '')
    const req = new NextRequest('http://localhost/api/admin/metrics', {
      headers: { 'x-admin-token': 'anything' },
    })
    await expect(isAdminAuthorized(req)).resolves.toBe(false)
  })

  it('通过 x-admin-token header 校验通过', async () => {
    vi.stubEnv('ADMIN_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/metrics', {
      headers: { 'x-admin-token': 'secret-token' },
    })
    await expect(isAdminAuthorized(req)).resolves.toBe(true)
  })

  it('通过 Authorization: Bearer 校验通过', async () => {
    vi.stubEnv('ADMIN_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/metrics', {
      headers: { Authorization: 'Bearer secret-token' },
    })
    await expect(isAdminAuthorized(req)).resolves.toBe(true)
  })

  it('token 错误时拒绝', async () => {
    vi.stubEnv('ADMIN_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/metrics', {
      headers: { 'x-admin-token': 'wrong-token' },
    })
    await expect(isAdminAuthorized(req)).resolves.toBe(false)
  })

  it('header 与 bearer 都缺失时拒绝', async () => {
    vi.stubEnv('ADMIN_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/metrics')
    await expect(isAdminAuthorized(req)).resolves.toBe(false)
  })

  it('unauthorized 返回 403 JSON', async () => {
    const res = unauthorized()
    expect(res.status).toBe(403)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const body = await res.json()
    expect(body.error).toContain('Forbidden')
  })
})

describe('tooManyRequests', () => {
  it('返回 429 + Retry-After', async () => {
    const res = tooManyRequests(42)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    const body = await res.json()
    expect(body.retryAfter).toBe(42)
    expect(body.error).toContain('Too many')
  })

  it('Retry-After 至少为 1（避免 0 导致客户端疯狂重试）', () => {
    expect(tooManyRequests(0).headers.get('Retry-After')).toBe('1')
    expect(tooManyRequests(-5).headers.get('Retry-After')).toBe('1')
  })
})
