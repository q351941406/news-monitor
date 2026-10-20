/**
 * 可展示性检查 —— 「有数字、没内容」的唯一兜底
 *
 * 存在的理由（真实事故 2026-10）：
 * 徽标数字统计的是 `raw_items` 的未读行数，列表渲染的却是 `topic_groups`。
 * 两套口径一旦脱钩（内容已入库、但没挂上任何主题组），
 * 用户看到的就是一个**无法解释的数字**：GitHub 徽标显示 8、列表整页空白，
 * 而这 8 条在首页、归档页全都无处可寻（归档页只收已读条目）。
 *
 * 而新鲜度巡检（check-freshness）只看「最后入库时间」——
 * 数据天天有入库，巡检永远绿，永远发现不了这件事。
 *
 * 本模块从**可展示性**维度告警：
 * 1. 某源有未读内容、却一个主题组都没有 → 列表整页空白（最严重）
 * 2. 某源的未读内容卡在「未归组」超过阈值 → 内容进去了，却没人看得见
 */

/** 默认卡住阈值（小时）：超过此时长仍未归组即视为异常 */
export const DEFAULT_STUCK_HOURS = 24

export interface VisibilityInput {
  source: string
  /** 该源未读条数 */
  unread: number
  /** 该源主题组数量 */
  groupCount: number
  /** 未读且未归组的条数 */
  ungroupedCount: number
  /** 未读且未归组中最早一条的抓取时间（ms）；null = 无 */
  oldestUngroupedAt: number | null
}

export interface VisibilityAlert {
  type: 'no_groups' | 'stuck_ungrouped'
  source: string
  message: string
  /** 受影响条数 */
  count: number
  /** 已卡住时长（小时）；no_groups 时为 0 */
  stuckHours: number
}

/**
 * 检测「有数字、没内容」
 *
 * @param inputs 各源的可展示性快照
 * @param now 当前时间（注入以便测试）
 * @param stuckHours 卡住阈值（小时）
 */
export function detectVisibilityIssues(
  inputs: VisibilityInput[],
  now: number = Date.now(),
  stuckHours: number = DEFAULT_STUCK_HOURS,
): VisibilityAlert[] {
  const alerts: VisibilityAlert[] = []
  const thresholdMs = stuckHours * 60 * 60 * 1000

  for (const input of inputs) {
    // 情形一：有未读内容，但一个主题组都没有 → 列表整页空白
    if (input.unread > 0 && input.groupCount === 0) {
      alerts.push({
        type: 'no_groups',
        source: input.source,
        message: `有 ${input.unread} 条未读内容，但该源一个主题组都没有（列表整页空白）`,
        count: input.unread,
        stuckHours: 0,
      })
      continue
    }

    // 情形二：未读内容卡在「未归组」超过阈值
    // 刚抓到、还没轮到富化/聚合的条目属于「在途」，用最早一条的年龄区分，
    // 避免对正常在途的数据误报。
    if (input.ungroupedCount > 0 && input.oldestUngroupedAt !== null) {
      const stuckMs = now - input.oldestUngroupedAt
      if (stuckMs > thresholdMs) {
        alerts.push({
          type: 'stuck_ungrouped',
          source: input.source,
          message: `${input.ungroupedCount} 条未读内容超过 ${stuckHours} 小时仍未归入主题`,
          count: input.ungroupedCount,
          stuckHours: Math.floor(stuckMs / (60 * 60 * 1000)),
        })
      }
    }
  }

  return alerts
}
