import { NewsSource, NewsItem } from './types'

// X/Twitter 数据源需要通过外部 API 或爬虫获取
// 这里使用 Nitter 实例或第三方 API

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

async function filterAndSummarize(tweets: Tweet[]): Promise<Map<string, string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic'
  const model = process.env.ANTHROPIC_MODEL || 'deepseek-v4-flash'

  const summaries = new Map<string, string>()
  if (!apiKey) {
    tweets.forEach(t => summaries.set(t.id, t.text.slice(0, 100)))
    return summaries
  }

  const tweetsText = tweets.map((t, i) => `
${i + 1}. 作者: ${t.author} (@${t.username})
   内容: ${t.text}
   链接: ${t.url}`).join('\n')

  const prompt = `以下是 ${tweets.length} 条 X (Twitter) 推文。

请先过滤，只保留与以下主题相关的推文：
- 科技 / AI / 人工智能
- 编程 / 开发者工具
- 金融 / 量化交易

无关推文请跳过。

对于保留的推文，生成中文简介（翻译 + 一句话总结）。

推文列表:
${tweetsText}

按顺序输出，每条用 "---" 分隔。如果都不相关，输出空。`

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
        temperature: 0.3
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!res.ok) {
      tweets.forEach(t => summaries.set(t.id, t.text.slice(0, 100)))
      return summaries
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const parts = text.split('---').filter((s: string) => s.trim())

    // 简单映射：按顺序对应
    let partIdx = 0
    tweets.forEach(t => {
      if (isTechRelated(t.text) && partIdx < parts.length) {
        summaries.set(t.id, parts[partIdx++].trim())
      }
    })
  } catch {
    tweets.forEach(t => {
      if (isTechRelated(t.text)) {
        summaries.set(t.id, t.text.slice(0, 100))
      }
    })
  }

  return summaries
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

    const summaries = await filterAndSummarize(techTweets)

    return techTweets
      .filter(t => summaries.has(t.id))
      .map(t => ({
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
        summary: summaries.get(t.id) || t.text.slice(0, 100),
        fetchedAt: Date.now()
      }))
  }
}

// RSS 解析辅助函数
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
