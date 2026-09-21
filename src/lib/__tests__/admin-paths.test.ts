import { describe, it, expect } from 'vitest'
import { ADMIN_PROTECTED_MATCHER, requiresAdminToken } from '../admin-paths'

/**
 * 路径判定测试。
 *
 * 这层单独存在的理由：判定逻辑若只写在 middleware 里，"哪些路径受保护"
 * 就只由 matcher 字符串隐含表达，改错一个字也不会红。抽出来后可以直接
 * 断言行为，并让中间件的测试引用同一份 matcher 定义，杜绝两处漂移。
 */
describe('requiresAdminToken', () => {
  describe('写方法一律需要 token', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      it(`${method} /api/news 需要 token`, () => {
        expect(requiresAdminToken('/api/news', method)).toBe(true)
      })
      it(`${method} /api/archive 需要 token`, () => {
        expect(requiresAdminToken('/api/archive', method)).toBe(true)
      })
    }
  })

  describe('公开读操作（GET/HEAD）', () => {
    it('GET /api/news 放行', () => {
      expect(requiresAdminToken('/api/news', 'GET')).toBe(false)
    })
    it('HEAD /api/archive 放行', () => {
      expect(requiresAdminToken('/api/archive', 'HEAD')).toBe(false)
    })
    it('GET /api/topics 放行', () => {
      expect(requiresAdminToken('/api/topics', 'GET')).toBe(false)
    })
  })

  describe('/api/admin/* 连 GET 也受保护（运维仪表盘不可公开）', () => {
    it('GET /api/admin/metrics 需要 token', () => {
      expect(requiresAdminToken('/api/admin/metrics', 'GET')).toBe(true)
    })
    it('HEAD /api/admin/revalidate 需要 token', () => {
      expect(requiresAdminToken('/api/admin/revalidate', 'HEAD')).toBe(true)
    })
    it('子路径也受保护', () => {
      expect(requiresAdminToken('/api/admin/anything/deep', 'GET')).toBe(true)
    })
  })

  it('方法大小写敏感：小写 get 视为写方法（fail-closed）', () => {
    // 故意不规范化大小写：宁可对异常请求更严格，也不放过
    expect(requiresAdminToken('/api/news', 'get')).toBe(true)
  })
})

describe('ADMIN_PROTECTED_MATCHER', () => {
  it('覆盖三类受保护前缀', () => {
    const joined = ADMIN_PROTECTED_MATCHER.join(' ')
    expect(joined).toContain('/api/news')
    expect(joined).toContain('/api/archive')
    expect(joined).toContain('/api/admin')
  })

  it('使用 :path* 通配以覆盖子路径', () => {
    for (const m of ADMIN_PROTECTED_MATCHER) {
      expect(m.endsWith(':path*')).toBe(true)
    }
  })
})
