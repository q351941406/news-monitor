/**
 * 数据库连接模块
 * 所有仓库模块共享此连接
 *
 * 使用 pg (node-postgres) 驱动，兼容 Neon 和标准 PostgreSQL。
 * 在 Neon 中也可用（Neon 完全兼容 PostgreSQL 协议）。
 */
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return pool
}

export function getDb() {
  return drizzle(getPool())
}

/** 获取原始 pg Pool，用于 raw SQL 操作 */
export function getPgPool(): Pool {
  return getPool()
}

/** 新闻展示类型 */
export interface NewsItem {
  id: string
  source: string
  title: string | null
  url: string
  rawData: Record<string, unknown>
  summary: string | null
  details: string | null
  fetchedAt: number
  isRead: boolean
}
