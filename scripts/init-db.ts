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
  } catch (error) {
    console.error('❌ Failed to initialize database:', error)
    process.exit(1)
  }
}

main()
