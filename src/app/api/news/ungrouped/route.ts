import { NextRequest, NextResponse } from 'next/server'
import { getUngroupedItems } from '@/lib/db'

/**
 * 未归组条目 —— 「徽标有数字、列表没内容」的兜底出口
 *
 * GET /api/news/ungrouped?source=github&limit=50
 *   → { data: [{ id, source, title, url, summary, fetchedAt, isRead, pendingSummary }], count }
 *
 * 语义：**未读**、且不在任何主题组里的条目。
 * 这些条目会被前台显式渲染成「待归组内容」分组，保证徽标上的每一个数字
 * 都能在页面里找到对应内容 —— 否则用户只看到一个无法解释的数字
 * （线上事故：GitHub 徽标 8、列表空白，全站无处可寻）。
 *
 * 只返回未读：已读条目按产品语义「读完即消失」，不属于待处理内容。
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const source = sp.get('source') || 'all'
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50))
  const items = await getUngroupedItems(source, limit)
  return NextResponse.json({ data: items, count: items.length })
}
