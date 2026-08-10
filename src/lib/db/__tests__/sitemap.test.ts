import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, dropTestSchema } from './db-test-helper'
import sitemap from '@/app/sitemap'

describe('sitemap', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('无主题时返回首页条目（绝对 URL）', async () => {
    const entries = await sitemap()
    expect(entries.length).toBeGreaterThanOrEqual(1)
    expect(entries[0].url).toMatch(/^https?:\/\//)
    expect(entries[0].url).toContain('/')
  })

  it('有主题时返回首页 + 主题条目（含编码 id）', async () => {
    // 直接插入主题
    const db = await import('./db-test-helper').then((m) => m.getTestDb())
    await db.execute(
      `INSERT INTO topic_groups (id, source, topic, summary, created_at) VALUES ('topic/with slash', 'github', 'AI', 's', NOW())`,
    )
    const entries = await sitemap()
    const topicEntry = entries.find((e) => e.url.includes('topic'))
    expect(topicEntry).toBeDefined()
    expect(topicEntry!.url).toContain(encodeURIComponent('topic/with slash'))
    expect(topicEntry!.priority).toBe(0.7)
  })
})
