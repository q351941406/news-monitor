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
import { GET as ungroupedGET } from '@/app/api/news/ungrouped/route'

describe('API Routes', () => {
  /** 写操作需要管理员 token：测试里配一个并放进请求头 */
  const ADMIN_TOKEN = 'test-admin-token-for-coverage'
  const adminHeaders = { 'x-admin-token': ADMIN_TOKEN }

  beforeAll(async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN
    await createTestTables()
  })
  afterAll(async () => {
    await dropTestSchema()
    delete process.env.ADMIN_TOKEN
  })

  it('GET /api/health 返回 ok（默认 liveness，不查库）', async () => {
    const res = await healthGET(new NextRequest('http://localhost/api/health'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.status).toBe('ok')
    // 默认探活不触碰数据库，避免唤醒 Neon compute 耗尽免费额度
    expect(json.db).toBe('unchecked')
  })

  it('GET /api/health?deep=1 真实探测 DB，返回 db:up', async () => {
    const res = await healthGET(new NextRequest('http://localhost/api/health?deep=1'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.status).toBe('ok')
    expect(json.db).toBe('up')
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

  it('GET /api/news/ungrouped 返回未读且未归组的条目（徽标数字的对应物）', async () => {
    await storeRawItems([
      insertTestItem({
        id: 'test:api:orphan1',
        source: 'github',
        title: 'Orphan Repo',
        isRead: false,
      }) as NewRawItem,
      insertTestItem({
        id: 'test:api:orphan2',
        source: 'github',
        title: 'Read Orphan',
        isRead: true,
      }) as NewRawItem,
    ])
    const req = new NextRequest('http://localhost/api/news/ungrouped?source=github')
    const res = await ungroupedGET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    const ids = (json.data ?? []).map((i: { id: string }) => i.id)
    expect(ids).toContain('test:api:orphan1')
    // 已读的「读完即消失」，不属于待处理内容
    expect(ids).not.toContain('test:api:orphan2')
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

  it('GET /api/topics?source=xxx 返回单源格式（覆盖 source 分支）', async () => {
    const res = await topicsGET(new NextRequest('http://localhost/api/topics?source=github'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.source).toBe('github')
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.count).toBe(json.data.length)
  })

  it('GET /api/topics 无 source 时返回全源格式', async () => {
    const res = await topicsGET(new NextRequest('http://localhost/api/topics'))
    const json = await res.json()
    expect(Object.keys(json.data).sort()).toEqual(['github', 'producthunt', 'twitter'])
  })

  it('GET /api/news/ungrouped 默认 source=all、limit 非法值走默认（覆盖参数容错）', async () => {
    const res = await ungroupedGET(new NextRequest('http://localhost/api/news/ungrouped?limit=abc'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.count).toBe(json.data.length)
    expect(json.count).toBeLessThanOrEqual(50)
  })

  it('GET /api/news/ungrouped limit 超出上限时收敛到 100（覆盖 clamp 分支）', async () => {
    const res = await ungroupedGET(
      new NextRequest('http://localhost/api/news/ungrouped?limit=9999'),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.count).toBeLessThanOrEqual(100)
  })

  it('POST /api/news readAll 带 source 只清理该源（覆盖单源分支）', async () => {
    await storeRawItems([
      insertTestItem({ id: 'test:api:ra1', source: 'twitter', title: 'T' }) as NewRawItem,
    ])
    const res = await newsPOST(
      new NextRequest('http://localhost/api/news', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ action: 'readAll', source: 'twitter' }),
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it('POST /api/news resetAll 带 source（覆盖单源重置分支）', async () => {
    const res = await newsPOST(
      new NextRequest('http://localhost/api/news', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ action: 'resetAll', source: 'twitter' }),
      }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('GET /api/items/:id 的 id 为字符串时同样可查（覆盖非数组分支）', async () => {
    const res = await itemDetailGET(new NextRequest('http://localhost/api/items/x'), {
      params: Promise.resolve({ id: 'plain-id' as unknown as string[] }),
    })
    // 不存在 → 404（证明 id 拼装逻辑走通，而非抛错）
    expect(res.status).toBe(404)
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
