import { NextRequest, NextResponse } from 'next/server'
import { getItemDetail } from '@/lib/db'
/**
 * 单条 item 的完整详情（含原文 rawData + AI details）
 * 只在用户展开某条 item 时才请求 —— L3 懒加载
 * GET /api/items/:id
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getItemDetail(id)
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  return NextResponse.json({ data: item })
}
