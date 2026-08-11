import { NextRequest, NextResponse } from 'next/server'
import {
  getAllNews,
  getNews,
  getNewsCounts,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  resetAllRead,
} from '@/lib/db'
import {
  markGroupAsRead,
  deleteReadEmptyTopics,
  deleteReadEmptyTopicsBySource,
  deleteReadEmptyTopicsByItemId,
} from '@/lib/db'
import { isAdminAuthorized, unauthorized } from '@/lib/admin-auth'

// GET — 公开读操作，任何人可看
export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source')
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
  const showAll = request.nextUrl.searchParams.get('showAll') === 'true'
  if (source) {
    const items = await getNews(source, limit, showAll)
    return NextResponse.json({ source, items, count: items.length })
  }
  const [allNews, counts] = await Promise.all([getAllNews(limit, showAll), getNewsCounts()])
  return NextResponse.json({ data: allNews, counts })
}

// POST — 写操作（标记已读等），仅管理员可操作
export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return unauthorized()
  }
  const body = await request.json()
  const { action, itemId, topicId, source } = body
  if (action === 'read' && itemId) {
    await markAsRead(itemId)
    // 实时清理：若该 item 所属主题组已无任何未读（含该组只剩它一条的情况），物理删除整组
    await deleteReadEmptyTopicsByItemId(itemId)
    return NextResponse.json({ success: true })
  }
  if (action === 'unread' && itemId) {
    await markAsUnread(itemId)
    return NextResponse.json({ success: true })
  }
  if (action === 'readGroup' && topicId) {
    await markGroupAsRead(topicId)
    // 整组已读 → 该组已无未读 item，物理删除（级联删关联）
    await deleteReadEmptyTopics([topicId])
    return NextResponse.json({ success: true })
  }
  if (action === 'readAll') {
    await markAllAsRead(source || undefined)
    // 全量已读 → 所有主题组均无未读，批量物理删除（级联删关联）
    if (source) {
      await deleteReadEmptyTopicsBySource(source)
    } else {
      for (const s of ['github', 'producthunt', 'twitter']) {
        await deleteReadEmptyTopicsBySource(s)
      }
    }
    return NextResponse.json({ success: true })
  }
  if (action === 'resetAll') {
    await resetAllRead(source || undefined)
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
