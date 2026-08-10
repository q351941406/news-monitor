import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchOGData } from '../og'

describe('fetchOGData', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('解析 OG 标签（property 形式）', async () => {
    const html = `<html><head>
      <meta property="og:title" content="My Title" />
      <meta property="og:description" content="A cool description" />
      <meta property="og:image" content="https://img/x.png" />
      <meta property="og:site_name" content="Example" />
    </head></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => html }))
    const data = await fetchOGData('https://example.com')
    expect(data).toEqual({
      title: 'My Title',
      description: 'A cool description',
      image: 'https://img/x.png',
      siteName: 'Example',
    })
  })

  it('解析 twitter 标签作为回退', async () => {
    const html = `<meta name="twitter:title" content="TW Title" /><meta name="twitter:description" content="TW Desc" /><meta name="twitter:image" content="https://img/t.png" />`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => html }))
    const data = await fetchOGData('https://example.com')
    expect(data.title).toBe('TW Title')
    expect(data.description).toBe('TW Desc')
    expect(data.image).toBe('https://img/t.png')
  })

  it('content 在前的 meta 也能解析', async () => {
    const html = `<meta content="Reversed Title" property="og:title" />`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => html }))
    const data = await fetchOGData('https://example.com')
    expect(data.title).toBe('Reversed Title')
  })

  it('HTTP 非 2xx 返回空对象', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const data = await fetchOGData('https://example.com')
    expect(data).toEqual({})
  })

  it('网络异常返回空对象', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net fail')))
    const data = await fetchOGData('https://example.com')
    expect(data).toEqual({})
  })

  it('无任何 meta 时返回空字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '<html>nothing</html>' }),
    )
    const data = await fetchOGData('https://example.com')
    expect(data.title).toBeUndefined()
  })
})
