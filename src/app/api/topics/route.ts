import { NextRequest, NextResponse } from 'next/server'
import { getTopicGroupMeta } from '@/lib/db'
/**
 * 主题组列表（轻量元信息，不含 items）
 *
 * 懒加载设计：列表只返回 { id, topic, summary, unreadCount, totalCount }，
 * 展开某个组时再请求 /api/topics/[id]/items。
 */
export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source')
  const showAll = request.nextUrl.searchParams.get('showAll') === 'true'
  const sources = source ? [source] : ['github', 'producthunt', 'twitter']
  const results: Record<string, Awaited<ReturnType<typeof getTopicGroupMeta>>> = {}
  await Promise.all(
    sources.map(async (s) => {
      results[s] = await getTopicGroupMeta(s, showAll)
    }),
  )
  if (source) {
    return NextResponse.json({ source, data: results[source], count: results[source].length })
  }
  return NextResponse.json({ data: results })
}
