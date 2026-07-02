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
  summary: text('summary').notNull(),    // AI 摘要
  processedAt: timestamp('processed_at').defaultNow(),
})

// 类型导出
export type RawItem = typeof rawItems.$inferSelect
export type NewRawItem = typeof rawItems.$inferInsert
export type AIAnalysis = typeof aiAnalysis.$inferSelect
export type NewAIAnalysis = typeof aiAnalysis.$inferInsert
