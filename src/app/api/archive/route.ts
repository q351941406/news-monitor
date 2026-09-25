import { NextRequest, NextResponse } from 'next/server'
import { getArchivedNews, markAsUnread } from '@/lib/db'
import { isAdminAuthorized, unauthorized } from '@/lib/admin-auth'
import { invalidateNewsCounts } from '@/lib/cache'

/**
 * 历史归档 API
 * - GET：公开，查询已读条目列表（支持 source / page / pageSize / q / days 过滤）
 * - POST：管理员，恢复为未读（唯一写操作）
 *
 * 刻意不提供删除：Web 端的读状态只有「已读 / 未读」两态，归档内容不可删除。
 * 这同时也保证了 raw_items 只增不减，抓取侧无需处理「删掉的内容又被抓回来」。
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
  if (!(await isAdminAuthorized(request))) {
    return unauthorized()
  }
  const body = await request.json().catch(() => null)
  const { action, itemId } = body ?? {}
  if (action === 'restore' && typeof itemId === 'string') {
    await markAsUnread(itemId)
    invalidateNewsCounts()
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
