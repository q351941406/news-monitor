import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, dropTestSchema } from './db-test-helper'
import { withRunLog } from '../../run-logger'
import { getRecentRuns } from '../run-log-repo'

describe('withRunLog', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('成功时记录 success 日志并返回结果', async () => {
    const result = await withRunLog({ source: 'github', stage: 'scrape' }, async () => {
      return { itemsCount: 5 }
    })
    expect(result.itemsCount).toBe(5)
    const runs = await getRecentRuns(5)
    const mine = runs.find((r) => r.source === 'github' && r.stage === 'scrape')
    expect(mine).toBeDefined()
    expect(mine!.status).toBe('success')
    expect(mine!.itemsCount).toBe(5)
  })

  it('itemsCount 缺失时记 0', async () => {
    await withRunLog({ source: 'producthunt', stage: 'scrape' }, async () => ({}))
    const runs = await getRecentRuns(10)
    const mine = runs.find((r) => r.source === 'producthunt')
    expect(mine!.itemsCount).toBe(0)
  })

  it('失败时记录 failure 日志并重新抛出错误', async () => {
    await expect(
      withRunLog({ source: 'twitter', stage: 'ai-process' }, async () => {
        throw new Error('worker crashed')
      }),
    ).rejects.toThrow('worker crashed')
    const runs = await getRecentRuns(10)
    const mine = runs.find((r) => r.source === 'twitter')
    expect(mine).toBeDefined()
    expect(mine!.status).toBe('failure')
    expect(mine!.error).toContain('worker crashed')
  })

  it('非 Error 异常也记录为字符串', async () => {
    await expect(
      withRunLog({ source: 'github', stage: 'topic-aggregate' }, async () => {
        throw 'plain string error'
      }),
    ).rejects.toBe('plain string error')
    const runs = await getRecentRuns(10)
    const mine = runs.find((r) => r.stage === 'topic-aggregate')
    expect(mine!.error).toContain('plain string error')
  })
})
