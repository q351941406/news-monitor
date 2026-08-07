import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems, existsItem } from '../news-repo'
import type { NewRawItem } from '../../schema'

describe('NewsRepo', () => {
  beforeAll(async () => {
    await createTestTables()
  })

  afterAll(async () => {
    await dropTestSchema()
  })

  it('存储新新闻', async () => {
    const item = insertTestItem({ id: 'test:news:1', title: 'Test Repo' }) as NewRawItem
    const count = await storeRawItems([item])
    expect(count).toBe(1)
  })

  it('重复插入不会增加', async () => {
    const item = insertTestItem({ id: 'test:news:dup', title: 'Dup' }) as NewRawItem
    await storeRawItems([item])
    const count = await storeRawItems([item])
    expect(count).toBe(0)
  })

  it('检查已存在的项目', async () => {
    await storeRawItems([insertTestItem({ id: 'test:news:exists' }) as NewRawItem])
    const exists = await existsItem('test:news:exists')
    expect(exists).toBe(true)
    const notExists = await existsItem('test:news:nonexistent')
    expect(notExists).toBe(false)
  })
})
