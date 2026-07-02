import { NextRequest, NextResponse } from 'next/server'
import { getAllNews, getNews } from '@/lib/db'

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source')

  if (source) {
    const items = await getNews(source)
    return NextResponse.json({ source, items })
  }

  const allNews = await getAllNews()
  return NextResponse.json(allNews)
}
