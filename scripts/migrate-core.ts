/**
 * 迁移执行核心 —— 供 migrate-ci.ts（生产）与 db-test-helper.ts（测试）复用
 *
 * 单一真相：测试环境的建表与生产迁移完全一致，永不漂移。
 * 差异仅在"是否写 __ci_migrations 追踪表"：
 *  - 生产：写，保证幂等（只执行一次）
 *  - 测试：不写（每个 worker 全新 schema，天然隔离）
 */
import path from 'path'
import fs from 'fs'
import { Pool } from 'pg'

/** 读取并排序 drizzle 目录下全部 .sql 迁移文件 */
export function listMigrationFiles(migrationsDir: string): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/** 将迁移文件内容按 --> statement-breakpoint 拆分为独立语句 */
export function splitMigrationStatements(content: string): string[] {
  return content
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * 重写语句中的 schema 限定符。
 *
 * drizzle-kit 生成的迁移会把被引用表写成 `"public"."raw_items"` 这类
 * 硬编码 public 前缀。生产环境正确；但测试环境建在独立 schema 下，
 * 必须把 `"public".` 重写为 `"<schemaName>".`，否则外键会错误指向
 * public schema 的表，破坏测试隔离。
 *
 * 仅重写显式 `"public".` 前缀；未加前缀的语句由 search_path 定向。
 */
export function rewriteSchemaQualifier(sql: string, schemaName: string): string {
  return sql.replaceAll('"public".', `"${schemaName}".`)
}

/**
 * 在给定 pool 上执行全部迁移。
 * @param pool 目标连接池（生产用主连接，测试用带 search_path 的连接）
 * @param opts.recordApplied 是否写入 __ci_migrations 追踪表（生产=true，测试=false）
 * @param opts.rewriteSchema 测试环境下把 `"public".` 重写为指定 schema 名
 * @returns 实际执行的迁移文件列表（跳过的不算）
 */
export async function runMigrations(
  pool: Pool,
  opts: { recordApplied: boolean; rewriteSchema?: string },
): Promise<string[]> {
  const migrationsDir = path.resolve(process.cwd(), 'drizzle')
  if (!fs.existsSync(migrationsDir)) return []
  const sqlFiles = listMigrationFiles(migrationsDir)
  const applied: string[] = []

  if (opts.recordApplied) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS __ci_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
  }

  for (const file of sqlFiles) {
    if (opts.recordApplied) {
      const prev = await pool.query('SELECT filename FROM __ci_migrations WHERE filename = $1', [
        file,
      ])
      if (prev.rows.length > 0) {
        console.log(`  ✓ ${file} (already applied)`)
        continue
      }
    }
    let content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    if (opts.rewriteSchema) {
      content = rewriteSchemaQualifier(content, opts.rewriteSchema)
    }
    const statements = splitMigrationStatements(content)
    console.log(`  -> Applying ${file} (${statements.length} statements)...`)
    for (const stmt of statements) {
      try {
        await pool.query(stmt)
      } catch (err) {
        // "already exists" 类错误跳过（幂等）
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists')) {
          console.log(`    ⏭ Skipped (already exists)`)
          continue
        }
        throw err
      }
    }
    if (opts.recordApplied) {
      await pool.query('INSERT INTO __ci_migrations (filename) VALUES ($1)', [file])
    }
    applied.push(file)
    console.log(`  ✅ ${file} applied`)
  }
  return applied
}
