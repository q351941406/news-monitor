import { NewsSource, NewsItem } from './types'
import { aiSummarizeWithRetry } from '@/lib/ai'

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

  async fetch(): Promise<NewsItem[]> {
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
    const techTweets = allTweets.filter(t => isTechRelated(t.text)).slice(0, 10)

    if (techTweets.length === 0) return []

    // 批量 AI 处理
    const tweetsText = techTweets.map((t, i) => `
${i + 1}. 作者: ${t.author} (@${t.username})
   内容: ${t.text}
   链接: ${t.url}`).join('\n')

    const aiResult = await aiSummarizeWithRetry({
      prompt: `以下是 ${techTweets.length} 条 X (Twitter) 推文，请为每条生成中文简介（翻译 + 一句话总结）。

推文列表:
${tweetsText}

按顺序输出，每条用 "---" 分隔。简洁有吸引力。`,
    })

    if (!aiResult) return []

    const summaries = aiResult.split('---').filter(s => s.trim())

    return techTweets
      .filter((_, i) => summaries[i])
      .map((t, i) => ({
        id: `x-${t.id}`,
        source: 'twitter',
        title: `@${t.username}`,
        description: t.text.slice(0, 200),
        url: t.url,
        author: t.author,
        metrics: {
          likes: t.likes,
          retweets: t.retweets
        },
        summary: summaries[i]?.trim() || t.text.slice(0, 100),
        fetchedAt: Date.now()
      }))
  }
}
