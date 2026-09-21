import { NewsSource, RawItem } from './types'
import { execSync } from 'child_process'
import { parse as parseYaml } from 'yaml'
import { execSyncWithRetry } from '@/lib/retry'
import { assertSourceCredentials, isSourceExplicitlySkipped } from './credentials'

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
  'ai',
  'llm',
  'gpt',
  'claude',
  'openai',
  'anthropic',
  '机器学习',
  '人工智能',
  'programming',
  'developer',
  'coding',
  '开源',
  'github',
  '编程',
  'startup',
  'fintech',
  'crypto',
  '量化',
  'trading',
  'react',
  'typescript',
  'python',
  'rust',
  'golang',
  'cloud',
  'kubernetes',
  'docker',
  'devops',
]

function isTechRelated(text: string): boolean {
  const lower = text.toLowerCase()
  return TECH_KEYWORDS.some((kw) => lower.includes(kw))
}

/**
 * 解析 twitter-cli 的结构化输出。
 *
 * 为什么不再手写逐行解析（真实依据）：
 * 旧实现对齐的是 twitter-cli 的「扁平字段」格式（顶层 id/text/name/screenName/likes），
 * 而 0.8.5 的实际输出是 `ok:` / `schema_version:` / `data:` 包装，字段嵌在
 * `author.*` / `metrics.*` 下。实测：
 *   旧格式(旧单测 fixture)   → 解析出条目（已不再是 CLI 真实输出）
 *   0.8.5 成功格式           → 靠字段名巧合部分命中（name/likes 等在嵌套层级里）
 *   0.8.5 失败格式(ok: false) → 静默解析成 0 条，逐行解析器完全看不见
 * CLI 下次改缩进或字段名 → 静默变 0，又是一次「绿着断」。
 *
 * 现在改用 yaml 库正经解析，并显式处理失败包装：失败必须抛错。
 * 输出契约（twitter-cli 0.8.5 `output.py` / `serialization.py`）：
 *   { ok: true,  schema_version: '1', data: [ { id, text, author: {...}, metrics: {...}, media: [...] } ] }
 *   { ok: false, schema_version: '1', error: { code, message } }
 *
 * 该函数导出供测试直接固化契约，无需真实调用 CLI。
 */
export function parseTwitterCliOutput(raw: string): Tweet[] {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('twitter-cli 返回空输出（预期 YAML 时间线）')
  }

  let payload: unknown
  try {
    payload = parseYaml(trimmed)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // 非 YAML 输出极可能是 CLI 崩溃时的富文本/报错文本落到 stdout
    throw new Error(`twitter-cli 输出不是合法 YAML，无法解析: ${msg}`)
  }

  if (payload === null || typeof payload !== 'object') {
    throw new Error('twitter-cli 输出不是预期的 YAML 对象')
  }

  const root = payload as Record<string, unknown>

  // 失败包装：ok: false + error —— 旧逐行解析器会把这种情况静默当成 0 条
  if (root.ok === false) {
    const err = (root.error ?? {}) as Record<string, unknown>
    const code = typeof err.code === 'string' ? err.code : 'unknown'
    const message = typeof err.message === 'string' ? err.message.trim() : ''
    const hint =
      code === 'not_authenticated'
        ? '\n  → TWITTER_AUTH_TOKEN / TWITTER_CT0 已失效，需更新 CI secrets。'
        : ''
    throw new Error(`twitter-cli 报告失败 (${code}): ${message}${hint}`)
  }

  // 兼容两种形态：带 data 包装 / 直接是数组（旧版本 CLI 或 --json 直出）
  const list = Array.isArray(root.data) ? root.data : Array.isArray(payload) ? payload : null
  if (list === null) {
    throw new Error('twitter-cli 输出缺少 data 数组（既不是 { ok, data } 包装也不是数组）')
  }

  // 命令报成功、data 却是空数组 = 异常，而非「本次没有推文」。
  // 已请求 --max 50，正常基线为 41~45 条；0 条通常意味着登录态半失效或上游限流。
  // 分层原则：这里只判「CLI 输出是否可信」，
  // 「过滤后无内容」属另一回事，由 fetch() 与 scrape-guard 分别处理。
  if (list.length === 0) {
    throw new Error(
      'twitter-cli 执行成功但 data 为空数组（已请求 --max 50 却无任何返回）。\n' +
        '  → 通常意味着登录态半失效或上游限流，而非「时间线上没有推文」。\n' +
        '  → 若确实要临时停用 X 源，请显式设置 SKIP_SOURCE_TWITTER=1。',
    )
  }

  return list.map((entry) => normalizeTweet(entry)).filter((t): t is Tweet => t !== null)
}

/**
 * 把一条 CLI 记录归一化为内部 Tweet 结构；缺 id 或 text 视为无效条目。
 *
 * 字段读取同时兼容两种层级（nested-first，flat 兜底）：
 *   nested  0.8.5+：author.screenName / author.name / metrics.likes / metrics.retweets
 *   flat    早期版本：顶层 screenName / name / likes / retweets
 * 兼容不是历史包袱，而是抗 schema 漂移 —— 历史上正是「解析器与真实输出格式脱节」
 * 造成了静默解析 0 条。多支持一种已知形态，就少一次静默失败的机会。
 */
