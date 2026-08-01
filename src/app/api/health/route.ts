/**
 * Health check endpoint
 * 用于 Docker / Vercel / 外部探活。
 *
 * 响应:
 *   200 { status: 'ok', db: 'up', uptime, timestamp }
 *   503 { status: 'degraded', db: 'down', error, timestamp }
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

export async function GET() {
  const db = await checkDb()
  const timestamp = new Date().toISOString()
  const uptime = process.uptime()

  if (!db.up) {
    return NextResponse.json(
      {
        status: 'degraded',
        db: 'down',
        error: db.error,
        uptime: Math.round(uptime),
        timestamp,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    status: 'ok',
    db: 'up',
    uptime: Math.round(uptime),
    timestamp,
  })
}
