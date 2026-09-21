/**
 * 管理员 token 校验 —— **单一实现**，Node 与 Edge 运行时共用。
 *
 * 为什么单独成模块：
 * 校验逻辑同时被 `admin-auth.ts`（Node 运行时，route handler 的最终防线）
 * 和 `middleware.ts`（Edge 运行时，零成本前置拦截）使用。本仓库曾因
 * 「同一契约分置两处却无机器校验」导致 Product Hunt 断流 47 天，因此
 * 这里刻意只保留一份实现，杜绝两侧算法漂移。
 *
 * 安全要点：
 * - 用 Web Crypto 做 SHA-256 归一化，两侧摘要等长（32 字节），
 *   比较时不存在长度差异，不泄露 token 长度。
 * - 逐字节 XOR 累加，**无提前返回**，避免短路比较泄露「前几位猜对了」。
 * - `expected` 为空时 fail-closed（未配置 = 拒绝一切写操作）。
 */

/** 从请求头提取待校验的 token：`x-admin-token` 优先，其次 `Authorization: Bearer` */
export function extractProvidedToken(headers: Headers): string {
  const header = headers.get('x-admin-token') || ''
  const bearer = headers.get('authorization') || ''
  const bearerToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : ''
  return header || bearerToken
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return new Uint8Array(digest)
}

/**
 * 恒定时间比较 `provided` 是否等于 `expected`。
 * 任意一侧为 undefined/空串时返回 false（fail-closed）。
 */
export async function verifyAdminToken(
  provided: string,
  expected: string | undefined,
): Promise<boolean> {
  if (!expected) return false
  // 同时摘要，避免先算一侧再算另一侧带来的额外时序差异
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] as number) ^ (b[i] as number)
  }
  return diff === 0
}
