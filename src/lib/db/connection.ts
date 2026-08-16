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
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // 集成测试通过该变量将连接定向到独立测试 schema，实现并行隔离
      options: process.env.PG_SEARCH_PATH
        ? `-c search_path=${process.env.PG_SEARCH_PATH}`
        : undefined,
      // Serverless 冷启动 + Neon 抖动场景下避免连接无限挂起导致请求超时
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    })
  }
  return pool
}
/** 测试用：重置连接池（例如切换到独立测试 schema 后强制重建连接） */
export function resetDbPool(): void {
  if (pool) {
    void pool.end()
    pool = null
  }
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
