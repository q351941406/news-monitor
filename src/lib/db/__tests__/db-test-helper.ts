/**
 * 数据库测试辅助工具
 *
 * 使用真实的 PostgreSQL 数据库进行集成测试，
 * 测试前建表，测试后清理。
 *
 * 需要设置 DATABASE_URL 环境变量指向测试数据库。
 */
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

let testPool: Pool | null = null

export function getTestDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未设置，无法运行数据库集成测试')
  }
  if (!testPool) {
    testPool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return drizzle(testPool)
}

export async function createTestTables() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
  try {
    await pool.query('DROP TABLE IF EXISTS topic_items CASCADE')
    await pool.query('DROP TABLE IF EXISTS topic_groups CASCADE')
    await pool.query('DROP TABLE IF EXISTS ai_analysis CASCADE')
    await pool.query('DROP TABLE IF EXISTS raw_items CASCADE')

    await pool.query(`
      CREATE TABLE raw_items (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT,
        url TEXT NOT NULL,
        raw_data JSONB NOT NULL,
        is_read BOOLEAN DEFAULT FALSE NOT NULL,
        fetched_at BIGINT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`
      CREATE TABLE ai_analysis (
        item_id TEXT PRIMARY KEY REFERENCES raw_items(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        details TEXT,
        processed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`
      CREATE TABLE topic_groups (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        topic TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`
      CREATE TABLE topic_items (
        topic_id TEXT REFERENCES topic_groups(id) ON DELETE CASCADE,
        item_id TEXT REFERENCES raw_items(id) ON DELETE CASCADE,
        PRIMARY KEY (topic_id, item_id)
      )
    `)
    await pool.query('CREATE INDEX IF NOT EXISTS idx_raw_items_source ON raw_items(source)')
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_raw_items_fetched_at ON raw_items(fetched_at DESC)',
    )
  } finally {
    await pool.end()
  }
}

export function insertTestItem(overrides: Record<string, unknown> = {}) {
  return {
    id: `test:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
    source: 'github',
    title: 'Test Item',
    url: 'https://example.com',
    rawData: { test: true },
    isRead: false,
    fetchedAt: Date.now(),
    ...overrides,
  }
}
