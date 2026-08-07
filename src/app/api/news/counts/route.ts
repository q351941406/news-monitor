import { NextResponse } from 'next/server'
import { getNewsCounts } from '@/lib/db'
/**
 * 各数据源的未读/总数统计 —— 轻量接口，供 Header 徽标与 SourceTabs 使用
 * GET /api/news/counts → { data: { github: { total, unread }, ... } }
 */
export async function GET() {
  const counts = await getNewsCounts()
  return NextResponse.json({ data: counts })
}
