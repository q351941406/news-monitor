/**
 * 抓取结果健全性校验 —— 防止「源不可用」伪装成「正常空结果」
 *
 * 存在的理由（真实事故，2026-09 实测确认）：
 * X / Twitter 源在 2026-09-09 ~ 09-18 连续 10 次运行输出 `Fetched 0 items`，
 * 而 workflow **全部 success、零告警**。09-18 修复凭据注入后立刻恢复
 * `Fetched 19~20 items`。
 *
 * 这与 PH 断流 47 天 / X 断流 57 天是同一条根因：
 * 把「源不可用」表达成了「本次没有数据」，于是绿色 = 无事发生。
 *
 * 判据为什么校验 fetched 而不是 stored：
 * 实测三源正常输出恒 > 0（github 13~21 / producthunt 10 / twitter 19~20）；
 * 而 stored 合法可为 0 —— 抓到的条目全都已在库（去重后无新增），
 * 例如 github 出现过 `Fetched 19 / Stored 0`，属正常。
 *
 * 「长期无新内容」不会被漏检：重复条目走 onConflictDoNothing，
 * 不推进 raw_items.fetched_at，getLastIngestedBySource 因此不前进，
 * 由时间维度的新鲜度巡检（src/lib/freshness.ts + scripts/check-freshness.ts）兜住。
 */
import { isSourceExplicitlySkipped, SOURCE_CREDENTIALS } from '@/sources/credentials'

/** 判据：源本次返回 0 条即视为故障（纯函数，供测试固化） */
export function shouldFailOnEmptyFetch(fetched: number): boolean {
  return fetched === 0
}

/**
 * 断言本次抓取非空；为空则抛错让 run 红掉。
 *
 * @param slug    数据源标识（用于读取 skipFlag）
 * @param name    数据源显示名（用于可读报错）
 * @param fetched 源本次返回的条目数（过滤后、入库前）
 */
export function assertNonEmptyFetch(slug: string, name: string, fetched: number): void {
  // 显式停用的源：跳过是「有意识的决定」，不算故障
  if (isSourceExplicitlySkipped(slug)) return
  if (!shouldFailOnEmptyFetch(fetched)) return

  const skipFlag = SOURCE_CREDENTIALS[slug]?.skipFlag ?? `SKIP_SOURCE_${slug.toUpperCase()}`
  throw new Error(
    `${name} 本次抓取返回 0 条 —— 这不是「没有数据」，是「源不可用」。\n` +
      `  → 实测正常基线：github 13~21 / producthunt 10 / twitter 19~20 条。\n` +
      `  → 返回 0 条说明源侧已损坏（凭据失效、上游改版、CLI 异常等）。\n` +
      `  → 历史事故：X 源曾连续 10 天 Fetched 0 而 workflow 全绿，断流 57 天无人察觉。\n` +
      `  → 若确实要临时停用此源，请显式设置 ${skipFlag}=1（让停用成为一次有意识的决定）。`,
  )
}
