import { NewsSource, RawItem } from './types'
import { aiSummarizeWithRetry } from '@/lib/ai'
import { storeRawItems, storeAIAnalysis, existsItem } from '@/lib/db'
import { fetchOGData } from '@/lib/og'
import { execSync } from 'child_process'

interface Tweet {
  id: string
  author: string
  username: string
  text: string
  url: string
  likes: number
  retweets: number
  media?: Array<{ type: string; url: string }>
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

function parseYamlTweets(yaml: string): Tweet[] {
  const tweets: Tweet[] = []
  const lines = yaml.split('\n')
  let current: Partial<Tweet> = {}
  let inMedia = false
  let currentMedia: { type?: string; url?: string } = {}

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('- id:') && !inMedia) {
      if (current.id && current.text) {
        tweets.push(current as Tweet)
      }
      current = { id: trimmed.split(':')[1]?.trim().replace(/'/g, ''), media: [] }
      inMedia = false
      currentMedia = {}
    } else if (trimmed.startsWith('text:') && current.id && !inMedia) {
      current.text = trimmed.slice(5)?.trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('name:') && !current.author && !inMedia) {
      current.author = trimmed.slice(5)?.trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('screenName:') && !current.username && !inMedia) {
      current.username = trimmed.slice(11)?.trim().replace(/^["']|["']$/g, '')
    } else if (trimmed.startsWith('likes:') && current.id && !inMedia) {
      current.likes = parseInt(trimmed.slice(6)?.trim()) || 0
    } else if (trimmed.startsWith('retweets:') && current.id && !inMedia) {
      current.retweets = parseInt(trimmed.slice(9)?.trim()) || 0
    } else if (trimmed === 'media:') {
      inMedia = true
      currentMedia = {}
    } else if (inMedia) {
      if (trimmed.startsWith('- type:')) {
        currentMedia = { type: trimmed.slice(7)?.trim() }
      } else if (trimmed.startsWith('url:') && currentMedia.type) {
        currentMedia.url = trimmed.slice(4)?.trim()
        if (currentMedia.url && current.media) {
          current.media.push({
            type: currentMedia.type as 'photo' | 'video',
            url: currentMedia.url
          })
        }
        currentMedia = {}
      } else if (trimmed.startsWith('- id:') || trimmed.startsWith('urls:')) {
        inMedia = false
      }
    }
  }

  if (current.id && current.text) {
    tweets.push(current as Tweet)
  }

  return tweets.map(t => ({
    ...t,
    url: `https://x.com/${t.username || 'unknown'}/status/${t.id}`
  }))
}

export const twitterSource: NewsSource = {
  name: 'X / Twitter',
  slug: 'twitter',

  async fetch(): Promise<RawItem[]> {
    const authToken = process.env.TWITTER_AUTH_TOKEN
    const ct0 = process.env.TWITTER_CT0

    if (!authToken || !ct0) {
      console.log('  ⚠️ Twitter auth tokens not configured, skipping')
      return []
    }

    // 使用 twitter-cli 获取推荐时间线
    let yamlOutput = ''
    try {
      yamlOutput = execSync('twitter feed --max 50 --yaml', {
        env: {
          ...process.env,
          TWITTER_AUTH_TOKEN: authToken,
          TWITTER_CT0: ct0,
        },
        timeout: 30000,
        encoding: 'utf-8',
      })
    } catch (error) {
      console.error('  ❌ twitter-cli failed:', error)
      return []
    }

    if (!yamlOutput) {
      console.log('  ⚠️ twitter-cli returned empty output')
      return []
    }

    const allTweets = parseYamlTweets(yamlOutput)
    console.log(`  📋 Parsed ${allTweets.length} tweets from twitter-cli`)

    // 关键词过滤
    const techTweets = allTweets.filter(t => isTechRelated(t.text)).slice(0, 20)

    if (techTweets.length === 0) {
      console.log('  ⚠️ No tech-related tweets found')
      return []
    }

    console.log(`  🔍 Found ${techTweets.length} tech-related tweets`)

    // 构建原始数据
    const items: RawItem[] = techTweets.map(t => {
      const media = t.media || []
      const photos = media.filter(m => m.type === 'photo')
      const videos = media.filter(m => m.type === 'video')

      return {
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
          photos: photos.map(m => m.url),
          videos: videos.map(m => m.url),
          previewImage: photos[0]?.url || null,
          mediaType: videos.length > 0 ? 'video' : photos.length > 0 ? 'photo' : null,
          mediaUrl: videos[0]?.url || photos[0]?.url || null,
        },
        fetchedAt: Date.now(),
      }
    })

    // 存储原始数据
    await storeRawItems(items)
    console.log(`  📦 Stored ${items.length} raw items`)

    // 为新项目生成 AI 摘要
    for (const item of items) {
      if (!(await existsItem(item.id))) continue

      const summary = await aiSummarizeWithRetry({
        prompt: `请用中文简洁总结以下推文。

作者：${item.rawData.author} (@${item.rawData.username})
内容：${item.rawData.text}

格式要求：
• 一句话总结
• 关键信息提取`,
      })

      if (summary) {
        await storeAIAnalysis(item.id, summary)
      }
    }

    return items
  }
}
