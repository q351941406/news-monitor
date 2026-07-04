import { pgTable, text, bigint, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core'

// 原始内容表
export const rawItems = pgTable('raw_items', {
  id: text('id').primaryKey(),           // 来源:原始ID，如 "github:owner/repo"
  source: text('source').notNull(),      // 数据源标识
  title: text('title'),                  // 标题
  url: text('url').notNull(),            // 原文链接
  rawData: jsonb('raw_data').notNull(),  // 原始数据
  isRead: boolean('is_read').default(false).notNull(),  // 已读状态
  fetchedAt: bigint('fetched_at', { mode: 'number' }).notNull(),  // 抓取时间戳
  createdAt: timestamp('created_at').defaultNow(),
})

// AI 分析结果表
export const aiAnalysis = pgTable('ai_analysis', {
  itemId: text('item_id').primaryKey().references(() => rawItems.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),    // 一句话摘要
  details: text('details'),              // 详细内容
  processedAt: timestamp('processed_at').defaultNow(),
})

// 主题聚合表
export const topicGroups = pgTable('topic_groups', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),      // 数据源
  topic: text('topic').notNull(),        // 主题名称
  summary: text('summary').notNull(),    // 主题概括
  createdAt: timestamp('created_at').defaultNow(),
})

// 主题-新闻关联表
export const topicItems = pgTable('topic_items', {
  topicId: text('topic_id').references(() => topicGroups.id, { onDelete: 'cascade' }),
  itemId: text('item_id').references(() => rawItems.id, { onDelete: 'cascade' }),
})

// 类型导出
export type RawItem = typeof rawItems.$inferSelect
export type NewRawItem = typeof rawItems.$inferInsert
export type AIAnalysis = typeof aiAnalysis.$inferSelect
export type NewAIAnalysis = typeof aiAnalysis.$inferInsert
