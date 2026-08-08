/**
 * 数据库测试辅助工具
 *
 * 使用真实的 PostgreSQL 数据库进行集成测试。
 *
 * 隔离策略：每个测试文件（vitest worker 进程）通过 createTestTables()
 * 创建**独立且唯一的 Postgres schema**，所有连接走该 schema 的
 * search_path，因此测试文件可以安全地并行运行，互不干扰。
 * 测试结束后调用 dropTestSchema() 整体清理。
 *
 * 需要设置 DATABASE_URL 环境变量指向测试数据库。
 */
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { resetDbPool } from '../connection'

let testPool: Pool | null = null
let testSchema: string | null = null

/** 当前 worker 专属 schema 的 search_path 连接参数（未初始化时为 undefined） */
function schemaOptions(): string | undefined {
  return testSchema ? `-c search_path=${testSchema}` : undefined
}

export function getTestDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未设置，无法运行数据库集成测试')
  }
  if (!testPool) {
    testPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: schemaOptions(),
    })
  }
  return drizzle(testPool)
}

/** 创建当前 worker 专属 schema 并在其中建表，实现并行测试隔离 */
export async function createTestTables() {
  if (testPool) {
    await testPool.end()
    testPool = null
  }
  testSchema = `test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
  // 业务仓库模块共享的全局连接也要指向该 schema
  process.env.PG_SEARCH_PATH = testSchema
  resetDbPool()
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! })
  try {
    await admin.query(`CREATE SCHEMA "${testSchema}"`)
  } finally {
    await admin.end()
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    options: schemaOptions(),
  })
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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        aggregated_at TIMESTAMPTZ
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

/** 清理当前 worker 的测试 schema（连同全部表数据），并释放连接池 */
export async function dropTestSchema() {
  if (!testSchema) return
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! })
  try {
    await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
  } finally {
    await admin.end()
  }
  if (testPool) {
    await testPool.end()
    testPool = null
  }
  delete process.env.PG_SEARCH_PATH
  resetDbPool()
  testSchema = null
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
