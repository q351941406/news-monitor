/**
 * 分批消费循环 —— 抓取 / 富化拆分后的积压消化工具
 *
 * 背景（ADR-0009）：把富化从抓取管线里拆出来后，单次运行要消化的积压从
 * 「一轮抓取的十几条」变成「一天累积的数十条」，而 ai-process 与 topic-aggregate
 * 单批都只取 50 条 —— 不循环就永远追不上积压，队列只会越积越长。
 *
 * 抽成纯函数而非在两处各写一遍循环，是为了让「何时停止、达上限怎么办」这套
 * 边界行为可被单测覆盖（见 scripts/__tests__/drain.test.ts）。
 */
export interface DrainResult {
  /** 本次运行消费的总条数 */
  total: number
  /** 实际跑了多少轮 */
  rounds: number
  /** 是否因达轮次上限而停止（true = 仍有积压未消费，留待下轮） */
  hitLimit: boolean
}

/**
 * 反复调用 consumeOneBatch 直到它返回 0（无积压）或达到 maxRounds。
 *
 * 约定：consumeOneBatch 返回本轮实际消费条数；返回 0 表示已无待处理项。
 * 注意「一轮消费数 < 批大小」并不代表清空（可能因跳过/失败而少消费），
 * 因此只有明确的 0 才终止 —— 这是刻意的保守选择。
 */
export async function drainBatches(
  consumeOneBatch: () => Promise<number>,
  maxRounds: number,
): Promise<DrainResult> {
  let total = 0
  let rounds = 0
  for (let round = 1; round <= maxRounds; round++) {
    const consumed = await consumeOneBatch()
    total += consumed
    rounds = round
    if (consumed === 0) {
      return { total, rounds, hitLimit: false }
    }
  }
  return { total, rounds, hitLimit: true }
}