function normalizeTweet(entry: unknown): Tweet | null {
  if (entry === null || typeof entry !== 'object') return null
  const t = entry as Record<string, unknown>

  const id = typeof t.id === 'string' || typeof t.id === 'number' ? String(t.id) : ''
  const text = typeof t.text === 'string' ? t.text : ''
  // 两者缺一即无法构成可展示条目（旧实现同样以 id+text 作为有效性判据）
  if (!id || !text) return null

  const author = (t.author ?? {}) as Record<string, unknown>
  const metrics = (t.metrics ?? {}) as Record<string, unknown>
  const mediaRaw = Array.isArray(t.media) ? t.media : []

  const media = mediaRaw
    .map((m) => {
      if (m === null || typeof m !== 'object') return null
      const item = m as Record<string, unknown>
      const type = typeof item.type === 'string' ? item.type : ''
      const url = typeof item.url === 'string' ? item.url : ''
      return type && url ? { type, url } : null
    })
    .filter((m): m is { type: string; url: string } => m !== null)

  const screenName = firstNonEmptyString(author.screenName, t.screenName)
  const displayName = firstNonEmptyString(author.name, t.name)
  const username = screenName || displayName || 'unknown'

  return {
    id,
    author: displayName || username,
    username,
    text,
    // url 在解析层就确定，不再依赖 fetch 末尾的 map 兜底
    url: `https://x.com/${username}/status/${id}`,
    likes: toNumber(metrics.likes ?? t.likes),
    retweets: toNumber(metrics.retweets ?? t.retweets),
    media,
  }
}

/** 返回第一个非空字符串，全部为空则返回空串 */
function firstNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v) return v
  }
  return ''
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

export const twitterSource: NewsSource = {
  name: 'X / Twitter',
  slug: 'twitter',

  async fetch(): Promise<RawItem[]> {
    // 凭据缺失 = 配置故障，直接抛错让 run 红掉（历史上此处静默返回 []，
    // 导致 workflow 全绿而抓取断流 57 天）
    if (isSourceExplicitlySkipped('twitter')) return []
    assertSourceCredentials('twitter', 'X / Twitter')
    const authToken = process.env.TWITTER_AUTH_TOKEN!
    const ct0 = process.env.TWITTER_CT0!

    // 使用 twitter-cli 获取推荐时间线
    let yamlOutput = ''
    try {
      yamlOutput = execSyncWithRetry(
        () =>
          execSync('twitter feed --max 50 --yaml', {
            env: {
              ...process.env,
              TWITTER_AUTH_TOKEN: authToken,
              TWITTER_CT0: ct0,
            },
            timeout: 30000,
            encoding: 'utf-8',
          }),
        {
          retries: 3,
          baseDelayMs: 1000,
          maxBackoffMs: 10000,
          onRetry: (attempt, err) => {
            console.warn(
              `  ⚠️ twitter-cli 第 ${attempt} 次重试:`,
              err instanceof Error ? err.message : err,
            )
          },
        },
      )
    } catch (error) {
      // 失败即抛错：CLI 缺失 / cookie 失效 / 网络问题都属于「源不可用」，
      // 不能伪装成「没有数据」（历史上此处静默返回 []，断流 57 天无人察觉）
      const msg = error instanceof Error ? error.message : String(error)
      const hint = /ENOENT|not found/i.test(msg)
        ? '\n  → 找不到 twitter-cli。请确认 CI 已执行 pip install twitter-cli。'
        : ''
      throw new Error(`twitter-cli 执行失败: ${msg}${hint}`)
    }

    const allTweets = parseTwitterCliOutput(yamlOutput)
    console.log(`  📋 Parsed ${allTweets.length} tweets from twitter-cli`)

    // 关键词过滤
    const techTweets = allTweets.filter((t) => isTechRelated(t.text)).slice(0, 20)

    if (techTweets.length === 0) {
      console.log('  ⚠️ No tech-related tweets found')
      return []
    }

    console.log(`  🔍 Found ${techTweets.length} tech-related tweets`)

    // 构建原始数据
    const items: RawItem[] = techTweets.map((t) => {
      const media = t.media || []
      const photos = media.filter((m) => m.type === 'photo')
      const videos = media.filter((m) => m.type === 'video')

      // 预览图：优先用图片，否则用 Twitter 的媒体预览 API
      const previewImage =
        photos[0]?.url || (videos[0] ? `https://jf.x.com/images/media-preview/${t.id}` : null)

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
          photos: photos.map((m) => m.url),
          videos: videos.map((m) => m.url),
          previewImage,
          mediaType: videos.length > 0 ? 'video' : photos.length > 0 ? 'photo' : null,
          mediaUrl: videos[0]?.url || photos[0]?.url || null,
        },
        fetchedAt: Date.now(),
      }
    })

    return items
  },
}
