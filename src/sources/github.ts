import { NewsSource, NewsItem } from './types'
import { aiSummarizeWithRetry } from '@/lib/ai'

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
          return text.slice(0, 3000)
        }
      } catch {
        continue
      }
    }
  }
  return ''
}

function cleanReadme(readme: string): string {
  return readme
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .slice(0, 2000)
}

export const githubSource: NewsSource = {
  name: 'GitHub Trending',
  slug: 'github',

  async fetch(): Promise<NewsItem[]> {
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
    const repos: TrendingRepo[] = data.items.map((item: any) => ({
      author: item.owner?.login || 'unknown',
      name: item.name,
      fullname: item.full_name,
      description: item.description || '',
      url: item.html_url,
      stars: item.stargazers_count,
      language: item.language || 'Unknown',
    }))

    const topRepos = repos.slice(0, 10)

    // 并行获取 README 和 AI 总结
    const items = await Promise.all(
      topRepos.map(async (repo) => {
        const readme = await fetchReadme(repo.author, repo.name)
        const cleanContent = cleanReadme(readme)

        const summary = await aiSummarizeWithRetry({
          prompt: `请用中文简洁总结以下 GitHub 仓库，控制在 400 字以内。

仓库名：${repo.fullname}
语言：${repo.language}
原描述：${repo.description || '无'}

README：
${cleanContent || '无'}

格式要求（直接输出，不要用 Markdown 符号）：
• 项目简介：一句话说明
• 核心功能：2-3 个要点
• 适用人群：谁适合用`,
        })

        return {
          id: repo.fullname,
          source: 'github',
          title: repo.fullname,
          description: repo.description || '',
          url: repo.url,
          author: repo.author,
          metrics: { stars: repo.stars },
          summary: summary || repo.description || '暂无描述',
          fetchedAt: Date.now()
        }
      })
    )

    return items
  }
}
