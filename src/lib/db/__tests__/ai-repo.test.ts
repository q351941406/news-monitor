import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestDb, createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import { storeAIAnalysis, getUnprocessedItems } from '../ai-repo'
import { aiAnalysis } from '../../schema'
import { eq } from 'drizzle-orm'
import type { NewRawItem } from '../../schema'

describe('AIRepo', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('存储 AI 分析结果并支持 upsert 幂等', async () => {
    const item = insertTestItem({ id: 'test:ai:1' }) as NewRawItem
    await storeRawItems([item])
    await storeAIAnalysis('test:ai:1', 'first summary', 'first details')
    await storeAIAnalysis('test:ai:1', 'updated summary', 'updated details')

    const db = getTestDb()
    const rows = await db.select().from(aiAnalysis).where(eq(aiAnalysis.itemId, 'test:ai:1'))
    expect(rows).toHaveLength(1)
    expect(rows[0].summary).toBe('updated summary')
    expect(rows[0].details).toBe('updated details')
  })

  it('存储无 details 的分析结果时 details 为 null', async () => {
    const item = insertTestItem({ id: 'test:ai:2' }) as NewRawItem
    await storeRawItems([item])
    await storeAIAnalysis('test:ai:2', 'no details')
    const db = getTestDb()
    const rows = await db.select().from(aiAnalysis).where(eq(aiAnalysis.itemId, 'test:ai:2'))
    expect(rows[0].details).toBeNull()
  })

  it('getUnprocessedItems 只返回未分析条目且按时间倒序', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:ai:unproc1', fetchedAt: 1000 }) as NewRawItem,
      insertTestItem({ id: 'test:ai:unproc2', fetchedAt: 2000 }) as NewRawItem,
      insertTestItem({ id: 'test:ai:proc', fetchedAt: 3000 }) as NewRawItem,
    ])
    await storeAIAnalysis('test:ai:proc', 'done')

    const unprocessed = await getUnprocessedItems('github')
    const ids = unprocessed.map((i) => i.id)
    expect(ids).toContain('test:ai:unproc1')
    expect(ids).toContain('test:ai:unproc2')
    expect(ids).not.toContain('test:ai:proc')
    // 倒序：unproc2 (2000) 应在 unproc1 (1000) 前面
    const i1 = ids.indexOf('test:ai:unproc2')
    const i2 = ids.indexOf('test:ai:unproc1')
    expect(i1).toBeLessThan(i2)
  })

  it('getUnprocessedItems 尊重 limit 参数', async () => {
    const items: NewRawItem[] = []
    for (let i = 0; i < 5; i++) {
      items.push(insertTestItem({ id: `test:ai:limit:${i}`, fetchedAt: i }) as NewRawItem)
    }
    await storeRawItems(items)
    const limited = await getUnprocessedItems('github', 2)
    expect(limited.length).toBeLessThanOrEqual(2)
  })
})
