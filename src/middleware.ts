import { NextRequest, NextResponse } from 'next/server'
import { extractProvidedToken, verifyAdminToken } from '@/lib/admin-token-verify'
import { adminAuthLimiter } from '@/lib/rate-limit'
import { ADMIN_PROTECTED_MATCHER, requiresAdminToken } from '@/lib/admin-paths'

/**
 * 管理员接口的**边缘前置拦截**：限流 + token 校验。
 *
 * ## 为什么放在 middleware
 *
 * middleware 跑在 Edge 运行时，**不消耗 Serverless 函数的数据库连接**。
 * 失败的暴力尝试在这里就被挡掉，Neon compute 完全不会被唤醒 —— 这是
 * 限流能做到「零成本防护」的关键，也避开了本项目历史上因探活查库导致
 * compute 额度超额 62% 的坑。
 *
 * ## 与 route handler 的关系
 *
 * 这里是**前置闸门**，不是唯一防线。`admin-auth.ts` 在各 route 内仍会
 * 独立校验（纵深防御）：即便 middleware 的 matcher 配置被改窄，写操作
 * 依然 fail-closed。两处共用同一份校验实现，不存在算法漂移。
 *
 * ## 判定顺序（重要）
 *
 * 先查限流 → 再验 token。顺序反了会让「已被封禁」的请求仍然执行一次
 * 昂贵的 token 摘要计算；先生效封禁可以直接短路返回。
 */

/** Next.js 要求的 matcher 配置；路径定义在 admin-paths.ts 以免测试与实现漂移 */
export const config = {
  matcher: [...ADMIN_PROTECTED_MATCHER],
}

export async function middleware(request: NextRequest) {
  // 读操作公开：GET 直接放行（/api/admin/* 除外）
  if (!requiresAdminToken(request.nextUrl.pathname, request.method)) {
    return NextResponse.next()
  }

  // IP 提取顺序（可信度从高到低）：
  //   1. x-vercel-forwarded-for —— Vercel 自己设置，且上游代理无法覆盖
  //   2. x-real-ip / x-forwarded-for —— Vercel 文档明确说明会**覆盖**该头以防
  //      IP 伪造（https://vercel.com/docs/headers/request-headers），因此客户端
  //      无法自造 IP 来绕过限流。但在 Vercel 前面另挂代理时可能被改写。
  //   3. 'unknown' —— 兜底。所有无法识别来源的请求共用一个桶，宁可误伤也不放空。
  const ip =
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'

  const now = Date.now()

  // ① 限流前置：被封禁直接短路，不进入 token 计算
  const verdict = adminAuthLimiter.inspect(ip, now)
  if (verdict.blocked) {
    return NextResponse.json(
      {
        error: 'Too many failed attempts. Please try again later.',
        retryAfter: verdict.retryAfterSeconds,
      },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, verdict.retryAfterSeconds)) } },
    )
  }

  // ② token 校验
  const provided = extractProvidedToken(request.headers)
  const ok = await verifyAdminToken(provided, process.env.ADMIN_TOKEN)

  if (ok) {
    adminAuthLimiter.recordSuccess(ip)
    return NextResponse.next()
  }

  adminAuthLimiter.recordFailure(ip, now)

  // 本次失败刚好触发封禁 → 立刻返回 429，让客户端知道进入冷却
  const afterFailure = adminAuthLimiter.inspect(ip, now)
  if (afterFailure.blocked) {
    return NextResponse.json(
      {
        error: 'Too many failed attempts. Please try again later.',
        retryAfter: afterFailure.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, afterFailure.retryAfterSeconds)) },
      },
    )
  }

  return NextResponse.json({ error: 'Forbidden: admin token required' }, { status: 403 })
}
