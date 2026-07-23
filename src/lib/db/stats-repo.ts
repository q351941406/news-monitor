/**
 * 统计仓库 — 数据统计和清理
 */
import { eq, and, lt } from 'drizzle-orm'
import { rawItems } from '../schema'
import { getDb } from './connection'

/** 获取未读数量 */
export async function getUnreadCount(source?: string): Promise<number> {
  const db = getDb()
  const condition = source
    ? and(eq(rawItems.source, source), eq(rawItems.isRead, false))
    : eq(rawItems.isRead, false)
  const result = await db.select({ count: rawItems.id }).from(rawItems).where(condition)
  return result.length
}

/** 清理过期数据 */
export async function cleanupOldData(days: number = 30): Promise<void> {
  const db = getDb()
  const cutoff = Date.now() - days * 86400 * 1000
  await db.delete(rawItems).where(lt(rawItems.fetchedAt, cutoff))
}
