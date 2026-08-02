/**
 * CI 安全迁移脚本 - 直接执行 SQL migration 文件
 * 不依赖 drizzle-kit（避免 CI 中交互式 TTY 问题）
 *
 * 用法: npx tsx scripts/migrate-ci.ts
 *
 * 原理：读取 drizzle/ 目录下所有 .sql 文件，逐个执行
 * 使用 migration 追踪表保证幂等性
 */
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { Pool } from 'pg'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not configured')
    process.exit(1)
  }

  const migrationsDir = path.resolve(process.cwd(), 'drizzle')
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found, skipping.')
    return
  }

  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (sqlFiles.length === 0) {
    console.log('No migration files found, skipping.')
    return
  }

  const pool = new Pool({ connectionString: databaseUrl })

  // 确保 migration 追踪表存在
  await pool.query(`
    CREATE TABLE IF NOT EXISTS __ci_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  for (const file of sqlFiles) {
    // 检查是否已执行
    const applied = await pool.query('SELECT filename FROM __ci_migrations WHERE filename = $1', [
      file,
    ])
    if (applied.rows.length > 0) {
      console.log(`  ✓ ${file} (already applied)`)
      continue
    }

    const filePath = path.join(migrationsDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')

    // 按语句分割并执行（drizzle migration 用 --> statement-breakpoint 分隔）
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    console.log(`  -> Applying ${file} (${statements.length} statements)...`)

    for (const stmt of statements) {
      try {
        await pool.query(stmt)
      } catch (err) {
        // 如果是 "already exists" 错误，跳过（幂等）
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists')) {
          console.log(`    ⏭ Skipped (already exists)`)
          continue
        }
        throw err
      }
    }

    await pool.query('INSERT INTO __ci_migrations (filename) VALUES ($1)', [file])
    console.log(`  ✅ ${file} applied`)
  }

  await pool.end()
  console.log('\n✅ All migrations complete')
}

main().catch(async (error) => {
  console.error('❌ Migration failed:', error)
  process.exit(1)
})
