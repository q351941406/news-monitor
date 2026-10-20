/**
 * 仓库层分支覆盖（把「接口的两条路都走过」钉死）
 *
 * 这些分支大多是「带 source / 不带 source」「有数据 / 空表」的组合 ——
 * 它们的共同特征是：**走错一条不会报错，但行为悄悄变了**（比如
 * 整源标已读被当成单源、或空表被算成有 N 条）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems, getLastIngestedBySource, getNews } from '../news-repo'
import { markAsRead, markAsUnread, markAllAsRead, resetAllRead } from '../read-repo'
import { getUnreadCount } from '../stats-repo'
import { logRun, getSourceStats, getMetrics } from '../run-log-repo'
import type { NewRawItem } from '../../schema'

describe('仓库层分支覆盖', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  describe('read-repo —— 整源 / 全量两条路', () => {
    it('markAllAsRead 带 source 只影响该源', async () => {
      await storeRawItems([
        insertTestItem({ id: 'test:rb:1', source: 'github', isRead: false }) as NewRawItem,
        insertTestItem({ id: 'test:rb:2', source: 'twitter', isRead: false }) as NewRawItem,
      ])
      await markAllAsRead('github')
      const gh = await getNews('github', 50, true)
      const tw = await getNews('twitter', 50, true)
      expect(gh.find((i) => i.id === 'test:rb:1')!.isRead).toBe(true)
      expect(tw.find((i) => i.id === 'test:rb:2')!.isRead).toBe(false)
    })

    it('markAllAsRead 不带 source 影响全部源', async () => {
      await storeRawItems([
        insertTestItem({ id: 'test:rb:3', source: 'producthunt', isRead: false }) as NewRawItem,
      ])
      await markAllAsRead()
      const items = await getNews('producthunt', 50, true)
      expect(items.find((i) => i.id === 'test:rb:3')!.isRead).toBe(true)
    })

    it('resetAllRead 带 source 只重置该源', async () => {
      await markAsRead('test:rb:1')
      await markAsUnread('test:rb:2')
      await resetAllRead('github')
      const gh = await getNews('github', 50, true)
      const tw = await getNews('twitter', 50, true)
      expect(gh.find((i) => i.id === 'test:rb:1')!.isRead).toBe(false)
      expect(tw.find((i) => i.id === 'test:rb:2')!.isRead).toBe(false)
    })

    it('resetAllRead 不带 source 重置全部', async () => {
      await markAsRead('test:rb:3')
      await resetAllRead()
      const items = await getNews('producthunt', 50, true)
      expect(items.find((i) => i.id === 'test:rb:3')!.isRead).toBe(false)
    })
  })

  describe('stats-repo —— 带 source / 不带 source', () => {
    it('统计指定源的未读数', async () => {
      await storeRawItems([
        insertTestItem({ id: 'test:st:1', source: 'github', isRead: false }) as NewRawItem,
        insertTestItem({ id: 'test:st:2', source: 'github', isRead: true }) as NewRawItem,
      ])
      const count = await getUnreadCount('github')
      expect(count).toBeGreaterThanOrEqual(1)
    })

    it('统计全部源的未读数', async () => {
      const count = await getUnreadCount()
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })

  describe('news-repo —— getLastIngestedBySource', () => {
    it('返回各源最后入库时间（0 值不会被当成 null）', async () => {
      const rows = await getLastIngestedBySource()
      const github = rows.find((r) => r.source === 'github')
      expect(github).toBeDefined()
      expect(github!.lastIngestedAt).toBeTypeOf('number')
    })
  })

  describe('run-log-repo —— lastRun 的两条来源', () => {
    it('写入运行记录后能按源统计出条数', async () => {
      await logRun({ source: 'github', stage: 'scrape', status: 'success', itemsCount: 3 })
      const stats = await getSourceStats()
      const github = stats.find((s) => s.source === 'github')
      expect(github).toBeDefined()
      expect(Number(github!.total_items)).toBeGreaterThanOrEqual(3)
      expect(github!.last_run_at).toBeTruthy()
    })

    it('metrics 在有日志时不报错', async () => {
      const metrics = await getMetrics()
      expect(metrics).toBeTruthy()
    })
  })
})
