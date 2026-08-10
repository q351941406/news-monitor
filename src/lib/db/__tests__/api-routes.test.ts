import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestTables, insertTestItem, dropTestSchema } from './db-test-helper'
import { storeRawItems } from '../news-repo'
import { storeAIAnalysis } from '../ai-repo'
import type { NewRawItem } from '../../schema'

import { GET as newsGET, POST as newsPOST } from '@/app/api/news/route'
import { GET as countsGET } from '@/app/api/news/counts/route'
import { GET as topicsGET } from '@/app/api/topics/route'
import { GET as topicItemsGET } from '@/app/api/topics/[id]/items/route'
import { GET as itemDetailGET } from '@/app/api/items/[...id]/route'
import { GET as healthGET } from '@/app/api/health/route'
import { GET as metricsGET } from '@/app/api/admin/metrics/route'

describe('API Routes', () => {
  beforeAll(async () => {
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
  })

  it('GET /api/health 返回 ok', async () => {
    const res = await healthGET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.status).toBe('ok')
  })

  it('GET /api/news?source=github 返回该源条目', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:api:news1', source: 'github', title: 'Repo A' }) as NewRawItem,
    ])
    const req = new NextRequest('http://localhost/api/news?source=github')
    const res = await newsGET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    const items = json.data?.items ?? json.data ?? json
    expect(JSON.stringify(items)).toContain('Repo A')
  })

  it('GET /api/news 无 source 时返回全部来源', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:api:news2', source: 'producthunt' }) as NewRawItem,
    ])
    const req = new NextRequest('http://localhost/api/news')
    const res = await newsGET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(JSON.stringify(json)).toContain('producthunt')
  })

  it('GET /api/news/counts 返回各源统计', async () => {
    const res = await countsGET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data).toBeDefined()
    expect(json.data.github).toBeDefined()
    expect(typeof json.data.github.total).toBe('number')
  })

  it('POST /api/news 标记已读/重置（需 admin token）', async () => {
    await storeRawItems([insertTestItem({ id: 'test:api:read', source: 'github' }) as NewRawItem])
    // 无 token → 401
    const req1 = new NextRequest('http://localhost/api/news', {
      method: 'POST',
      body: JSON.stringify({ action: 'markRead', id: 'test:api:read' }),
    })
    const res1 = await newsPOST(req1)
    expect(res1.status).toBe(403)
  })

  it('GET /api/topics 返回主题组元信息', async () => {
    const req = new NextRequest('http://localhost/api/topics?source=github')
    const res = await topicsGET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.count).toBeGreaterThanOrEqual(0)
  })

  it('GET /api/topics/:id/items 返回主题条目', async () => {
    const req = new NextRequest('http://localhost/api/topics/nonexistent/items?showAll=true')
    const res = await topicItemsGET(req, { params: Promise.resolve({ id: 'nonexistent' }) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.topicId).toBe('nonexistent')
    expect(Array.isArray(json.items)).toBe(true)
  })

  it('GET /api/items/:id 返回详情，不存在时 404', async () => {
    await storeRawItems([insertTestItem({ id: 'test:api:detail', source: 'github' }) as NewRawItem])
    await storeAIAnalysis('test:api:detail', 'summary here')
    const res = await itemDetailGET(new NextRequest('http://localhost/api/items/test:api:detail'), {
      params: Promise.resolve({ id: ['test:api:detail'] }),
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(JSON.stringify(json)).toContain('summary here')

    const missing = await itemDetailGET(new NextRequest('http://localhost/api/items/not-exist'), {
      params: Promise.resolve({ id: ['not-exist'] }),
    })
    expect(missing.status).toBe(404)
  })

  it('GET /api/admin/metrics 需要 admin token', async () => {
    const noAuth = await metricsGET(new NextRequest('http://localhost/api/admin/metrics'))
    expect(noAuth.status).toBe(403)

    // 带 token（设置 ADMIN_TOKEN）
    vi.stubEnv('ADMIN_TOKEN', 'test-admin-token')
    const ok = await metricsGET(
      new NextRequest('http://localhost/api/admin/metrics', {
        headers: { 'x-admin-token': 'test-admin-token' },
      }),
    )
    expect(ok.status).toBe(200)
    vi.unstubAllEnvs()
  })
})
