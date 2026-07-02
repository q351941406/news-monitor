import { NewsSource, RawItem } from './types'
import { aiSummarizeWithRetry } from '@/lib/ai'
import { storeRawItems, storeAIAnalysis, existsItem } from '@/lib/db'

interface TrendingRepo {
  author: string
  name: string
  fullname: string
  description: string
  url: string
  stars: number
  language: string
}

async function fetchReadme(owner: string, repo: string): Promise<string> {
  const readmeNames = ['README.md', 'README.rst', 'README.txt', 'README']
  const branches = ['main', 'master']

  for (const name of readmeNames) {
    for (const branch of branches) {
      try {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000)
        })
        if (res.ok) {
          const text = await res.text()
          return text.slice(0, 5000)
        }
      } catch {
        continue
      }
    }
  }
  return ''
}

export const githubSource: NewsSource = {
  name: 'GitHub Trending',
  slug: 'github',

  async fetch(): Promise<RawItem[]> {
    const today = new Date()
    today.setDate(today.getDate() - 1)
    const dateStr = today.toISOString().split('T')[0]

    const res = await fetch(
      `https://api.github.com/search/repositories?q=created:>${dateStr}&sort=stars&order=desc&per_page=10`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'news-monitor'
        },
        signal: AbortSignal.timeout(15000)
      }
    )

    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repos: TrendingRepo[] = data.items.map((item: any) => ({
      author: item.owner?.login || 'unknown',
      name: item.name,
      fullname: item.full_name,
      description: item.description || '',
      url: item.html_url,
      stars: item.stargazers_count,
      language: item.language || 'Unknown',
    }))

    // 获取 README 并构建原始数据
    const items: RawItem[] = await Promise.all(
      repos.map(async (repo) => {
        const readme = await fetchReadme(repo.author, repo.name)

        return {
          id: `github:${repo.fullname}`,
          source: 'github',
          title: repo.fullname,
          url: repo.url,
          rawData: {
            fullname: repo.fullname,
            description: repo.description,
            stars: repo.stars,
            language: repo.language,
            readme,
          },
          fetchedAt: Date.now(),
        }
      })
    )

    // 存储原始数据
    await storeRawItems(items)
    console.log(`  📦 Stored ${items.length} raw items`)

    // 为新项目生成 AI 摘要
    for (const item of items) {
      if (!(await existsItem(item.id))) continue

      const readme = (item.rawData.readme as string) || ''
      const cleanReadme = readme
        .replace(/```[\s\S]*?```/g, '')
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/#{1,6}\s*/g, '')
        .slice(0, 2000)

      const summary = await aiSummarizeWithRetry({
        prompt: `请用中文简洁总结以下 GitHub 仓库。

仓库名：${item.rawData.fullname}
语言：${item.rawData.language}
原描述：${item.rawData.description || '无'}

README：
${cleanReadme || '无'}

格式要求：
• 项目简介：一句话说明
• 核心功能：2-3 个要点
• 适用人群：谁适合用`,
      })

      if (summary) {
        await storeAIAnalysis(item.id, summary)
      }
    }

    return items
  }
}
