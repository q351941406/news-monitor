/**
 * 未归组条目的仓库层测试
 *
 * 核心价值：把 2026-10 线上事故的三个判据钉死 ——
 * 1. 落组必须**可观测**：storeTopicGroups 要报告哪些条目真的挂上了组
 *    （此前整批都被"假消费"，未落组的条目永久隐身）
 * 2. id 匹配必须容忍大小写与标题回退
 *    （GitHub id 已按 ADR-0006 归一化为小写，AI 常照抄标题原始大小写）
 * 3. 「有数字、没内容」必须能被查出来、能被重入队修复
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems, getNewsCounts } from '../news-repo'
import { storeAIAnalysis } from '../ai-repo'
import {
  storeTopicGroups,
  getUngroupedItems,
  getUngroupedSummaryBySource,
  getTopicGroupCountsBySource,
  requeueUngroupedItems,
  buildIdCandidates,
} from '../topic-repo'
import type { NewRawItem } from '../../schema'

const S = `ug:${Date.now()}`

describe('未归组条目（徽标有数字、列表没内容）', () => {
  beforeAll(async () => {
    await createTestTables()
    // 三条 github 条目：
    //   lower  → id 已归一化为小写（github:owner/repo）
    //   mixed  → AI 照抄标题大小写（github:Owner/MixedRepo）
    //   plain  → 完全无前缀无大小写（owner/plain）
    await storeRawItems([
      insertTestItem({
        id: `${S}:lower`,
        source: 'github',
        title: 'owner/repo',
        isRead: false,
      }) as NewRawItem,
      insertTestItem({
        id: `${S}:mixed`,
        source: 'github',
        title: 'Owner/MixedRepo',
        isRead: false,
      }) as NewRawItem,
      insertTestItem({
        id: `${S}:plain`,
        source: 'github',
        title: 'owner/plain',
        isRead: false,
      }) as NewRawItem,
      insertTestItem({
        id: `${S}:read`,
        source: 'github',
        title: 'owner/read',
        isRead: true,
      }) as NewRawItem,
      // 孤儿：未读、且**永远不落组**（模拟线上被"假消费"后悬空的条目）
      insertTestItem({
        id: `${S}:orphan`,
        source: 'github',
        title: 'owner/orphan',
        isRead: false,
      }) as NewRawItem,
    ])
    await storeAIAnalysis(`${S}:lower`, '摘要 lower')
    await storeAIAnalysis(`${S}:mixed`, '摘要 mixed')
    await storeAIAnalysis(`${S}:plain`, '摘要 plain')
    await storeAIAnalysis(`${S}:read`, '摘要 read')
    await storeAIAnalysis(`${S}:orphan`, '摘要 orphan')
  })

  afterAll(async () => {
    await dropTestSchema()
  })

  describe('buildIdCandidates — 大小写与前缀容错', () => {
    it('无前缀时补上 source 前缀', () => {
      expect(buildIdCandidates('github', 'owner/repo')).toContain('github:owner/repo')
    })

    it('同时给出全小写变体（GitHub id 已归一化为小写）', () => {
      expect(buildIdCandidates('github', 'github:Owner/Repo')).toContain('github:owner/repo')
    })

    it('已带前缀的不重复补前缀', () => {
      const candidates = buildIdCandidates('github', 'github:Owner/Repo')
      expect(candidates.filter((c) => c === 'github:Owner/Repo')).toHaveLength(1)
    })
  })

  describe('storeTopicGroups — 落组结果可观测', () => {
    it('报告真正落组的 id，库里不存在的 id 进 skipped', async () => {
      const result = await storeTopicGroups('github', [
        {
          topic: `${S}:主题`,
          summary: '概括',
          itemIds: [`${S}:lower`, `${S}:nonexistent`],
        },
      ])
      expect(result.linked).toContain(`${S}:lower`)
      expect(result.skipped).toContain(`${S}:nonexistent`)
      expect(result.linked).not.toContain(`${S}:nonexistent`)
    })

    it('AI 照抄标题大小写也能落组（回归防线）', async () => {
      const result = await storeTopicGroups('github', [
        { topic: `${S}:大小写`, summary: '概括', itemIds: [`${S}:mixed`] },
      ])
      expect(result.linked).toContain(`${S}:mixed`)
      expect(result.skipped).toHaveLength(0)
    })

    it('AI 只给标题（无前缀、带大小写）也能靠标题回退落组', async () => {
      const result = await storeTopicGroups('github', [
        { topic: `${S}:标题回退`, summary: '概括', itemIds: [`${S}:plain`] },
      ])
      expect(result.linked).toContain(`${S}:plain`)
    })
  })

  describe('getUngroupedItems — 找出「徽标在数、列表没有」的条目', () => {
    it('只返回未读且没归组的条目', async () => {
      const items = await getUngroupedItems('github', 100)
      const ids = items.map((i) => i.id)
      // 悬空的孤儿必须能被查出来（否则它在页面上彻底不存在）
      expect(ids).toContain(`${S}:orphan`)
      // 已落组的 lower / mixed / plain 不该出现
      expect(ids).not.toContain(`${S}:lower`)
      expect(ids).not.toContain(`${S}:mixed`)
      expect(ids).not.toContain(`${S}:plain`)
      // 已读的也不该出现（已读 = 读完了，不是待处理内容）
      expect(ids).not.toContain(`${S}:read`)
    })

    it('source=all 时跨源返回', async () => {
      await storeRawItems([
        insertTestItem({ id: `${S}:tw`, source: 'twitter', title: 'tw item' }) as NewRawItem,
      ])
      const items = await getUngroupedItems('all', 200)
      expect(items.map((i) => i.id)).toContain(`${S}:tw`)
    })

    it('标记缺摘要（pendingSummary）', async () => {
      await storeRawItems([
        insertTestItem({ id: `${S}:nosum`, source: 'producthunt', title: '未摘要' }) as NewRawItem,
      ])
      const items = await getUngroupedItems('producthunt', 50)
      const target = items.find((i) => i.id === `${S}:nosum`)
      expect(target).toBeDefined()
      expect(target!.pendingSummary).toBe(true)
    })
  })

  describe('getNewsCounts — 徽标口径拆成「可见 / 不可见」', () => {
    it('groupedUnread + ungroupedUnread === unread（口径必须自洽）', async () => {
      const counts = await getNewsCounts()
      for (const source of ['github', 'producthunt', 'twitter']) {
        const c = counts[source]
        expect(c.groupedUnread + c.ungroupedUnread).toBe(c.unread)
      }
    })

    it('未归组的未读条目计入 ungroupedUnread', async () => {
      const counts = await getNewsCounts()
      expect(counts.github.ungroupedUnread).toBeGreaterThan(0)
    })
  })

  describe('getUngroupedSummaryBySource — 巡检用的概况', () => {
    it('给出各源未归组条数与最早一条的时间', async () => {
      const summaries = await getUngroupedSummaryBySource()
      const github = summaries.find((s) => s.source === 'github')
      expect(github).toBeDefined()
      expect(github!.count).toBeGreaterThanOrEqual(1)
      expect(github!.oldestFetchedAt).toBeTypeOf('number')
    })
  })

  describe('getTopicGroupCountsBySource — 某源一个组都没有 = 列表空白', () => {
    it('返回各源主题组数量', async () => {
      const counts = await getTopicGroupCountsBySource()
      expect(counts.github).toBeGreaterThan(0)
      expect(counts.twitter).toBe(0)
    })
  })

  describe('requeueUngroupedItems — 存量孤儿重入队', () => {
    it('默认只重入队未读条目', async () => {
      const result = await requeueUngroupedItems({ source: 'github' })
      expect(result.requeued).toBeGreaterThan(0)
      // 已读条目不应被重入队
      expect(result.ids).not.toContain(`${S}:read`)
    })

    it('重入队后条目重新出现在聚合批次里', async () => {
      await requeueUngroupedItems({ source: 'github' })
      const { getAggregationBatch } = await import('../topic-repo')
      const batch = await getAggregationBatch('github', 100)
      expect(batch.map((i) => i.id)).toContain(`${S}:orphan`)
    })

    it('include-read=true 时连已读的也重入队', async () => {
      const result = await requeueUngroupedItems({ source: 'github', includeRead: true })
      expect(result.ids).toContain(`${S}:read`)
    })

    it('统计出缺摘要的条目数（它们要先等富化流程）', async () => {
      const result = await requeueUngroupedItems({ source: 'producthunt', includeRead: true })
      expect(result.withoutSummary).toBeGreaterThan(0)
    })
  })
})
