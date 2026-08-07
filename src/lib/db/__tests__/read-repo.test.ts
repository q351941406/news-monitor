import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import { markAsRead, markAsUnread, markAllAsRead, resetAllRead } from '../read-repo'
import { getUnreadCount } from '../stats-repo'
import type { NewRawItem } from '../../schema'

describe('ReadRepo', () => {
  beforeAll(async () => {
    await createTestTables()
  })

  afterAll(async () => {
    await dropTestSchema()
  })

  it('标记已读后未读计数减少', async () => {
    await storeRawItems([insertTestItem({ id: 'test:read:1', isRead: false }) as NewRawItem])
    const before = await getUnreadCount()
    await markAsRead('test:read:1')
    const after = await getUnreadCount()
    expect(after).toBe(Math.max(0, before - 1))
  })

  it('标记未读后未读计数增加', async () => {
    await storeRawItems([insertTestItem({ id: 'test:unread:1', isRead: true }) as NewRawItem])
    const before = await getUnreadCount()
    await markAsUnread('test:unread:1')
    const after = await getUnreadCount()
    expect(after).toBe(before + 1)
  })

  it('批量标记已读按来源', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:batch:gh', source: 'github', isRead: false }) as NewRawItem,
      insertTestItem({ id: 'test:batch:ph', source: 'producthunt', isRead: false }) as NewRawItem,
    ])
    await markAllAsRead('github')
    const ghUnread = await getUnreadCount('github')
    expect(ghUnread).toBe(0)
    const phUnread = await getUnreadCount('producthunt')
    expect(phUnread).toBeGreaterThanOrEqual(1)
  })

  it('重置所有已读为未读', async () => {
    await storeRawItems([insertTestItem({ id: 'test:reset:1', isRead: true }) as NewRawItem])
    await resetAllRead()
    // 通过接口验证
    const unread = await getUnreadCount()
    expect(unread).toBeGreaterThanOrEqual(1)
  })
})
