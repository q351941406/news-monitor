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

  describe('内容指纹去重（Product Hunt 同一产品 relaunch）', () => {
    // PH 允许同一产品多次 launch，每次生成新的 post id，主键去重挡不住。
    // 生产实测：ThreadLine 以两个 post id 入库，随后被聚合进同一主题组，
    // 首页展开该组即可看到两条同名同标语内容。
    const ph = (over: Record<string, unknown>) =>
      insertTestItem({ source: 'producthunt', ...over }) as NewRawItem
    const tagline = { tagline: 'Email outreach and support, unified.' }

    it('标题与标语相同的 relaunch 被拦下，不产生第二条', async () => {
      expect(
        await storeRawItems([ph({ id: 'ph:relaunch:1', title: 'ThreadLine', rawData: tagline })]),
      ).toBe(1)
      // 新 post id + 同标题 + 同标语 → 内容指纹命中，丢弃
      expect(
        await storeRawItems([ph({ id: 'ph:relaunch:2', title: 'ThreadLine', rawData: tagline })]),
      ).toBe(0)
      expect(await existsItem('ph:relaunch:2')).toBe(false)
    })

    it('标题大小写差异视为同一内容', async () => {
      expect(
        await storeRawItems([
          ph({ id: 'ph:case:1', title: 'Gift Card', rawData: { tagline: 'Free stuff' } }),
        ]),
      ).toBe(1)
      expect(
        await storeRawItems([
          ph({ id: 'ph:case:2', title: 'gift card', rawData: { tagline: 'free STUFF' } }),
        ]),
      ).toBe(0)
    })

    it('标语不同则不误杀（同一产品页下的不同产品）', async () => {
      // 生产实例：producthunt.com/products/openai 下并存 GPT-5.6 / Codex Micro /
      // Health in ChatGPT 三个独立产品，共享同一 url。若按 url 去重会误删真实内容，
      // 因此指纹必须落在「标题 + 标语」而非 url 上。
      const rows = [
        ph({
          id: 'ph:openai:1',
          title: 'GPT-5.6',
          rawData: { tagline: 'A new standard for intelligence' },
        }),
        ph({
          id: 'ph:openai:2',
          title: 'Codex Micro',
          rawData: { tagline: 'Tactile controls for agents' },
        }),
        ph({
          id: 'ph:openai:3',
          title: 'Health in ChatGPT',
          rawData: { tagline: 'Your health companion' },
        }),
      ]
      expect(await storeRawItems(rows)).toBe(3)
    })

    it('标题或标语缺失时不参与指纹判定，避免误判为重复', async () => {
      expect(
        await storeRawItems([ph({ id: 'ph:empty:1', title: '', rawData: { tagline: 'x' } })]),
      ).toBe(1)
      expect(
        await storeRawItems([ph({ id: 'ph:empty:2', title: '', rawData: { tagline: 'x' } })]),
      ).toBe(1)
      expect(
        await storeRawItems([ph({ id: 'ph:empty:3', title: 'No Tagline', rawData: {} })]),
      ).toBe(1)
      expect(
        await storeRawItems([ph({ id: 'ph:empty:4', title: 'No Tagline', rawData: {} })]),
      ).toBe(1)
    })

    it('指纹只作用于 producthunt：twitter 同作者多条、github 同名不互斥', async () => {
      // twitter 的 title 是作者名，若指纹作用于全表会把同一作者的不同推文全误杀
      const tweets = [
        insertTestItem({
          id: 'test:tw:1',
          source: 'twitter',
          title: '@somebody',
          rawData: {},
        }) as NewRawItem,
        insertTestItem({
          id: 'test:tw:2',
          source: 'twitter',
          title: '@somebody',
          rawData: {},
        }) as NewRawItem,
      ]
      expect(await storeRawItems(tweets)).toBe(2)
      const repos = [
        insertTestItem({
          id: 'github:same/name:1',
          source: 'github',
          title: 'same/name',
          rawData: {},
        }) as NewRawItem,
        insertTestItem({
          id: 'github:same/name:2',
          source: 'github',
          title: 'same/name',
          rawData: {},
        }) as NewRawItem,
      ]
      expect(await storeRawItems(repos)).toBe(2)
    })

    it('同批次内两条同指纹只入库一条且不报错', async () => {
      expect(
        await storeRawItems([
          ph({ id: 'ph:batch:1', title: 'BatchDup', rawData: { tagline: 'same' } }),
          ph({ id: 'ph:batch:2', title: 'BatchDup', rawData: { tagline: 'same' } }),
        ]),
      ).toBe(1)
    })
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
