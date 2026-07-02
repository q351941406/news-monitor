import { NewsSource, NewsItem } from './types'
import { aiSummarizeWithRetry } from '@/lib/ai'

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

export const productHuntSource: NewsSource = {
  name: 'Product Hunt',
  slug: 'producthunt',

  async fetch(): Promise<NewsItem[]> {
    const token = process.env.PRODUCTHUNT_TOKEN
    if (!token) {
      console.log('  ⚠️ PRODUCTHUNT_TOKEN not configured, skipping')
      return []
    }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products: PHProduct[] = data.data.posts.edges.map((e: any) => e.node)

    // 批量 AI 处理
    const productsText = products.map((p, i) => `
${i + 1}. 产品名: ${p.name}
   标语: ${p.tagline}
   描述: ${p.description || '无'}
   链接: ${p.url}
   官网: ${p.website || '无'}`).join('\n')

    const aiResult = await aiSummarizeWithRetry({
      prompt: `以下是 ${products.length} 个 Product Hunt 新产品。请为每个产品生成中文简介，包含：
- 中文名
- 中文标语
- 一句话总结

产品列表:
${productsText}

请按顺序输出，每个产品用 "---" 分隔。简洁有吸引力。`,
    })

    const summaries = aiResult.split('---').filter(s => s.trim())

    return products.map((p, i) => ({
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
      summary: summaries[i]?.trim() || p.tagline,
      fetchedAt: Date.now()
    }))
  }
}
