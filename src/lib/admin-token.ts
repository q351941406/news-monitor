/**
 * 前端管理员 token 管理（浏览器端）
 *
 * token 存 localStorage，页面加载时读取，决定是否进入"管理员模式"
 * 访客模式下：只读，所有操作按钮隐藏
 * 管理员模式下：可标记已读/重置等
 */

const TOKEN_KEY = 'news_monitor_admin_token'

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function isAdminMode(): boolean {
  return !!getAdminToken()
}

/**
 * 给 fetch 请求附加管理员 token header（若有）
 */
export function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAdminToken()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('x-admin-token', token)
  }
  return fetch(input, { ...init, headers })
}
