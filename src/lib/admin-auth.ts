import { NextRequest } from 'next/server'
import { extractProvidedToken, verifyAdminToken } from './admin-token-verify'

/**
 * 极简管理员鉴权（单人系统专用）
 *
 * 机制：
 * - 读操作（GET）公开，任何人都能看
 * - 写操作 / 管理接口必须携带有效的 ADMIN_TOKEN
 * - token 通过 header `x-admin-token` 或 `Authorization: Bearer <token>` 传递
 *
 * 分层防御：
 * - `middleware.ts`（Edge）：先做限流 + token 校验，失败尝试**不消耗**函数与数据库
 * - 本模块（Node）：路由内的最终防线。即便 middleware 被绕过或规则变更，
 *   写操作仍然 fail-closed。
 *
 * 校验算法只有一份实现（`admin-token-verify.ts`），避免两侧漂移。
 */

/**
 * 校验请求是否携带有效管理员 token
 *
 * 注意是 async：Web Crypto 的 `crypto.subtle.digest` 为异步接口。
 * 这也让本模块可在 Node / Edge 两种运行时下行为一致。
 */
export async function isAdminAuthorized(req: NextRequest): Promise<boolean> {
  // 未配置 ADMIN_TOKEN 时：出于安全，拒绝所有管理操作（fail-closed）
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return false

  const provided = extractProvidedToken(req.headers)
  return verifyAdminToken(provided, expected)
}

/**
 * 返回 403 响应（无权限）
 */
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Forbidden: admin token required' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 返回 429 响应（触发限流）
 * 带 `Retry-After`，便于合法用户知道何时可重试。
 */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many failed attempts. Please try again later.',
      retryAfter: retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, retryAfterSeconds)),
      },
    },
  )
}
