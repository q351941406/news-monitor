/**
 * 数据库连接模块
 * 所有仓库模块共享此连接
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

export function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql)
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
