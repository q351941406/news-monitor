/**
 * 受管理员鉴权保护的路径与判定规则。
 *
 * 为什么单独成模块：`middleware.ts` 只应导出 Next.js 认识的两个符号
 * （`middleware` 与 `config`）。把 matcher 与判定逻辑放在这里，
 * 既能让测试直接引用同一份定义（避免「测试断言的字面量」与
 * 「实际配置」漂移），也不给 middleware 文件增加额外导出。
 */

/** middleware matcher：覆盖全部管理员写操作与运维接口 */
export const ADMIN_PROTECTED_MATCHER = [
  '/api/news/:path*',
  '/api/archive/:path*',
  '/api/admin/:path*',
] as const

/**
 * 判断该请求是否必须携带管理员 token。
 *
 * - `/api/admin/*`：连 GET 也受保护（运维仪表盘不可公开）
 * - 其他匹配路径：仅写方法受保护，GET/HEAD 是公开读操作
 */
export function requiresAdminToken(pathname: string, method: string): boolean {
  const isAdminPath = pathname.startsWith('/api/admin/')
  const isWrite = method !== 'GET' && method !== 'HEAD'
  return isAdminPath || isWrite
}
