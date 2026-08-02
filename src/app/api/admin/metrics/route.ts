import { NextResponse } from 'next/server'
import { getMetrics } from '@/lib/db'

/**
 * 运维仪表盘数据 API
 * GET /api/admin/metrics
 *
 * 返回：最近运行日志、每日统计、各源汇总、异常告警
 */
export async function GET() {
  try {
    const metrics = await getMetrics()
    return NextResponse.json(metrics)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}
