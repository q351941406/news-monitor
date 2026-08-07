import { NextRequest, NextResponse } from 'next/server'
import { getTopicGroupItems } from '@/lib/db'
/**
 * 单个主题组的 items —— 点击展开时才请求
 * GET /api/topics/:id/items?showAll=true|false
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const showAll = request.nextUrl.searchParams.get('showAll') === 'true'
  const items = await getTopicGroupItems(id, showAll)
  return NextResponse.json({ topicId: id, items, count: items.length })
}
