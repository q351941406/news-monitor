import { NewsSource, RawItem } from './types'
import { fetchWithRetry } from '@/lib/retry'

interface PHProduct {
  id: string
  name: string
  tagline: string
  description: string
  url: string
  website: string
  votesCount: number
  commentsCount: number
  thumbnail: { url: string } | null
  media: Array<{ type: string; url: string }> | null
  user: { name: string }
}

export const productHuntSource: NewsSource = {
  name: 'Product Hunt',
  slug: 'producthunt',

  async fetch(): Promise<RawItem[]> {
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
            thumbnail { url }
            media { type url }
            user { name }
          }
        }
      }
    }`

    const res = await fetchWithRetry(() =>
      fetch('https://api.producthunt.com/v2/api/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(15000),
      }),
    )

    if (!res.ok) throw new Error(`PH API error: ${res.status}`)

    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products: PHProduct[] = data.data.posts.edges.map((e: any) => e.node)

    // 构建原始数据
    const items: RawItem[] = products.map((p) => {
      // 获取预览图
      const previewImage = p.thumbnail?.url || p.media?.[0]?.url || null

      // 获取媒体
      const mediaItems =
        p.media?.map((m) => ({
          type: m.type,
          url: m.url,
        })) || []

      return {
        id: `ph:${p.id}`,
        source: 'producthunt',
        title: p.name,
        url: p.url,
        rawData: {
          name: p.name,
          tagline: p.tagline,
          description: p.description,
          votes: p.votesCount,
          comments: p.commentsCount,
          website: p.website,
          author: p.user?.name,
          previewImage,
          media: mediaItems,
        },
        fetchedAt: Date.now(),
      }
    })

    return items
  },
}
