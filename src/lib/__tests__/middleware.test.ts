import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { middleware, config } from '../../middleware'
import { adminAuthLimiter } from '../rate-limit'

/** 构造带指定 IP 与 header 的请求 */
function req(
  path: string,
  init: { method?: string; token?: string; ip?: string } = {},
): NextRequest {
  const { method = 'POST', token, ip = '9.9.9.9' } = init
  const headers = new Headers({ 'x-real-ip': ip })
  if (token !== undefined) headers.set('x-admin-token', token)
  return new NextRequest(`http://localhost${path}`, { method, headers })
}

const TOKEN = 'test-token-placeholder'

describe('middleware —— 管理员接口边缘拦截', () => {
  beforeEach(() => {
    adminAuthLimiter.reset()
    vi.stubEnv('ADMIN_TOKEN', TOKEN)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('合法 token → 放行到 route handler', async () => {
    const res = await middleware(req('/api/news', { token: TOKEN }))
    // NextResponse.next() 不设 status（默认 200），且带 x-middleware-next
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.status).toBe(200)
  })

  it('错误 token → 403，且不进入 route handler', async () => {
    const res = await middleware(req('/api/news', { token: 'wrong' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain('Forbidden')
  })

  it('缺 token → 403', async () => {
    const res = await middleware(req('/api/news'))
    expect(res.status).toBe(403)
  })

  it('ADMIN_TOKEN 未配置 → 403（fail-closed，不得放行）', async () => {
    vi.stubEnv('ADMIN_TOKEN', '')
    const res = await middleware(req('/api/news', { token: 'anything' }))
    expect(res.status).toBe(403)
  })

  it('连续失败达阈值后 → 429 且带 Retry-After', async () => {
    for (let i = 0; i < 4; i += 1) {
      const r = await middleware(req('/api/news', { token: 'wrong' }))
      expect(r.status).toBe(403)
    }
    // 第 5 次触发封禁 → 429
    const fifth = await middleware(req('/api/news', { token: 'wrong' }))
    expect(fifth.status).toBe(429)
    expect(Number(fifth.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('封禁生效后，即使提交**正确** token 也被拒（防暴力破解的核心行为）', async () => {
    for (let i = 0; i < 5; i += 1) await middleware(req('/api/news', { token: 'wrong' }))
    const res = await middleware(req('/api/news', { token: TOKEN }))
    expect(res.status).toBe(429)
  })

  it('封禁只针对触发它的 IP，其他 IP 不受影响', async () => {
    for (let i = 0; i < 5; i += 1) {
      await middleware(req('/api/news', { token: 'wrong', ip: '1.1.1.1' }))
    }
    expect((await middleware(req('/api/news', { token: 'wrong', ip: '1.1.1.1' }))).status).toBe(429)
    expect((await middleware(req('/api/news', { token: TOKEN, ip: '2.2.2.2' }))).status).toBe(200)
  })

  it('成功一次即清零失败计数（偶发输错不累积成封禁）', async () => {
    for (let i = 0; i < 4; i += 1) {
      await middleware(req('/api/news', { token: 'wrong' }))
    }
    expect((await middleware(req('/api/news', { token: TOKEN }))).status).toBe(200)
    // 计数已清零：再错 4 次也不该封禁
    for (let i = 0; i < 4; i += 1) {
      expect((await middleware(req('/api/news', { token: 'wrong' }))).status).toBe(403)
    }
  })

  describe('路径与方法过滤', () => {
    it('公开 GET 请求直接放行（不触发鉴权）', async () => {
      // /api/news 的 GET 是公开读；middleware 不应拦截
      const res = await middleware(req('/api/news', { method: 'GET' }))
      expect(res.headers.get('x-middleware-next')).toBe('1')
      expect(adminAuthLimiter.size).toBe(0)
    })

    it('/api/admin/* 的 GET 仍需鉴权（运维仪表盘不可公开）', async () => {
      const res = await middleware(req('/api/admin/metrics', { method: 'GET' }))
      expect(res.status).toBe(403)
    })

    it('/api/archive POST 受保护', async () => {
      expect((await middleware(req('/api/archive', { token: 'wrong' }))).status).toBe(403)
      expect((await middleware(req('/api/archive', { token: TOKEN }))).status).toBe(200)
    })

    it('/api/admin/revalidate POST 受保护', async () => {
      expect((await middleware(req('/api/admin/revalidate', { token: 'wrong' }))).status).toBe(403)
      expect((await middleware(req('/api/admin/revalidate', { token: TOKEN }))).status).toBe(200)
    })
  })

  it('IP 提取优先信任 x-vercel-forwarded-for（上游代理无法覆盖）', async () => {
    // 先用 x-vercel-forwarded-for 打满 5 次
    for (let i = 0; i < 5; i += 1) {
      const reqVercel = new NextRequest('http://localhost/api/news', {
        method: 'POST',
        headers: { 'x-vercel-forwarded-for': '7.7.7.7', 'x-admin-token': 'bad' },
      })
      await middleware(reqVercel)
    }
    // 若被伪造的 x-real-ip 能覆盖身份，攻击者就能靠换头绕过封禁。
    // 这里 x-real-ip 与 x-vercel-forwarded-for 不一致，必须以 vercel 头为准 → 仍 429
    const spoofed = new NextRequest('http://localhost/api/news', {
      method: 'POST',
      headers: {
        'x-vercel-forwarded-for': '7.7.7.7',
        'x-real-ip': '8.8.8.8',
        'x-admin-token': TOKEN,
      },
    })
    expect((await middleware(spoofed)).status).toBe(429)
  })

  it('IP 缺失时归入 unknown 桶（宁可误伤不放空）', async () => {
    for (let i = 0; i < 5; i += 1) {
      const noIp = new NextRequest('http://localhost/api/news', {
        method: 'POST',
        headers: { 'x-admin-token': 'bad' },
      })
      await middleware(noIp)
    }
    const another = new NextRequest('http://localhost/api/news', {
      method: 'POST',
      headers: { 'x-admin-token': 'bad' },
    })
    expect((await middleware(another)).status).toBe(429)
  })

  it('config.matcher 必须是字面量数组（Next.js 静态解析，禁展开运算符）', () => {
    // 真实构建失败过：middleware 的 config 由 Next.js 在构建期静态解析，
    // 写成 `matcher: [...SOME_CONST]` 会直接报
    //   Unsupported spread operator in the Array Expression at "config.matcher"
    // 该错误只在 next build 时暴露（沙盒因内存无法跑 build），代价是白等一轮 CI。
    // 这里读源码断言，把这条约束前移到单测 —— 构建期才发现的错误不该再发生第二次。
    const src = fs.readFileSync(path.join(process.cwd(), 'src/middleware.ts'), 'utf-8')
    expect(src).not.toMatch(/matcher:\s*\[\.\.\./)
    // 同时确认 matcher 里没有变量引用（只允许字符串字面量）
    const matcherBlock = src.match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(matcherBlock, '未找到 matcher 定义').not.toBe('')
    const entries = matcherBlock
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      // 只允许 '字符串字面量'；出现变量名/展开表达式都会不匹配
      expect(e, `matcher 项必须是字符串字面量，实际为: ${e}`).toMatch(/^'[^']*'$/)
    }
  })

  it('matcher 覆盖全部管理员写路径', () => {
    const patterns = [...config.matcher].join(' ')
    expect(patterns).toContain('/api/news')
    expect(patterns).toContain('/api/archive')
    expect(patterns).toContain('/api/admin')
  })
})
