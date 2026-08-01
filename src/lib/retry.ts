/**
 * 带重试的工具函数
 * 为外部 HTTP/CLI 调用提供指数退避重试，显著降低网络抖动带来的数据丢失。
 */
export interface RetryOptions {
  /** 最大重试次数（不含首次）。默认 3 */
  retries?: number
  /** 初始退避毫秒。默认 1000 */
  backoffMs?: number
  /** 退避基数（指数），默认 2 */
  factor?: number
  /** 退避上限毫秒，默认 30000 */
  maxBackoffMs?: number
  /** 仅对哪些错误重试。默认 4xx（除 408/429）/ 5xx / 网络错误 */
  retryOn?: (err: unknown) => boolean
  /** 退避前的钩子（用于日志/metrics）。默认 noop */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void
}

const NETWORK_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']
const HTTP_STATUS_RETRYABLE = new Set([408, 429, 500, 502, 503, 504])

export const defaultShouldRetry = (err: unknown): boolean => {
  // 显式 AbortError 不重试
  if (err instanceof Error && err.name === 'AbortError') return false

  // 网络层错误
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code)
    if (NETWORK_ERRORS.includes(code)) return true
  }

  // fetch 抛出的 HTTP 错误（带 status 字段）
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status: unknown }).status)
    if (HTTP_STATUS_RETRYABLE.has(status)) return true
    // 其他 4xx 通常是客户端错误，不重试
    return false
  }

  // 其他 Error 默认可重试
  return true
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 用指数退避重试执行 fn。
 * 例：const data = await fetchWithRetry(() => fetch(url).then(r => r.json()))
 */
export async function fetchWithRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    backoffMs = 1000,
    factor = 2,
    maxBackoffMs = 30_000,
    retryOn = defaultShouldRetry,
    onRetry,
  } = opts

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const isLast = attempt === retries
      if (isLast || !retryOn(e)) throw e

      // 指数退避 + 30% 抖动，避免雪崩
      const base = Math.min(backoffMs * Math.pow(factor, attempt), maxBackoffMs)
      const jitter = base * 0.3 * Math.random()
      const delay = Math.round(base + jitter)

      onRetry?.(attempt + 1, e, delay)
      await sleep(delay)
    }
  }
  throw lastErr
}

/**
 * 同步 CLI 调用重试（用于 execSync 等同步操作）
 * 与 fetchWithRetry 行为对齐：指数退避 + jitter + 默认 3 次
 */
export interface ExecRetryOptions {
  retries?: number
  baseDelayMs?: number
  maxBackoffMs?: number
  jitterRatio?: number
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
  /** 是否应在错误时重试。默认：进程退出码非 0 时重试 */
  shouldRetry?: (err: unknown, attempt: number) => boolean
}
export function execSyncWithRetry<T>(fn: () => T, opts: ExecRetryOptions = {}): T {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxBackoffMs = 5000,
    jitterRatio = 0.3,
    onRetry,
    shouldRetry = () => true,
  } = opts

  let lastErr: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return fn()
    } catch (e) {
      lastErr = e
      if (attempt === retries - 1) break
      if (!shouldRetry(e, attempt + 1)) break
      const exp = Math.min(maxBackoffMs, baseDelayMs * Math.pow(2, attempt))
      const jitter = exp * jitterRatio * (Math.random() * 2 - 1)
      const delay = Math.max(0, Math.round(exp + jitter))
      onRetry?.(attempt + 1, e, delay)
      // 同步 sleep — 阻塞事件循环（仅用于 CLI 脚本，可接受）
      const end = Date.now() + delay
      while (Date.now() < end) {
        /* busy wait */
      }
    }
  }
  throw lastErr
}
