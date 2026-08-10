import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getTestDb, createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import { rawItems } from '../../schema'
import { eq } from 'drizzle-orm'
import type { NewRawItem } from '../../schema'
import { GET, POST } from '@/app/api/news/route'

function authedPost(body: unknown, token = 'test-admin') {
  return new NextRequest('http://localhost/api/news', {
    method: 'POST',
    headers: { 'x-admin-token': token },
    body: JSON.stringify(body),
  })
}

describe('POST /api/news (写操作)', () => {
  beforeAll(async () => {
    await createTestTables()
    vi.stubEnv('ADMIN_TOKEN', 'test-admin')
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await dropTestSchema()
  })

  it('read: 标记单条已读', async () => {
    await storeRawItems([insertTestItem({ id: 'test:post:read' }) as NewRawItem])
    const res = await POST(authedPost({ action: 'read', itemId: 'test:post:read' }))
    expect(res.status).toBe(200)
    const db = getTestDb()
    const rows = await db.select().from(rawItems).where(eq(rawItems.id, 'test:post:read'))
    expect(rows[0].isRead).toBe(true)
  })

  it('unread: 标记单条未读', async () => {
    await storeRawItems([insertTestItem({ id: 'test:post:unread', isRead: true }) as NewRawItem])
    const res = await POST(authedPost({ action: 'unread', itemId: 'test:post:unread' }))
    expect(res.status).toBe(200)
    const db = getTestDb()
    const rows = await db.select().from(rawItems).where(eq(rawItems.id, 'test:post:unread'))
    expect(rows[0].isRead).toBe(false)
  })

  it('readAll: 标记某源全部已读', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:post:all1', source: 'github' }) as NewRawItem,
      insertTestItem({ id: 'test:post:all2', source: 'github' }) as NewRawItem,
    ])
    const res = await POST(authedPost({ action: 'readAll', source: 'github' }))
    expect(res.status).toBe(200)
    const db = getTestDb()
    const result = await db.execute(
      `SELECT count(*) AS c FROM raw_items WHERE source='github' AND is_read = false`,
    )
    expect(Number(result.rows[0].c)).toBe(0)
  })

  it('resetAll: 重置某源已读状态', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:post:reset', source: 'github', isRead: true }) as NewRawItem,
    ])
    const res = await POST(authedPost({ action: 'resetAll', source: 'github' }))
    expect(res.status).toBe(200)
    const db = getTestDb()
    const result = await db.execute(
      `SELECT count(*) AS c FROM raw_items WHERE source='github' AND is_read = true`,
    )
    expect(Number(result.rows[0].c)).toBe(0)
  })

  it('readGroup: 标记主题组已读', async () => {
    await storeRawItems([insertTestItem({ id: 'test:post:grp', source: 'github' }) as NewRawItem])
    const db = getTestDb()
    await db.execute(
      `INSERT INTO topic_groups (id, source, topic, summary) VALUES ('grp-1', 'github', 'AI', 's')`,
    )
    await db.execute(
      `INSERT INTO topic_items (topic_id, item_id) VALUES ('grp-1', 'test:post:grp')`,
    )
    const res = await POST(authedPost({ action: 'readGroup', topicId: 'grp-1' }))
    expect(res.status).toBe(200)
    const result = await db.execute(
      `SELECT count(*) AS c FROM raw_items WHERE id='test:post:grp' AND is_read = true`,
    )
    expect(Number(result.rows[0].c)).toBe(1)
  })

  it('无效 action 返回 400', async () => {
    const res = await POST(authedPost({ action: 'deleteEverything' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid')
  })

  it('GET 无 source 时返回 data 数组（limit 生效）', async () => {
    const req = new NextRequest('http://localhost/api/news?limit=1')
    const res = await GET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data.github.length).toBeLessThanOrEqual(1)
    expect(json.counts).toBeDefined()
  })
})
