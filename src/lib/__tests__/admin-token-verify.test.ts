import { describe, it, expect } from 'vitest'
import { extractProvidedToken, verifyAdminToken } from '../admin-token-verify'

describe('extractProvidedToken', () => {
  it('优先取 x-admin-token', () => {
    const h = new Headers({ 'x-admin-token': 'abc', authorization: 'Bearer xyz' })
    expect(extractProvidedToken(h)).toBe('abc')
  })

  it('无 x-admin-token 时回退 Authorization: Bearer', () => {
    expect(extractProvidedToken(new Headers({ authorization: 'Bearer xyz' }))).toBe('xyz')
  })

  it('Bearer 前缀大小写敏感（非 Bearer 前缀不解析）', () => {
    expect(extractProvidedToken(new Headers({ authorization: 'Basic xyz' }))).toBe('')
  })

  it('两个 header 都缺失时返回空串', () => {
    expect(extractProvidedToken(new Headers())).toBe('')
  })
})

describe('verifyAdminToken', () => {
  it('完全匹配返回 true', async () => {
    expect(await verifyAdminToken('test-token-placeholder', 'test-token-placeholder')).toBe(true)
  })

  it('不匹配返回 false', async () => {
    expect(await verifyAdminToken('wrong', 'test-token-placeholder')).toBe(false)
  })

  it('前缀正确但整体不等 → false（避免前缀泄露）', async () => {
    expect(await verifyAdminToken('12345678', 'test-token-placeholder')).toBe(false)
  })

  it('expected 为 undefined（未配置）→ false（fail-closed）', async () => {
    expect(await verifyAdminToken('test-token-placeholder', undefined)).toBe(false)
  })

  it('expected 为空串 → false（fail-closed，空 token 不得通过）', async () => {
    expect(await verifyAdminToken('', '')).toBe(false)
    expect(await verifyAdminToken('anything', '')).toBe(false)
  })

  it('provided 为空串 → false', async () => {
    expect(await verifyAdminToken('', 'test-token-placeholder')).toBe(false)
  })

  it('长度不同也不抛错（SHA-256 归一化为等长摘要）', async () => {
    await expect(verifyAdminToken('a', 'a'.repeat(500))).resolves.toBe(false)
  })

  it('支持含 Unicode 的 token', async () => {
    expect(await verifyAdminToken('密🔑码', '密🔑码')).toBe(true)
    expect(await verifyAdminToken('密🔑码', '密🔑碼')).toBe(false)
  })
})
