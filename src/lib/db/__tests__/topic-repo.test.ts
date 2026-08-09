import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import { storeAIAnalysis } from '../ai-repo'
import { getPgPool } from '../connection'
import {
  storeTopicGroups,
  getTopicGroupMeta,
  getTopicGroupItems,
  getItemDetail,
  markGroupAsRead,
  getExistingTopics,
  deleteEmptyTopics,
  getAggregationBatch,
  markItemsAggregated,
} from '../topic-repo'
import { markAsRead } from '../read-repo'
import type { NewRawItem } from '../../schema'
const SUFFIX = `tp:${Date.now()}`
const SOURCE = 'github'
describe('TopicRepo — 懒加载查询', () => {
  let group1Id = ''
  beforeAll(async () => {
    await createTestTables()
    // 3 条新闻：A 未读、B 未读、C 已读（带 rawData 原文）
    await storeRawItems([
      {
        ...insertTestItem({ id: `${SUFFIX}:a`, title: 'Topic A' }),
        source: SOURCE,
        rawData: { readme: '# A\n\nreadme-full-a' },
      },
      {
        ...insertTestItem({ id: `${SUFFIX}:b`, title: 'Topic B' }),
        source: SOURCE,
        rawData: { text: 'twitter-b' },
      },
      {
        ...insertTestItem({ id: `${SUFFIX}:c`, title: 'Topic C' }),
        source: SOURCE,
        rawData: { readme: '# C\n\nreadme-full-c' },
      },
    ] as unknown as NewRawItem[])
    await markAsRead(`${SUFFIX}:c`)
    // 组1 含 A(未读)+C(已读)；组2 只含 C(已读)
    await storeTopicGroups(SOURCE, [
      { topic: '组1', summary: '混合组', itemIds: [`${SUFFIX}:a`, `${SUFFIX}:c`] },
      { topic: '组2', summary: '全已读组', itemIds: [`${SUFFIX}:c`] },
    ])
    const metas = await getTopicGroupMeta(SOURCE, true)
    group1Id = metas.find((g) => g.topic === '组1')!.id
  })
  afterAll(async () => {
    await dropTestSchema()
  })
  it('getTopicGroupMeta：showAll=false 时剔除全已读组，未读计数正确', async () => {
    const metas = await getTopicGroupMeta(SOURCE, false)
    expect(metas).toHaveLength(1)
    expect(metas[0].topic).toBe('组1')
    expect(metas[0].unreadCount).toBe(1)
    expect(metas[0].totalCount).toBe(2)
  })
  it('getTopicGroupMeta：showAll=true 时返回全部组', async () => {
    const metas = await getTopicGroupMeta(SOURCE, true)
    expect(metas).toHaveLength(2)
    const g2 = metas.find((g) => g.topic === '组2')!
    expect(g2.unreadCount).toBe(0)
    expect(g2.totalCount).toBe(1)
  })
  it('getTopicGroupMeta：默认参数等价于 showAll=false', async () => {
    const metas = await getTopicGroupMeta(SOURCE)
    expect(metas).toHaveLength(1)
  })
  it('getTopicGroupItems：列表轻量（不含 rawData/details），过滤已读正确', async () => {
    const hidden = await getTopicGroupItems(group1Id, false)
    expect(hidden.map((i) => i.id).sort()).toEqual([`${SUFFIX}:a`])
    // L3 懒加载：列表项不携带原文/AI 详情
    expect(hidden[0]).not.toHaveProperty('rawData')
    expect(hidden[0]).not.toHaveProperty('details')
    const all = await getTopicGroupItems(group1Id, true)
    expect(all.map((i) => i.id).sort()).toEqual([`${SUFFIX}:a`, `${SUFFIX}:c`].sort())
  })
  it('getItemDetail：点击展开时才拉完整详情（含 rawData 原文 + details）', async () => {
    const detail = await getItemDetail(`${SUFFIX}:a`)
    expect(detail).not.toBeNull()
    expect(detail!.rawData.readme).toBe('# A\n\nreadme-full-a')
    // 不存在的 item 返回 null
    const missing = await getItemDetail(`${SUFFIX}:nope`)
    expect(missing).toBeNull()
  })
  it('markGroupAsRead：组内全部标记已读，未读计数归零', async () => {
    await markGroupAsRead(group1Id)
    const metas = await getTopicGroupMeta(SOURCE, false)
    // 组1 未读清零后成为全已读组，showAll=false 下被剔除
    expect(metas).toHaveLength(0)
    const all = await getTopicGroupItems(group1Id, false)
    expect(all).toHaveLength(0)
  })
})

