import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  isAdminMode,
  adminFetch,
} from '../admin-token'

function mockBrowserStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  })
  return store
}

describe('admin-token', () => {
  beforeEach(() => {
    mockBrowserStorage()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('无 token 时 getAdminToken 返回 null，非管理员模式', () => {
    expect(getAdminToken()).toBeNull()
    expect(isAdminMode()).toBe(false)
  })

  it('set/get/clear token 生命周期', () => {
    setAdminToken('tok-123')
    expect(getAdminToken()).toBe('tok-123')
    expect(isAdminMode()).toBe(true)
    clearAdminToken()
    expect(getAdminToken()).toBeNull()
    expect(isAdminMode()).toBe(false)
  })

  it('server 环境（无 window）getAdminToken 返回 null', () => {
    vi.unstubAllGlobals() // 移除 window/localStorage mock
    expect(getAdminToken()).toBeNull()
  })

  it('adminFetch 携带 x-admin-token header', async () => {
    setAdminToken('tok-456')
    await adminFetch('http://localhost/api/news')
    const [input, init] = vi.mocked(fetch).mock.calls[0]
    expect(input).toBe('http://localhost/api/news')
    expect(init.headers.get('x-admin-token')).toBe('tok-456')
    expect(init.headers.get('Content-Type')).toBe('application/json')
  })

  it('adminFetch 无 token 时不带 x-admin-token', async () => {
    await adminFetch('http://localhost/api/news')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init.headers.get('x-admin-token')).toBeNull()
  })
})
