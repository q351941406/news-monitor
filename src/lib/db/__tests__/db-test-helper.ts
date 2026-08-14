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
 * 建表：复用 scripts/migrate-core.ts 执行 drizzle/*.sql 迁移文件，
 * 保证测试环境的表结构与生产迁移完全一致（单一真相，永不漂移）。
 *
 * 需要设置 DATABASE_URL 环境变量指向测试数据库。
 */
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { resetDbPool } from '../connection'
import { runMigrations } from '../../../../scripts/migrate-core'
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
/** 创建当前 worker 专属 schema 并应用全部迁移建表，实现并行测试隔离 */
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
    // 应用 drizzle/*.sql 全部迁移（0000→0005），与生产迁移完全一致
    // recordApplied=false：每个 worker 是新 schema，无需追踪表
    // rewriteSchema：drizzle-kit 生成的迁移硬编码 "public". 前缀，
    //   测试 schema 下必须重写指向本 worker 的 schema，否则外键错指 public
    await runMigrations(pool, { recordApplied: false, rewriteSchema: testSchema! })
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
