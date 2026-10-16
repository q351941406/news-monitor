import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestDb, createTestTables, dropTestSchema } from './db-test-helper'
import {
  getCustomPromptTemplate,
  saveCustomPromptTemplate,
  deleteCustomPromptTemplate,
} from '../prompt-repo'
import { aiPrompts } from '../../schema'
import { eq } from 'drizzle-orm'
import { resetDbPool } from '../connection'

describe('PromptRepo', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('无定制时返回 null（读侧「无行 = 默认模板」）', async () => {
    await expect(getCustomPromptTemplate('github-single-summary')).resolves.toBeNull()
  })

  it('保存后可读出，二次保存覆盖且只有一行', async () => {
    await saveCustomPromptTemplate('github-single-summary', 'v1 {{title}}')
    await expect(getCustomPromptTemplate('github-single-summary')).resolves.toBe('v1 {{title}}')
    await saveCustomPromptTemplate('github-single-summary', 'v2 {{title}}')
    await expect(getCustomPromptTemplate('github-single-summary')).resolves.toBe('v2 {{title}}')

    const db = getTestDb()
    const rows = await db.select().from(aiPrompts).where(eq(aiPrompts.key, 'github-single-summary'))
    expect(rows).toHaveLength(1)
    expect(rows[0].updatedAt).toBeInstanceOf(Date)
  })

  it('删除后恢复 null（恢复默认模板）', async () => {
    await saveCustomPromptTemplate('github-single-summary', 'temp')
    await deleteCustomPromptTemplate('github-single-summary')
    await expect(getCustomPromptTemplate('github-single-summary')).resolves.toBeNull()
  })

  it('删除不存在的定制不报错（幂等）', async () => {
    await expect(deleteCustomPromptTemplate('github-single-summary')).resolves.toBeUndefined()
  })

  it('无 DATABASE_URL 时直接回 null，不建连接', async () => {
    const prev = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      await expect(getCustomPromptTemplate('github-single-summary')).resolves.toBeNull()
    } finally {
      process.env.DATABASE_URL = prev
    }
  })

  it('DB 异常时回退 null 而不抛错（提示词是配置，读不到就用默认）', async () => {
    // 把 search_path 指向不存在的 schema，制造「表不存在」的真实 DB 错误
    const prev = process.env.PG_SEARCH_PATH
    process.env.PG_SEARCH_PATH = 'schema_that_does_not_exist_xyz'
    resetDbPool()
    try {
      await expect(getCustomPromptTemplate('github-single-summary')).resolves.toBeNull()
    } finally {
      if (prev === undefined) delete process.env.PG_SEARCH_PATH
      else process.env.PG_SEARCH_PATH = prev
      resetDbPool()
    }
  })
})
