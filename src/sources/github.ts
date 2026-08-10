import { NewsSource, RawItem } from './types'
import { fetchWithRetry } from '@/lib/retry'

interface TrendingRepo {
  author: string
  name: string
  fullname: string
  description: string
  url: string
  /** 总 star 数（兼容现有展示：NewsCard 显示 "X stars"） */
  stars: number
  /** 今日新增 star 数（trending 的核心指标） */
  starsToday: number
  language: string
}

/** 解码 HTML 实体（&amp; &#39; &#xNN; 等） */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
}

/** 去掉 HTML 标签并清理空白 */
function cleanHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseNumber(text: string): number {
  return Number(text.replace(/[^\d]/g, '')) || 0
}

/**
 * 解析 github.com/trending 页面的 HTML。
 * 页面结构：每个仓库一个 <article class="Box-row">，包含
 *   - h2 内 <a href="/owner/repo"> 仓库名
 *   - <p class="col-9 ..."> 描述
 *   - <span itemprop="programmingLanguage"> 语言
 *   - /owner/repo/stargazers 链接文本 = 总 star
 *   - "X stars today" = 今日新增 star
 */
export function parseTrendingHtml(html: string): TrendingRepo[] {
  const blocks = html.split('<article class="Box-row">').slice(1)
  const repos: TrendingRepo[] = []
  for (const block of blocks) {
    const h2 = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
    if (!h2) continue
    const link = h2[1].match(/href="\/([^"/?#]+\/[^"/?#]+)"/)
    if (!link) continue
    const [author, name] = link[1].split('/')

    const descMatch = block.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/)
    const langMatch = block.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</)
    const starsMatch = block.match(/href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/)
    const todayMatch = block.match(/([\d,]+)\s+stars\s+today/i)

    repos.push({
      author,
      name,
      fullname: link[1],
      description: descMatch ? cleanHtml(descMatch[1]) : '',
      url: `https://github.com/${link[1]}`,
      stars: starsMatch ? parseNumber(cleanHtml(starsMatch[1])) : 0,
      starsToday: todayMatch ? parseNumber(todayMatch[1]) : 0,
      language: langMatch ? langMatch[1].trim() : 'Unknown',
    })
  }
  return repos
}

async function fetchReadme(owner: string, repo: string): Promise<string> {
  const readmeNames = ['README.md', 'README.rst', 'README.txt', 'README']
  const branches = ['main', 'master']
  for (const name of readmeNames) {
    for (const branch of branches) {
      try {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`
        const res = await fetchWithRetry(() =>
          fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000),
          }),
        )
        if (res.ok) {
          return await res.text()
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
    // 真正的 GitHub Trending 页面（今日 star 增量榜），非 Search API
    const url = 'https://github.com/trending?since=daily'
    const res = await fetchWithRetry(() =>
      fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(15000),
      }),
    )
    if (!res.ok) throw new Error(`GitHub Trending error: ${res.status}`)
    const html = await res.text()
    const repos = parseTrendingHtml(html)
    if (repos.length === 0) {
      throw new Error('GitHub Trending: no repositories found in page')
    }
    // GitHub Trending 页面默认约 25 条，全部读取（不再截断）
    // 并行获取 README
    const items = await Promise.all(
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
            starsToday: repo.starsToday,
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
