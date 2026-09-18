/**
 * 数据新鲜度检查
 *
 * 存在的理由（真实事故）：
 * 原 `detectSilentFailures` 用「连续 3 次同源同阶段 0 条」判定，是**次数**维度。
 * 但各源 cron 频率差异极大（PH 每天 4 次、X 每天 1 次），而它读取的是
 * `getRecentRuns(30)` 的**全局**窗口——实测仅覆盖约 1.7 天。
 * 于是每天只跑 1 次的 X 在窗口内永远凑不齐 3 条同源记录，
 * 告警在数学上不可能触发：X 断流 57 天，dashboard 告警数为 0。
 *
 * 本模块改用**时间**维度：记录每个源「最后一次真正入库数据」的时间，
 * 超过容忍窗口即告警。时间维度对不同频率的源天然免疫。
 */

/** 每个源的容忍窗口（毫秒）。取 cron 间隔的 ~2 倍，容忍一次失败+重试。 */
export const FRESHNESS_TOLERANCE_MS: Record<string, number> = {
  // cron: 0 13 * * * → 每天 1 次
  github: 48 * 60 * 60 * 1000,
  // cron: 30 3 * * * → 每天 1 次
  twitter: 48 * 60 * 60 * 1000,
  // cron: 30 */6 * * * → 每天 4 次
  producthunt: 15 * 60 * 60 * 1000,
}

/** 默认容忍窗口（未登记的源） */
export const DEFAULT_TOLERANCE_MS = 48 * 60 * 60 * 1000

export interface FreshnessInput {
  source: string
  /** 该源最后一次真正抓取到数据的时间戳（ms）。null = 从未成功过 */
  lastIngestedAt: number | null
}

export interface FreshnessAlert {
  type: 'stale_source'
  source: string
  message: string
  /** 已静默时长（小时），便于一眼判断严重程度 */
  staleHours: number
}

/**
 * 检测陈旧数据源
 *
 * @param inputs 各源的最后入库时间
 * @param now 当前时间（注入以便测试）
 */
export function detectStaleSources(
  inputs: FreshnessInput[],
  now: number = Date.now(),
): FreshnessAlert[] {
  const alerts: FreshnessAlert[] = []

  for (const { source, lastIngestedAt } of inputs) {
    const tolerance = FRESHNESS_TOLERANCE_MS[source] ?? DEFAULT_TOLERANCE_MS

    if (lastIngestedAt === null) {
      alerts.push({
        type: 'stale_source',
        source,
        message: '从未成功抓取过数据',
        staleHours: Infinity,
      })
      continue
    }

    const staleMs = now - lastIngestedAt
    if (staleMs > tolerance) {
      const staleHours = Math.floor(staleMs / (60 * 60 * 1000))
      alerts.push({
        type: 'stale_source',
        source,
        message: `已 ${staleHours} 小时无新数据（容忍上限 ${Math.floor(tolerance / 3600000)} 小时）`,
        staleHours,
      })
    }
  }

  return alerts
}
