import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import { getUnreadCount } from '../stats-repo'
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
})
