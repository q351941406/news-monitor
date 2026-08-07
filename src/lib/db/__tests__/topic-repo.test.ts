import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import { storeTopicGroups, getTopicGroups } from '../topic-repo'
import { markAsRead } from '../read-repo'
import type { NewRawItem } from '../../schema'

const SUFFIX = `tp:${Date.now()}`
const SOURCE = 'github'

describe('TopicRepo — showAll 已读过滤', () => {
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
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('showAll=false 时过滤已读，且全已读的组被剔除', async () => {
    const groups = await getTopicGroups(SOURCE, false)
    expect(groups).toHaveLength(1)
    expect(groups[0].topic).toBe('组1')
    const ids = groups[0].items.map((i) => i.id)
    expect(ids).toContain(`${SUFFIX}:a`)
    expect(ids).not.toContain(`${SUFFIX}:c`)
  })

  it('showAll=true 时返回全部，包括已读', async () => {
    const groups = await getTopicGroups(SOURCE, true)
    expect(groups).toHaveLength(2)
    const mixed = groups.find((g) => g.topic === '组1')!
    expect(mixed.items.map((i) => i.id)).toEqual([`${SUFFIX}:a`, `${SUFFIX}:c`])
    const allRead = groups.find((g) => g.topic === '组2')!
    expect(allRead.items.map((i) => i.id)).toEqual([`${SUFFIX}:c`])
  })

  it('默认参数（不传 showAll）等价于 showAll=false', async () => {
    const groups = await getTopicGroups(SOURCE)
    expect(groups).toHaveLength(1)
    expect(groups[0].topic).toBe('组1')
  })
})
