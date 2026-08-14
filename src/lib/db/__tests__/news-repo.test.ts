import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import {
  storeRawItems,
  existsItem,
  getNews,
  getArchivedNews,
  getNewsCounts,
  deleteItem,
} from '../news-repo'
import type { NewRawItem } from '../../schema'

describe('NewsRepo', () => {
  beforeAll(async () => {
    await createTestTables()
  })

  afterAll(async () => {
    await dropTestSchema()
  })

  it('存储新新闻', async () => {
    const item = insertTestItem({ id: 'test:news:1', title: 'Test Repo' }) as NewRawItem
    const count = await storeRawItems([item])
    expect(count).toBe(1)
  })

  it('重复插入不会增加', async () => {
    const item = insertTestItem({ id: 'test:news:dup', title: 'Dup' }) as NewRawItem
    await storeRawItems([item])
    const count = await storeRawItems([item])
    expect(count).toBe(0)
  })

  it('检查已存在的项目', async () => {
    await storeRawItems([insertTestItem({ id: 'test:news:exists' }) as NewRawItem])
    const exists = await existsItem('test:news:exists')
    expect(exists).toBe(true)
    const notExists = await existsItem('test:news:nonexistent')
    expect(notExists).toBe(false)
  })
  it('getNews：默认只返回未读，showAll=true 返回全部', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:news:gn1', source: 'github', isRead: false }) as NewRawItem,
      insertTestItem({ id: 'test:news:gn2', source: 'github', isRead: true }) as NewRawItem,
    ])
    const unread = await getNews('github')
    expect(unread.length).toBeGreaterThanOrEqual(1)
    expect(unread.every((n) => !n.isRead)).toBe(true)
    const all = await getNews('github', 50, true)
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('getNewsCounts：返回各来源 total 与 unread', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:news:gc1', source: 'github', isRead: false }) as NewRawItem,
      insertTestItem({ id: 'test:news:gc2', source: 'github', isRead: true }) as NewRawItem,
    ])
    const counts = await getNewsCounts()
    expect(counts.github.total).toBeGreaterThanOrEqual(2)
    expect(counts.github.unread).toBeGreaterThanOrEqual(1)
  })

  it('getArchivedNews：source/q/days 过滤 + 总数统计', async () => {
    await storeRawItems([
      insertTestItem({
        id: 'test:news:ar1',
        source: 'github',
        title: 'TypeScript Tips',
        isRead: true,
      }) as NewRawItem,
      insertTestItem({
        id: 'test:news:ar2',
        source: 'producthunt',
        title: 'Cool Product',
        isRead: true,
      }) as NewRawItem,
      insertTestItem({
        id: 'test:news:ar3',
        source: 'github',
        title: 'Rust Guide',
        isRead: true,
        fetchedAt: Date.now() - 10 * 86400000,
      }) as NewRawItem,
    ])
    // 按来源过滤
    const bySource = await getArchivedNews({ source: 'github', page: 1, pageSize: 10 })
    expect(bySource.total).toBeGreaterThanOrEqual(2)
    expect(bySource.items.every((n) => n.source === 'github')).toBe(true)
    // 关键词过滤
    const byQ = await getArchivedNews({ q: 'TypeScript', page: 1, pageSize: 10 })
    expect(byQ.total).toBeGreaterThanOrEqual(1)
    expect(byQ.items[0].title).toContain('TypeScript')
    // 时间过滤（3 天内）
    const byDays = await getArchivedNews({ days: 3, page: 1, pageSize: 10 })
    const recent = byDays.items.filter((n) => n.id === 'test:news:ar1' || n.id === 'test:news:ar2')
    expect(recent.length).toBeGreaterThanOrEqual(1)
  })

  it('deleteItem：物理删除条目', async () => {
    await storeRawItems([insertTestItem({ id: 'test:news:del1' }) as NewRawItem])
    await deleteItem('test:news:del1')
    const exists = await existsItem('test:news:del1')
    expect(exists).toBe(false)
  })
})
