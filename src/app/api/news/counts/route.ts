import { NextResponse } from 'next/server'
import { getNewsCountsCached } from '@/lib/cache'
/**
 * 各数据源的未读/总数统计 —— 轻量接口，供 Header 徽标与 SourceTabs 使用
 * GET /api/news/counts → { data: { github: { total, unread }, ... } }
 *
 * 缓存：TTL 60s + 写操作主动失效（见 src/lib/cache.ts）
 */
export async function GET() {
  const counts = await getNewsCountsCached()
  return NextResponse.json({ data: counts })
}
