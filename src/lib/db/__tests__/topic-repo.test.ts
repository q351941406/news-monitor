import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import {
  storeTopicGroups,
  getTopicGroupMeta,
  getTopicGroupItems,
  getItemDetail,
  markGroupAsRead,
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
    expect(hidden.map((i) => i.id)).toEqual([`${SUFFIX}:a`])
    // L3 懒加载：列表项不携带原文/AI 详情
    expect(hidden[0]).not.toHaveProperty('rawData')
    expect(hidden[0]).not.toHaveProperty('details')
    const all = await getTopicGroupItems(group1Id, true)
    expect(all.map((i) => i.id)).toEqual([`${SUFFIX}:a`, `${SUFFIX}:c`])
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
