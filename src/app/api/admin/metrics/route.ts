import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getMetrics } from '@/lib/db'
import { isAdminAuthorized, unauthorized } from '@/lib/admin-auth'
/**
 * 运维仪表盘数据 API
 * GET /api/admin/metrics
 *
 * 仅管理员可访问（需要 x-admin-token header）
 * 返回：最近运行日志、每日统计、各源汇总、异常告警
 */
export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return unauthorized()
  }
  try {
    const metrics = await getMetrics()
    return NextResponse.json(metrics)
  } catch (err) {
    // 记录根因，避免 500 无痕（历史上靠前端 breadcrumb 才能反推）
    console.error('[admin/metrics] 获取仪表盘数据失败:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}
