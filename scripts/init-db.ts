/**
 * 初始化数据库表
 * 用法: npx tsx scripts/init-db.ts
 */
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { neon } from '@neondatabase/serverless'

async function main() {
  console.log('Initializing database...')

  const sql = neon(process.env.DATABASE_URL!)

  // 原始内容表
  await sql`
    CREATE TABLE IF NOT EXISTS raw_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      raw_data JSONB NOT NULL,
      is_read BOOLEAN DEFAULT FALSE NOT NULL,
      fetched_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  console.log('  ✓ raw_items table')

  await sql`
    CREATE INDEX IF NOT EXISTS idx_raw_items_source ON raw_items(source)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_raw_items_fetched_at ON raw_items(fetched_at DESC)
  `
  console.log('  ✓ indexes')

  // AI 分析结果表
  await sql`
    CREATE TABLE IF NOT EXISTS ai_analysis (
      item_id TEXT PRIMARY KEY REFERENCES raw_items(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      details TEXT,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  console.log('  ✓ ai_analysis table')

  // 主题聚合表
  await sql`
    CREATE TABLE IF NOT EXISTS topic_groups (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      topic TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  console.log('  ✓ topic_groups table')

  // 主题-新闻关联表
  await sql`
    CREATE TABLE IF NOT EXISTS topic_items (
      topic_id TEXT REFERENCES topic_groups(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES raw_items(id) ON DELETE CASCADE,
      PRIMARY KEY (topic_id, item_id)
    )
  `
  console.log('  ✓ topic_items table')

  console.log('\n✅ Database initialized successfully')
}

main().catch(error => {
  console.error('❌ Failed to initialize database:', error)
  process.exit(1)
})
