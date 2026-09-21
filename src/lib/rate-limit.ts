/**
 * 管理员鉴权限流（滑动窗口日志）
 *
 * ## 为什么存在
 *
 * `ADMIN_TOKEN` 是弱口令（用户知情选择）。**限流不能让弱口令变强** ——
 * 攻击者字典的第一条就可能命中，根本不会触发第 5 次锁定。
 *
 * 它真正的作用只有一个：**阻止「持续穷举」**（攻击者不知道值、只是盲试时，
 * 拖住高频尝试）。已认证请求的速率**不**受本模块限制 —— 鉴权成功即清零计数，
 * 这是刻意的（避免误伤正常的批量操作）。若将来需要限制已认证请求的频率，
 * 需另加一层配额，不要指望这里。
 *
 * ## 设计约束（来自本项目真实事故，勿轻易推翻）
 *
 * 1. **失败尝试绝不触碰数据库。** Neon 按 compute 活跃时长计费，历史上
 *    `/api/health` 查库曾导致额度超额 62%。限流若每次失败都写库，等于
 *    给攻击者一个「烧你数据库账单」的按钮。因此本模块纯内存、零 I/O。
 * 2. **内存必须有界。** `Map` 按 key 无限增长就是内存泄漏，攻击者可用
 *    海量伪造 IP 撑爆实例。因此有 `maxTrackedKeys` 上限与定期清扫。
 * 3. **时间必须可注入。** 所有方法接收 `now`，不读 `Date.now()`，
 *    使限流行为可在测试中确定性复现（否则只能靠 sleep，慢且易 flaky）。
 *
 * ## 已知局限（诚实记录）
 *
 * serverless 多实例之间**不共享**计数。攻击者若被负载均衡轮转到不同实例，
 * 实际尝试次数会高于 `maxFailures`。对个人站点足够；若将来需要全局精确
 * 限流，应换成边缘 KV / Redis（需评估成本）。
 */

export interface RateLimitVerdict {
  /** 当前是否已被封禁 */
  blocked: boolean
  /** 被封禁时，还需等待多少秒 */
  retryAfterSeconds: number
  /** 当前窗口内还剩几次尝试机会 */
  remaining: number
}

export interface RateLimiterOptions {
  /** 窗口内允许的失败次数上限，达到即封禁 */
  maxFailures: number
  /** 滑动窗口长度（毫秒） */
  windowMs: number
  /** 触发后的封禁时长（毫秒） */
  blockMs: number
  /** 最多追踪多少个 key，防止内存无限增长 */
  maxTrackedKeys: number
}

export const DEFAULT_RATE_LIMIT: RateLimiterOptions = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
  maxTrackedKeys: 10_000,
}

interface Entry {
  /** 窗口内的失败时间戳（毫秒） */
  failures: number[]
  /** 封禁截止时间戳；0 表示未封禁 */
  blockedUntil: number
}

export class SlidingWindowRateLimiter {
  private readonly options: RateLimiterOptions
  private readonly entries = new Map<string, Entry>()

  constructor(options: Partial<RateLimiterOptions> = {}) {
    this.options = { ...DEFAULT_RATE_LIMIT, ...options }
  }

  /** 当前追踪的 key 数量（测试用，也用于断言内存有界） */
  get size(): number {
    return this.entries.size
  }

  /** 清空全部状态（测试用） */
  reset(): void {
    this.entries.clear()
  }

  /**
   * 查询 key 当前状态。**不改动失败计数**，但会顺手清理过期条目，
   * 避免「只查询不失败」的路径让 Map 无限膨胀。
   */
  inspect(key: string, now: number): RateLimitVerdict {
    const entry = this.entries.get(key)
    if (!entry) {
      return { blocked: false, retryAfterSeconds: 0, remaining: this.options.maxFailures }
    }

    if (entry.blockedUntil > now) {
      return {
        blocked: true,
        retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000),
        remaining: 0,
      }
    }

    const recent = entry.failures.filter((t) => now - t < this.options.windowMs)

    // 窗口已完全滑过且不在封禁中 → 条目无用，删除以防泄漏
    if (recent.length === 0) {
      this.entries.delete(key)
      return { blocked: false, retryAfterSeconds: 0, remaining: this.options.maxFailures }
    }

    if (recent.length !== entry.failures.length) entry.failures = recent

    return {
      blocked: false,
      retryAfterSeconds: 0,
      remaining: Math.max(0, this.options.maxFailures - recent.length),
    }
  }

  /** 记录一次鉴权失败；达到阈值即开始封禁 */
  recordFailure(key: string, now: number): void {
    this.sweep(now)

    let entry = this.entries.get(key)
    if (!entry) {
      entry = { failures: [], blockedUntil: 0 }
      this.entries.set(key, entry)
    }

    entry.failures = entry.failures.filter((t) => now - t < this.options.windowMs)
    entry.failures.push(now)

    if (entry.failures.length >= this.options.maxFailures) {
      entry.blockedUntil = now + this.options.blockMs
    }

    this.enforceBounds()
  }

  /** 记录一次鉴权成功：立即清零该 key 的失败记录 */
  recordSuccess(key: string): void {
    this.entries.delete(key)
  }

  /** 清理「窗口已过期且不在封禁中」的条目 */
  private sweep(now: number): void {
    for (const [key, entry] of this.entries) {
      const expired =
        entry.blockedUntil <= now && entry.failures.every((t) => now - t >= this.options.windowMs)
      if (expired) this.entries.delete(key)
    }
  }

  /**
   * 保证 Map 大小有界。优先淘汰「未在封禁中」的最老条目 ——
   * 淘汰封禁中的条目会削弱防护，所以放在最后手段。
   */
  private enforceBounds(): void {
    if (this.entries.size <= this.options.maxTrackedKeys) return

    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.options.maxTrackedKeys) return
      if (entry.blockedUntil === 0) this.entries.delete(key)
    }

    // 极端情况：剩下的全在封禁中，仍要淘汰，否则内存无界
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.options.maxTrackedKeys) return
      this.entries.delete(key)
    }
  }
}

/** middleware 使用的进程内单例 */
export const adminAuthLimiter = new SlidingWindowRateLimiter()
