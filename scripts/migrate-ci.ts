/**
 * CI 安全迁移脚本 - 直接执行 SQL migration 文件
 * 不依赖 drizzle-kit（避免 CI 中交互式 TTY 问题）
 *
 * 用法: npx tsx scripts/migrate-ci.ts
 *
 * 原理：复用 scripts/migrate-core.ts 的执行核心（与测试环境同一套迁移逻辑），
 * 读取 drizzle/ 目录下所有 .sql 文件，逐个执行，用追踪表保证幂等。
 */
import dotenv from 'dotenv'
import path from 'path'
import { Pool } from 'pg'
import { runMigrations } from './migrate-core'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not configured')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: databaseUrl })
  try {
    await runMigrations(pool, { recordApplied: true })
  } finally {
    await pool.end()
  }
  console.log('\n✅ All migrations complete')
}
main().catch(async (error) => {
  console.error('❌ Migration failed:', error)
  process.exit(1)
})
