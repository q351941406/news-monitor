import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestDb, createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import { getUnreadCount, cleanupOldData } from '../stats-repo'
import { rawItems } from '../../schema'
import type { NewRawItem } from '../../schema'

describe('StatsRepo', () => {
  beforeAll(async () => {
    await createTestTables()
  })

  afterAll(async () => {
    await dropTestSchema()
  })

  it('按来源统计未读', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:stats:src1', source: 'github', isRead: false }) as NewRawItem,
      insertTestItem({ id: 'test:stats:src2', source: 'github', isRead: false }) as NewRawItem,
      insertTestItem({ id: 'test:stats:src3', source: 'github', isRead: true }) as NewRawItem,
    ])
    const count = await getUnreadCount('github')
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('所有来源未读计数', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:stats:all1', source: 'github', isRead: false }) as NewRawItem,
      insertTestItem({ id: 'test:stats:all2', source: 'producthunt', isRead: false }) as NewRawItem,
    ])
    const total = await getUnreadCount()
    expect(total).toBeGreaterThanOrEqual(2)
  })

  it('清理过期数据', async () => {
    const oldItem = insertTestItem({
      id: 'test:stats:old',
      fetchedAt: Date.now() - 100 * 86400 * 1000, // 100 天前
    }) as NewRawItem
    await storeRawItems([oldItem])
    await cleanupOldData(30) // 清理 30 天前的
    const exists = await existsItem('test:stats:old')
    expect(exists).toBe(false)
  })
})

async function existsItem(id: string): Promise<boolean> {
  const db = getTestDb()
  const result = await db.select({ id: rawItems.id }).from(rawItems).where(eq(rawItems.id, id))
  return result.length > 0
}
import { eq } from 'drizzle-orm'
