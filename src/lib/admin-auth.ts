import { NextRequest } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'

/**
 * 极简管理员鉴权（单人系统专用）
 *
 * 机制：
 * - 读操作（GET）公开，任何人都能看
 * - 写操作 / 管理接口必须携带有效的 ADMIN_TOKEN
 * - token 通过 header `x-admin-token` 或 `Authorization: Bearer <token>` 传递
 *
 * 安全说明：这是"公开读 + 受控写"的极简方案，适合个人使用。
 * 若未来需要多用户/精细化权限，应替换为完整认证系统。
 */

/**
 * 校验请求是否携带有效管理员 token
 */
export function isAdminAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN
  // 未配置 ADMIN_TOKEN 时：出于安全，拒绝所有管理操作（fail-closed）
  if (!expected) return false

  const header = req.headers.get('x-admin-token') || ''
  const bearer = req.headers.get('authorization') || ''
  const bearerToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : ''

  const provided = header || bearerToken
  // 恒定时间比较：先 SHA-256 归一化为等长摘要，避免长度不同抛错 / 泄露长度信息
  return timingSafeEqual(
    createHash('sha256').update(provided).digest(),
    createHash('sha256').update(expected).digest(),
  )
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
