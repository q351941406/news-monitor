import { describe, it, expect } from 'vitest'
import { drainBatches } from '../drain'

/** 构造一个按脚本返回消费数的假批处理器 */
function scripted(counts: number[]) {
  let i = 0
  return async () => counts[Math.min(i++, counts.length - 1)]
}

describe('drainBatches - 积压消化循环', () => {
  it('逐批消费直到返回 0', async () => {
    const r = await drainBatches(scripted([50, 50, 10, 0]), 20)
    expect(r).toEqual({ total: 110, rounds: 4, hitLimit: false })
  })

  it('首批就无积压 → 只跑一轮', async () => {
    const r = await drainBatches(scripted([0]), 20)
    expect(r).toEqual({ total: 0, rounds: 1, hitLimit: false })
  })

  it('一直有积压 → 达上限停止并标记 hitLimit', async () => {
    const r = await drainBatches(scripted([50]), 3)
    expect(r).toEqual({ total: 150, rounds: 3, hitLimit: true })
  })

  it('未达上限就清空 → 不标记 hitLimit', async () => {
    const r = await drainBatches(scripted([50, 0]), 20)
    expect(r.hitLimit).toBe(false)
    expect(r.total).toBe(50)
  })

  it('回归防线：一轮消费数小于批大小不等于清空，必须继续', async () => {
    // 曾想当然地用「< 批大小」当终止条件：AI 跳过/失败会让单轮少消费，
    // 那样会提前收工、把积压留在队列里。只有明确的 0 才允许终止。
    const r = await drainBatches(scripted([7, 7, 0]), 20)
    expect(r.rounds).toBe(3)
    expect(r.total).toBe(14)
  })

  it('maxRounds=1 时最多只跑一轮', async () => {
    const r = await drainBatches(scripted([50]), 1)
    expect(r).toEqual({ total: 50, rounds: 1, hitLimit: true })
  })
})
