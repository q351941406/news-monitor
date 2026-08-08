import { NextRequest, NextResponse } from 'next/server'
import { getItemDetail } from '@/lib/db'
/**
 * 单条 item 的完整详情（含原文 rawData + AI details）
 * 只在用户展开某条 item 时才请求 —— L3 懒加载
 * GET /api/items/:id
 *
 * 注意：id 可能含斜杠（如 github:owner/repo），因此用 catch-all 路由把
 * 多段路径拼回完整 id，避免斜杠拆断动态段。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string[] }> },
) {
  const { id: segments } = await params
  const id = Array.isArray(segments) ? segments.join('/') : String(segments)
  const item = await getItemDetail(id)
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  return NextResponse.json({ data: item })
}
