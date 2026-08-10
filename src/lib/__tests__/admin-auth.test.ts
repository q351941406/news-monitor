import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { isAdminAuthorized, unauthorized } from '../admin-auth'

describe('admin-auth', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('未配置 ADMIN_TOKEN 时拒绝所有请求（fail-closed）', () => {
    vi.stubEnv('ADMIN_TOKEN', '')
    const req = new NextRequest('http://localhost/api/admin/metrics', {
      headers: { 'x-admin-token': 'anything' },
    })
    expect(isAdminAuthorized(req)).toBe(false)
  })

  it('通过 x-admin-token header 校验通过', () => {
    vi.stubEnv('ADMIN_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/metrics', {
      headers: { 'x-admin-token': 'secret-token' },
    })
    expect(isAdminAuthorized(req)).toBe(true)
  })

  it('通过 Authorization: Bearer 校验通过', () => {
    vi.stubEnv('ADMIN_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/metrics', {
      headers: { Authorization: 'Bearer secret-token' },
    })
    expect(isAdminAuthorized(req)).toBe(true)
  })

  it('token 错误时拒绝', () => {
    vi.stubEnv('ADMIN_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/metrics', {
      headers: { 'x-admin-token': 'wrong-token' },
    })
    expect(isAdminAuthorized(req)).toBe(false)
  })

  it('header 与 bearer 都缺失时拒绝', () => {
    vi.stubEnv('ADMIN_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/metrics')
    expect(isAdminAuthorized(req)).toBe(false)
  })

  it('unauthorized 返回 403 JSON', async () => {
    const res = unauthorized()
    expect(res.status).toBe(403)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const body = await res.json()
    expect(body.error).toContain('Forbidden')
  })
})
