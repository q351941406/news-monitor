import { NextRequest, NextResponse } from 'next/server'
import { getAllNews, getNews } from '@/lib/db'

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source')
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')

  if (source) {
    const items = await getNews(source, limit)
    return NextResponse.json({ source, items, count: items.length })
  }

  const allNews = await getAllNews(limit)
  const totalCount = Object.values(allNews).reduce((sum, items) => sum + items.length, 0)

  return NextResponse.json({ data: allNews, count: totalCount })
}
