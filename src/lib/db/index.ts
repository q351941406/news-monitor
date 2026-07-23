/**
 * 数据库模块 — 统一导出
 *
 * 按职责拆分为 5 个仓库模块：
 * - connection: 共享连接 + NewsItem 类型
 * - news-repo: 原始数据 CRUD
 * - ai-repo: AI 分析存储
 * - read-repo: 阅读状态管理
 * - topic-repo: 主题聚合
 * - stats-repo: 统计 + 清理
 */
export { getDb, type NewsItem } from './connection'
export { storeRawItems, existsItem, getNews, getAllNews } from './news-repo'
export { storeAIAnalysis, getUnprocessedItems } from './ai-repo'
export { markAsRead, markAsUnread, markAllAsRead, resetAllRead } from './read-repo'
export { initDatabase, storeTopicGroups, getTopicGroups } from './topic-repo'
export { getUnreadCount, cleanupOldData } from './stats-repo'

// 保留类型向后兼容
export type { RawItem, NewRawItem } from '../schema'
export type { AIAnalysis, NewAIAnalysis } from '../schema'
