/**
 * 阅读状态仓库 — 已读/未读管理
 */
import { eq, and } from 'drizzle-orm'
import { rawItems } from '../schema'
import { getDb } from './connection'

/** 标记为已读 */
export async function markAsRead(itemId: string): Promise<void> {
  const db = getDb()
  await db.update(rawItems).set({ isRead: true }).where(eq(rawItems.id, itemId))
}

/** 标记为未读 */
export async function markAsUnread(itemId: string): Promise<void> {
  const db = getDb()
  await db.update(rawItems).set({ isRead: false }).where(eq(rawItems.id, itemId))
}

/** 批量标记已读 */
export async function markAllAsRead(source?: string): Promise<void> {
  const db = getDb()
  if (source) {
    await db.update(rawItems).set({ isRead: true }).where(eq(rawItems.source, source))
  } else {
    await db.update(rawItems).set({ isRead: true })
  }
}

/** 重置所有已读为未读 */
export async function resetAllRead(source?: string): Promise<void> {
  const db = getDb()
  if (source) {
    await db.update(rawItems).set({ isRead: false }).where(eq(rawItems.source, source))
  } else {
    await db.update(rawItems).set({ isRead: false })
  }
}
