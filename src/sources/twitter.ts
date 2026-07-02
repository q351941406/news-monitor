import { NewsSource, RawItem } from './types'
import { storeRawItems } from '@/lib/db'

interface Tweet {
  id: string
  author: string
  username: string
  text: string
  url: string
  likes: number
  retweets: number
}

const TECH_KEYWORDS = [
  'ai', 'llm', 'gpt', 'claude', 'openai', 'anthropic', '机器学习', '人工智能',
  'programming', 'developer', 'coding', '开源', 'github', '编程',
  'startup', 'fintech', 'crypto', '量化', 'trading',
  'react', 'typescript', 'python', 'rust', 'golang',
  'cloud', 'kubernetes', 'docker', 'devops'
]

function isTechRelated(text: string): boolean {
  const lower = text.toLowerCase()
  return TECH_KEYWORDS.some(kw => lower.includes(kw))
}

function parseRSS(xml: string): Tweet[] {
  const items: Tweet[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1]
    const title = extractTag(content, 'title')
    const link = extractTag(content, 'link')
    const description = extractTag(content, 'description')

    if (title && link) {
      items.push({
        id: link.split('/').pop() || String(Date.now()),
        author: title.split(':')[0] || 'Unknown',
        username: link.split('/')[3] || 'unknown',
        text: description || title,
        url: link,
        likes: 0,
        retweets: 0
      })
    }
  }

  return items
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`, 's')
  const match = xml.match(regex)
  return match?.[1]?.trim() || ''
}

export const twitterSource: NewsSource = {
  name: 'X / Twitter',
  slug: 'twitter',

  async fetch(): Promise<RawItem[]> {
    const rsshubUrl = process.env.RSSHUB_URL || 'https://rsshub.app'
    const lists = ['AI', 'tech', 'crypto']

    const allTweets: Tweet[] = []

    for (const list of lists) {
      try {
        const res = await fetch(`${rsshubUrl}/twitter/list/${list}`, {
          signal: AbortSignal.timeout(10000)
        })

        if (!res.ok) continue

        const text = await res.text()
        const items = parseRSS(text)
        allTweets.push(...items)
      } catch {
        continue
      }
    }

    // 关键词过滤
    const techTweets = allTweets.filter(t => isTechRelated(t.text)).slice(0, 20)

    // 构建原始数据
    const items: RawItem[] = techTweets.map(t => ({
      id: `x:${t.id}`,
      source: 'twitter',
      title: `@${t.username}`,
      url: t.url,
      rawData: {
        author: t.author,
        username: t.username,
        text: t.text,
        likes: t.likes,
        retweets: t.retweets,
      },
      fetchedAt: Date.now(),
    }))

    // 存储原始数据
    if (items.length > 0) {
      await storeRawItems(items)
      console.log(`  📦 Stored ${items.length} raw items`)
    }

    return items
  }
}
