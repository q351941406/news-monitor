/**
 * 初始化数据库表
 * 用法: npx tsx scripts/init-db.ts
 */
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { initDatabase } from '../src/lib/db'

async function main() {
  console.log('Initializing database...')

  try {
    await initDatabase()
    console.log('✅ Database tables created successfully')
    console.log('  - raw_items (原始数据)')
    console.log('  - ai_analysis (AI 摘要)')
  } catch (error) {
    console.error('❌ Failed to initialize database:', error)
    process.exit(1)
  }
}

main()
