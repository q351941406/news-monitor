/**
 * Health check endpoint（探活）
 *
 * 两种模式，把「外部探活」与「DB 连通性检查」解耦：
 *
 *   1. 默认 —— liveness，**不触碰数据库**
 *        GET /api/health
 *        200 { status: 'ok', db: 'unchecked', uptime, timestamp }
 *
 *   2. 深度检查 —— readiness，真实查询 DB
 *        GET /api/health?deep=1
 *        200 { status: 'ok', db: 'up', uptime, timestamp }
 *        503 { status: 'degraded', db: 'down', error, uptime, timestamp }
 *
 * 为什么默认不查 DB：
 *   Neon 的 scale-to-zero 需要 compute 连续 5 分钟无活动才会挂起。
 *   而 uptime 监控（UptimeRobot）以 5 分钟间隔探活，旧实现每次都执行
 *   `SELECT 1`，恰好把挂起计时器不断重置 —— compute 因此近乎 7×24 常驻，
 *   免费额度（100 CU-hours/月）被凭空耗尽，实测月消耗约 162 CU-hours。
 *
 *   探活只应回答「进程是否存活」；DB 连通性交给低频的 deep 检查
 *   （建议间隔 ≥ 30 分钟）或业务自身告警。
 *
 * 不缓存（每请求真实探测），避免读到过期状态。
 */
import { NextResponse } from 'next/server'
import { getPgPool } from '@/lib/db/connection'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function checkDb(): Promise<{ up: true } | { up: false; error: string }> {
  try {
    const pool = getPgPool()
    // SELECT 1 是最便宜的探活查询
    await pool.query('SELECT 1')
    return { up: true }
  } catch (e) {
    return { up: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET(request: Request) {
  const timestamp = new Date().toISOString()
  const uptime = Math.round(process.uptime())

  // 只有显式 deep=1 才触碰数据库（见文件头说明）
  const deep = new URL(request.url).searchParams.get('deep') === '1'

  if (!deep) {
    return NextResponse.json({
      status: 'ok',
      db: 'unchecked',
      uptime,
      timestamp,
    })
  }

  const db = await checkDb()

  if (!db.up) {
    return NextResponse.json(
      {
        status: 'degraded',
        db: 'down',
        error: db.error,
        uptime,
        timestamp,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    status: 'ok',
    db: 'up',
    uptime,
    timestamp,
  })
}
