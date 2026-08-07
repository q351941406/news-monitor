import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import {
  storeTopicGroups,
  getTopicGroupMeta,
  getTopicGroupItems,
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
    // 3 条新闻：A 未读、B 未读、C 已读
    await storeRawItems([
      { ...insertTestItem({ id: `${SUFFIX}:a`, title: 'Topic A' }), source: SOURCE },
      { ...insertTestItem({ id: `${SUFFIX}:b`, title: 'Topic B' }), source: SOURCE },
      { ...insertTestItem({ id: `${SUFFIX}:c`, title: 'Topic C' }), source: SOURCE },
    ] as NewRawItem[])
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
  it('getTopicGroupItems：showAll=false 过滤已读，showAll=true 返回全部', async () => {
    const hidden = await getTopicGroupItems(group1Id, false)
    expect(hidden.map((i) => i.id)).toEqual([`${SUFFIX}:a`])
    const all = await getTopicGroupItems(group1Id, true)
    expect(all.map((i) => i.id)).toEqual([`${SUFFIX}:a`, `${SUFFIX}:c`])
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
