import { NewsSource, NewsItem } from './types'

interface PHProduct {
  id: string
  name: string
  tagline: string
  description: string
  url: string
  website: string
  votesCount: number
  commentsCount: number
  user: { name: string }
}

async function summarizeProducts(products: PHProduct[]): Promise<Map<string, string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic'
  const model = process.env.ANTHROPIC_MODEL || 'deepseek-v4-flash'

  const summaries = new Map<string, string>()
  if (!apiKey) {
    products.forEach(p => summaries.set(p.id, p.tagline))
    return summaries
  }

  const productsText = products.map((p, i) => `
${i + 1}. 产品名: ${p.name}
   标语: ${p.tagline}
   描述: ${p.description || '无'}
   链接: ${p.url}
   官网: ${p.website || '无'}`).join('\n')

  const prompt = `以下是 ${products.length} 个 Product Hunt 新产品。请为每个产品生成中文简介，包含：
- 中文名
- 中文标语
- 一句话总结

产品列表:
${productsText}

请按顺序输出，每个产品用 "---" 分隔。简洁有吸引力。`

  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!res.ok) {
      products.forEach(p => summaries.set(p.id, p.tagline))
      return summaries
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const parts = text.split('---').filter((s: string) => s.trim())

    products.forEach((p, i) => {
      summaries.set(p.id, parts[i]?.trim() || p.tagline)
    })
  } catch {
    products.forEach(p => summaries.set(p.id, p.tagline))
  }

  return summaries
}

export const productHuntSource: NewsSource = {
  name: 'Product Hunt',
  slug: 'producthunt',

  async fetch(): Promise<NewsItem[]> {
    const token = process.env.PRODUCTHUNT_TOKEN
    if (!token) throw new Error('PRODUCTHUNT_TOKEN not configured')

    const query = `{
      posts(first: 10, order: NEWEST) {
        edges {
          node {
            id name tagline description url votesCount commentsCount website
            user { name }
          }
        }
      }
    }`

    const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000)
    })

    if (!res.ok) throw new Error(`PH API error: ${res.status}`)

    const data = await res.json()
    const products: PHProduct[] = data.data.posts.edges.map((e: { node: PHProduct }) => e.node)

    const summaries = await summarizeProducts(products)

    return products.map(p => ({
      id: `ph-${p.id}`,
      source: 'producthunt',
      title: p.name,
      description: p.tagline,
      url: p.url,
      author: p.user?.name,
      metrics: {
        votes: p.votesCount,
        comments: p.commentsCount
      },
      summary: summaries.get(p.id) || p.tagline,
      fetchedAt: Date.now()
    }))
  }
}
