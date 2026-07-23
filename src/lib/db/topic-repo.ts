/**
 * 主题聚合仓库 — AI 主题分组管理
 */
import { eq, desc } from 'drizzle-orm'
import { neon } from '@neondatabase/serverless'
import { rawItems, aiAnalysis, topicGroups, topicItems } from '../schema'
import { getDb, type NewsItem } from './connection'

/** 初始化数据库表 */
export async function initDatabase() {
  const sql = neon(process.env.DATABASE_URL!)
  await sql`
    CREATE TABLE IF NOT EXISTS raw_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      raw_data JSONB NOT NULL,
      is_read BOOLEAN DEFAULT FALSE NOT NULL,
      fetched_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_raw_items_source ON raw_items(source)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_raw_items_fetched_at ON raw_items(fetched_at DESC)
  `
  await sql`
    CREATE TABLE IF NOT EXISTS ai_analysis (
      item_id TEXT PRIMARY KEY REFERENCES raw_items(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

/** 存储主题聚合 */
export async function storeTopicGroups(
  source: string,
  groups: Array<{ topic: string; summary: string; itemIds: string[] }>,
): Promise<void> {
  const db = getDb()
  // 删除该数据源的旧主题
  const oldTopics = await db
    .select({ id: topicGroups.id })
    .from(topicGroups)
    .where(eq(topicGroups.source, source))
  for (const old of oldTopics) {
    await db.delete(topicItems).where(eq(topicItems.topicId, old.id))
    await db.delete(topicGroups).where(eq(topicGroups.id, old.id))
  }
  // 插入新主题
  for (const group of groups) {
    const topicId = `${source}:topic:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    await db.insert(topicGroups).values({
      id: topicId,
      source,
      topic: group.topic,
      summary: group.summary,
    })
    for (const itemId of group.itemIds) {
      const exists = await db
        .select({ id: rawItems.id })
        .from(rawItems)
        .where(eq(rawItems.id, itemId))
        .limit(1)
      if (exists.length > 0) {
        await db.insert(topicItems).values({ topicId, itemId })
      } else {
        console.log(`  ⚠️ Skipping invalid itemId: ${itemId}`)
      }
    }
  }
}

/** 获取主题聚合 */
export async function getTopicGroups(
  source: string,
): Promise<Array<{ id: string; topic: string; summary: string; items: NewsItem[] }>> {
  const db = getDb()
  const groups = await db
    .select()
    .from(topicGroups)
    .where(eq(topicGroups.source, source))
    .orderBy(desc(topicGroups.createdAt))
  const result = []
  for (const group of groups) {
    const items = await db
      .select({
        id: rawItems.id,
        source: rawItems.source,
        title: rawItems.title,
        url: rawItems.url,
        rawData: rawItems.rawData,
        summary: aiAnalysis.summary,
        details: aiAnalysis.details,
        fetchedAt: rawItems.fetchedAt,
        isRead: rawItems.isRead,
      })
      .from(topicItems)
      .innerJoin(rawItems, eq(topicItems.itemId, rawItems.id))
      .leftJoin(aiAnalysis, eq(rawItems.id, aiAnalysis.itemId))
      .where(eq(topicItems.topicId, group.id))
    result.push({
      id: group.id,
      topic: group.topic,
      summary: group.summary,
      items: items as NewsItem[],
    })
  }
  return result
}
