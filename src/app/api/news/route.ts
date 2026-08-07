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
import { markGroupAsRead } from '@/lib/db'
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
    return NextResponse.json({ success: true })
  }
  if (action === 'unread' && itemId) {
    await markAsUnread(itemId)
    return NextResponse.json({ success: true })
  }
  if (action === 'readGroup' && topicId) {
    await markGroupAsRead(topicId)
    return NextResponse.json({ success: true })
  }
  if (action === 'readAll') {
    await markAllAsRead(source || undefined)
    return NextResponse.json({ success: true })
  }
  if (action === 'resetAll') {
    await resetAllRead(source || undefined)
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
