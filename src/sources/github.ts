import { NewsSource, RawItem } from './types'

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
          signal: AbortSignal.timeout(10000),
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
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'news-monitor',
        },
        signal: AbortSignal.timeout(15000),
      },
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

    const topRepos = repos.slice(0, 10)

    // 并行获取 README
    const items = await Promise.all(
      topRepos.map(async (repo) => {
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
      }),
    )

    return items
  },
}
