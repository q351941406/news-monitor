import { NextRequest, NextResponse } from 'next/server'
import { getTopicGroups } from '@/lib/db'

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source')
  const showAll = request.nextUrl.searchParams.get('showAll') === 'true'

  if (source) {
    const groups = await getTopicGroups(source, showAll)
    return NextResponse.json({ source, data: groups, count: groups.length })
  }

  // 获取所有数据源的主题聚合
  const sources = ['github', 'producthunt', 'twitter']
  const results: Record<
    string,
    Array<{
      id: string
      topic: string
      summary: string
      items: Array<{
        id: string
        source: string
        title: string | null
        url: string
        rawData: Record<string, unknown>
        summary: string | null
        details: string | null
        fetchedAt: number
        isRead: boolean
      }>
    }>
  > = {}

  await Promise.all(
    sources.map(async (s) => {
      results[s] = await getTopicGroups(s, showAll)
    }),
  )

  return NextResponse.json({ data: results })
}