describe('TopicRepo — 队列增量聚合', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })
  it('storeTopicGroups：同名主题复用（增量 upsert，不重建），item 幂等', async () => {
    const suffix = `q1:${Date.now()}`
    await storeRawItems([
      { ...insertTestItem({ id: `${suffix}:a`, title: 'Queue A' }), source: SOURCE },
      { ...insertTestItem({ id: `${suffix}:b`, title: 'Queue B' }), source: SOURCE },
      { ...insertTestItem({ id: `${suffix}:c`, title: 'Queue C' }), source: SOURCE },
    ] as unknown as NewRawItem[])
    // 第一轮：建「AI 工具」主题
    await storeTopicGroups(SOURCE, [
      { topic: 'AI 工具', summary: '第一轮', itemIds: [`${suffix}:a`] },
    ])
    const first = await getTopicGroupMeta(SOURCE, true)
    const aiGroup = first.find((g) => g.topic === 'AI 工具')!
    expect(aiGroup.totalCount).toBe(1)
    // 第二轮：同一主题追加成员（不应新建同名组）
    await storeTopicGroups(SOURCE, [
      { topic: 'AI 工具', summary: '第二轮', itemIds: [`${suffix}:b`, `${suffix}:c`] },
    ])
    const second = await getTopicGroupMeta(SOURCE, true)
    const aiGroups = second.filter((g) => g.topic === 'AI 工具')
    expect(aiGroups).toHaveLength(1) // 同名只保留一个组
    expect(aiGroups[0].totalCount).toBe(3) // a+b+c 全部归入
    // 同名复用时应同步更新 summary（否则概括停留在第一轮）
    const after = await getTopicGroupMeta(SOURCE, true)
    const updated = after.find((g) => g.topic === 'AI 工具')!
    expect(updated.summary).toBe('第二轮')
  })
  it('getExistingTopics：返回该 source 的主题名 + 概括 + 成员数', async () => {
    const topics = await getExistingTopics(SOURCE)
    expect(topics.some((t) => t.topic === 'AI 工具')).toBe(true)
    // 字段形状：topic + summary + itemCount
    for (const t of topics) {
      expect(typeof t.topic).toBe('string')
      expect(typeof t.summary).toBe('string')
      expect(typeof t.itemCount).toBe('number')
      expect(t.itemCount).toBeGreaterThanOrEqual(0)
    }
    // 前序测试中「AI 工具」已归入 3 条成员，成员数应反映真实规模
    const aiGroup = topics.find((t) => t.topic === 'AI 工具')
    expect(aiGroup!.itemCount).toBe(3)
  })
  it('deleteEmptyTopics：删除无 items 的空主题', async () => {
    const suffix = `q2:${Date.now()}`
    await storeRawItems([
      { ...insertTestItem({ id: `${suffix}:a`, title: 'Empty A' }), source: SOURCE },
    ] as unknown as NewRawItem[])
    // 建一个主题（成员 a）；随后 a 被数据清理删除 → 级联删除关联 → 主题变空
    await storeTopicGroups(SOURCE, [{ topic: '临时主题', summary: 'x', itemIds: [`${suffix}:a`] }])
    // 模拟 cleanupOldData 删除 raw_items（ON DELETE CASCADE 级联清掉 topic_items）
    const pool = getPgPool()
    await pool.query('DELETE FROM raw_items WHERE id = $1', [`${suffix}:a`])
    const deleted = await deleteEmptyTopics(SOURCE)
    expect(deleted).toBeGreaterThanOrEqual(1)
    const after = await getTopicGroupMeta(SOURCE, true)
    expect(after.some((g) => g.topic === '临时主题')).toBe(false)
  })
  it('markItemsAggregated：队列消费后标记聚合，getAggregationBatch 不再返回', async () => {
    const suffix = `q3:${Date.now()}`
    await storeRawItems([
      { ...insertTestItem({ id: `${suffix}:a`, title: 'Agg A' }), source: SOURCE },
      { ...insertTestItem({ id: `${suffix}:b`, title: 'Agg B' }), source: SOURCE },
    ] as unknown as NewRawItem[])
    await storeAIAnalysis(`${suffix}:a`, '摘要 A')
    await storeAIAnalysis(`${suffix}:b`, '摘要 B')
    // 标记前：都在待聚合批次里
    const before = await getAggregationBatch(SOURCE, 100)
    const ids = before.map((i) => i.id)
    expect(ids).toContain(`${suffix}:a`)
    // 标记后：不再出现
    await markItemsAggregated([`${suffix}:a`, `${suffix}:b`])
    const after = await getAggregationBatch(SOURCE, 100)
    expect(after.map((i) => i.id)).not.toContain(`${suffix}:a`)
    expect(after.map((i) => i.id)).not.toContain(`${suffix}:b`)
  })
  it('getAggregationBatch：新数据优先，source 隔离', async () => {
    const suffix = `q4:${Date.now()}`
    // github 源：新数据
    await storeRawItems([
      { ...insertTestItem({ id: `${suffix}:gh`, title: 'GH New' }), source: 'github' },
    ] as unknown as NewRawItem[])
    await storeAIAnalysis(`${suffix}:gh`, 'GH 摘要')
    // producthunt 源：不同 source 的数据不应被取到
    await storeRawItems([
      { ...insertTestItem({ id: `${suffix}:ph`, title: 'PH Item' }), source: 'producthunt' },
    ] as unknown as NewRawItem[])
    await storeAIAnalysis(`${suffix}:ph`, 'PH 摘要')
    const ghBatch = await getAggregationBatch('github', 100)
    expect(ghBatch.map((i) => i.id)).toContain(`${suffix}:gh`)
    expect(ghBatch.map((i) => i.id)).not.toContain(`${suffix}:ph`)
  })
})
