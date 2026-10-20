/**
 * 仓库预览 —— 提示词效果测试的数据抓取层
 *
 * 设置页的「效果测试」需要拿一个真实仓库的数据来跑模板：
 * 链接解析（纯函数）+ 仓库元数据与 README 拉取（外部网络边界）。
 * 元数据走 GitHub REST API（未登录每小时 60 次，手动点测足够；
 * 配了 GITHUB_TOKEN 则用其额度），README 走 raw.githubusercontent
 *（复用 sources/github 的 fetchReadme，不占 API 额度）。
 */
import { fetchReadme } from '@/sources/github'

/** 类型化错误：可直接展示给管理员看（链接错了 / 仓库不存在 / 被限流） */
export class PreviewError extends Error {}

export interface RepoPreview {
  owner: string
  repo: string
  fullName: string
  description: string
  language: string
  stars: number
  readme: string
}

const SEGMENT = /^[A-Za-z0-9_.-]+$/

/**
 * 解析 GitHub 仓库链接，取出 owner / repo。
 * 接受：完整 URL（含尾 slash / .git / 子路径）、裸域名写法；
 * 拒绝：非 github.com、段缺失、非法字符、路径穿越。
 */
export function parseGithubRepoUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (url.hostname.toLowerCase() !== 'github.com') return null
  const segs = url.pathname.split('/').filter(Boolean)
  if (segs.length < 2) return null
  const owner = segs[0]
  let repo = segs[1]
  if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -4)
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') return null
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) return null
  return { owner, repo }
}

/** 拉取单个仓库的元数据 + README，失败抛 PreviewError（带给用户看的原因） */
export async function fetchRepoPreview(owner: string, repo: string): Promise<RepoPreview> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'news-monitor-prompt-tester',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  let meta: { description?: unknown; language?: unknown; stargazers_count?: unknown }
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) throw new PreviewError('仓库不存在或为私有仓库，请检查链接')
    if (res.status === 403 || res.status === 429) {
      throw new PreviewError(
        'GitHub API 限流（未登录每小时 60 次），可配置 GITHUB_TOKEN 或稍后再试',
      )
    }
    if (!res.ok) throw new PreviewError(`GitHub 返回 ${res.status}，请稍后再试`)
    meta = (await res.json()) as typeof meta
  } catch (err) {
    if (err instanceof PreviewError) throw err
    throw new PreviewError('获取仓库信息失败，请检查网络后重试')
  }
  // README 获取永不抛错（拿不到就空着跑模板，不阻断测试）
  const readme = await fetchReadme(owner, repo)
  const asText = (v: unknown): string => (typeof v === 'string' ? v : '')
  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    description: asText(meta.description),
    language: asText(meta.language),
    stars: typeof meta.stargazers_count === 'number' ? meta.stargazers_count : 0,
    readme,
  }
}
