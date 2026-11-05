/**
 * 阅读状态仓库 — 已读/未读管理
 */
import { eq } from 'drizzle-orm'
import { rawItems } from '../schema'
import { getDb } from './connection'

/** 标记为已读（同时记下时间戳，供 30 天保留期清理使用） */
export async function markAsRead(itemId: string): Promise<void> {
  const db = getDb()
  await db.update(rawItems).set({ isRead: true, readAt: Date.now() }).where(eq(rawItems.id, itemId))
}

/** 标记为未读（清空 read_at：重新变回未读后，保留期计时归零） */
export async function markAsUnread(itemId: string): Promise<void> {
  const db = getDb()
  await db.update(rawItems).set({ isRead: false, readAt: null }).where(eq(rawItems.id, itemId))
}

/** 批量标记已读 */
export async function markAllAsRead(source?: string): Promise<void> {
  const db = getDb()
  const set = { isRead: true, readAt: Date.now() }
  if (source) {
    await db.update(rawItems).set(set).where(eq(rawItems.source, source))
  } else {
    await db.update(rawItems).set(set)
  }
}

/** 重置所有已读为未读 */
export async function resetAllRead(source?: string): Promise<void> {
  const db = getDb()
  const set = { isRead: false, readAt: null }
  if (source) {
    await db.update(rawItems).set(set).where(eq(rawItems.source, source))
  } else {
    await db.update(rawItems).set(set)
  }
}
