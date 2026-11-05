/**
 * 已读内容保留期计算（纯函数，便于单测）
 *
 * 语义：条目被标记已读后保留 READ_RETENTION_DAYS 天，到期由 cleanup 脚本物理删除。
 * 未读条目不受保留期影响 —— 没看过的内容不删。
 */

/** 默认保留 30 天 */
export const DEFAULT_READ_RETENTION_DAYS = 30

/** 上限 10 年：防止误传巨大的值让清理永不生效（也防溢出） */
export const MAX_READ_RETENTION_DAYS = 3650

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 解析保留天数。非法 / 缺失 / 非正数一律回落到默认值，
 * 避免「配置写错 → 保留期变成 0 天 → 刚读就被删」这种危险行为。
 */
export function resolveRetentionDays(raw?: string | number | null): number {
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_READ_RETENTION_DAYS
  return Math.min(Math.floor(parsed), MAX_READ_RETENTION_DAYS)
}

/** 计算删除截止时间：read_at 早于该时间戳的已读条目会被清理 */
export function computeCutoff(nowMs: number, days: number): number {
  return nowMs - days * DAY_MS
}
