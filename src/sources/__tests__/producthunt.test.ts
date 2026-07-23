import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { productHuntSource } from '../producthunt'

const MOCK_PH_RESPONSE = {
  data: {
    posts: {
      edges: [
        {
          node: {
            id: '12345',
            name: 'Test Product',
            tagline: 'Amazing test product',
            description: 'A full description of the test product',
            url: 'https://www.producthunt.com/posts/test-product',
            votesCount: 250,
            commentsCount: 42,
            website: 'https://testproduct.com',
            thumbnail: { url: 'https://ph-uploads.imgix.net/test-thumb.png' },
            media: [{ type: 'video', url: 'https://ph-uploads.imgix.net/test-video.mp4' }],
            user: { name: 'TestMaker' },
          },
        },
        {
          node: {
            id: '67890',
            name: 'No Media Product',
            tagline: 'Product without media',
            description: 'A product with no thumbnail or media',
            url: 'https://www.producthunt.com/posts/no-media',
            votesCount: 10,
            commentsCount: 2,
            website: 'https://nomedia.com',
            thumbnail: null,
            media: null,
            user: { name: 'Anonymous' },
          },
        },
      ],
    },
  },
}

describe('ProductHuntSource', () => {
  beforeEach(() => {
    // 设置 token
    process.env.PRODUCTHUNT_TOKEN = 'test-token'
    // Mock global fetch
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_PH_RESPONSE),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.PRODUCTHUNT_TOKEN
  })

  it('正常解析 Product Hunt API 返回的数据', async () => {
    const items = await productHuntSource.fetch()
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('ph:12345')
    expect(items[0].title).toBe('Test Product')
    expect(items[0].rawData.name).toBe('Test Product')
    expect(items[0].rawData.tagline).toBe('Amazing test product')
    expect(items[0].rawData.votes).toBe(250)
    expect(items[0].rawData.author).toBe('TestMaker')
    expect(items[0].rawData.previewImage).toBe('https://ph-uploads.imgix.net/test-thumb.png')
    expect(items[0].rawData.media).toHaveLength(1)
  })

  it('没有 token 时返回空数组', async () => {
    delete process.env.PRODUCTHUNT_TOKEN
    const items = await productHuntSource.fetch()
    expect(items).toHaveLength(0)
  })

  it('没有缩略图和媒体时使用 null', async () => {
    const items = await productHuntSource.fetch()
    expect(items[1].rawData.previewImage).toBeNull()
    expect(items[1].rawData.media).toEqual([])
  })

  it('API 返回错误时抛出异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    )
    await expect(productHuntSource.fetch()).rejects.toThrow('PH API error: 401')
  })
})
