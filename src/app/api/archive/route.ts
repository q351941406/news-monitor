import { NextRequest, NextResponse } from 'next/server'
import { getArchivedNews, markAsUnread, deleteItem } from '@/lib/db'
import { isAdminAuthorized, unauthorized } from '@/lib/admin-auth'

/**
 * 历史归档 API
 * - GET：公开，查询已读条目列表（支持 source / page / pageSize / q / days 过滤）
 * - POST：管理员，恢复未读 / 彻底删除
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const source = sp.get('source') || 'all'
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)
  const pageSize = Math.min(50, Math.max(1, parseInt(sp.get('pageSize') || '20', 10) || 20))
  const q = sp.get('q') || undefined
  const days = sp.get('days') ? Math.max(1, parseInt(sp.get('days')!, 10) || 7) : undefined
  const { items, total } = await getArchivedNews({ source, page, pageSize, q, days })
  return NextResponse.json({ data: items, total, page, pageSize })
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return unauthorized()
  }
  const body = await request.json().catch(() => null)
  const { action, itemId } = body ?? {}
  if (action === 'restore' && typeof itemId === 'string') {
    await markAsUnread(itemId)
    return NextResponse.json({ success: true })
  }
  if (action === 'delete' && typeof itemId === 'string') {
    await deleteItem(itemId)
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
