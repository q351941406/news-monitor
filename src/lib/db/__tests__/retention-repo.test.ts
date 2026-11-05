import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import {
  purgeReadItemsBefore,
  countReadItemsBefore,
  deleteEmptyTopicGroups,
} from '../retention-repo'
import { getPgPool } from '../connection'
import { computeCutoff } from '../../retention'
import type { NewRawItem } from '../../schema'

const DAY = 24 * 60 * 60 * 1000

describe('保留期清理', () => {
  beforeAll(async () => {
    await createTestTables()
  })

  afterAll(async () => {
    await dropTestSchema()
  })

  it('只删除「已读且超过保留期」的条目，未读与近期已读保留', async () => {
    const now = Date.now()
    await storeRawItems([
      insertTestItem({
        id: 'test:purge:old-read',
        isRead: true,
        readAt: now - 31 * DAY,
        fetchedAt: now - 40 * DAY,
      }) as NewRawItem,
      insertTestItem({
        id: 'test:purge:recent-read',
        isRead: true,
        readAt: now - 1 * DAY,
        fetchedAt: now - 40 * DAY,
      }) as NewRawItem,
      insertTestItem({
        id: 'test:purge:unread-old',
        isRead: false,
        readAt: null,
        fetchedAt: now - 100 * DAY,
      }) as NewRawItem,
      // 迁移前的存量已读行：read_at 为空，用 fetched_at 兜底
      insertTestItem({
        id: 'test:purge:legacy',
        isRead: true,
        readAt: null,
        fetchedAt: now - 60 * DAY,
      }) as NewRawItem,
    ])

    const cutoff = computeCutoff(now, 30)
    expect(await countReadItemsBefore(cutoff)).toBe(2)

    const result = await purgeReadItemsBefore(cutoff, { batchSize: 1, maxBatches: 10 })
    expect(result.deleted).toBe(2)
    expect(result.reachedLimit).toBe(false)

    const { rows } = await getPgPool().query('SELECT id FROM raw_items ORDER BY id')
    expect(rows.map((r) => r.id)).toEqual(['test:purge:recent-read', 'test:purge:unread-old'])
  })

  it('级联删除 ai_analysis / topic_items，并清理空主题组', async () => {
    const now = Date.now()
    await storeRawItems([
      insertTestItem({
        id: 'test:purge:cascade',
        isRead: true,
        readAt: now - 45 * DAY,
        fetchedAt: now - 45 * DAY,
      }) as NewRawItem,
    ])
    const pool = getPgPool()
    await pool.query(
      `INSERT INTO ai_analysis (item_id, summary) VALUES ('test:purge:cascade', '摘要')`,
    )
    await pool.query(
      `INSERT INTO topic_groups (id, source, topic, summary)
       VALUES ('test:topic:cascade', 'github', '级联测试', '概括')`,
    )
    await pool.query(
      `INSERT INTO topic_items (topic_id, item_id)
       VALUES ('test:topic:cascade', 'test:purge:cascade')`,
    )

    await purgeReadItemsBefore(computeCutoff(now, 30))

    const analysis = await getPgPool().query(
      `SELECT COUNT(*)::int AS c FROM ai_analysis WHERE item_id = 'test:purge:cascade'`,
    )
    const links = await getPgPool().query(
      `SELECT COUNT(*)::int AS c FROM topic_items WHERE item_id = 'test:purge:cascade'`,
    )
    expect(analysis.rows[0].c).toBe(0)
    expect(links.rows[0].c).toBe(0)

    expect(await deleteEmptyTopicGroups()).toBe(1)
    const topics = await getPgPool().query(`SELECT COUNT(*)::int AS c FROM topic_groups`)
    expect(topics.rows[0].c).toBe(0)
  })

  it('达到批次数上限时返回 reachedLimit，剩余留待下次', async () => {
    const now = Date.now()
    const items = [1, 2, 3].map((n) =>
      insertTestItem({
        id: `test:purge:limit:${n}`,
        isRead: true,
        readAt: now - 31 * DAY,
        fetchedAt: now - 31 * DAY,
      }),
    )
    await storeRawItems(items as NewRawItem[])

    const result = await purgeReadItemsBefore(computeCutoff(now, 30), {
      batchSize: 2,
      maxBatches: 1,
    })
    expect(result.deleted).toBe(2)
    expect(result.reachedLimit).toBe(true)
  })
})
