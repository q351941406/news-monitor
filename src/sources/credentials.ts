/**
 * 数据源必需凭据的集中声明
 *
 * 为什么需要这层抽象（历史故障）：
 * CI 的 env 注入曾两次被「顺手清理」删掉（a7795e9 / 2dce843），而数据源在凭据
 * 缺失时静默返回 []，导致 workflow 全绿、抓取断流 47~57 天无人察觉。
 *
 * 这里把「每个源依赖哪些凭据」变成可被机器读取的声明，用于两处：
 *  1. 运行时：缺失即 fail-fast（不再伪装成「正常但没数据」）
 *  2. 测试：契约测试据此校验 workflow 是否注入了对应 secret
 *
 * 新增数据源或凭据时，只改这里，运行时与契约测试同时生效。
 */
import type { NewsSource } from './types'

/** 凭据名 → 说明，用于生成可读的错误信息 */
export interface SourceCredentials {
  /** 必需的环境变量名；任一缺失即视为配置不完整 */
  required: string[]
  /** 允许通过该变量显式跳过（用于本地开发 / 灰度下线某个源） */
  skipFlag: string
}

export const SOURCE_CREDENTIALS: Record<string, SourceCredentials> = {
  github: {
    required: [],
    skipFlag: 'SKIP_SOURCE_GITHUB',
  },
  producthunt: {
    required: ['PRODUCTHUNT_TOKEN'],
    skipFlag: 'SKIP_SOURCE_PRODUCTHUNT',
  },
  twitter: {
    required: ['TWITTER_AUTH_TOKEN', 'TWITTER_CT0'],
    skipFlag: 'SKIP_SOURCE_TWITTER',
  },
}

/** 该源是否被显式要求跳过 */
export function isSourceExplicitlySkipped(slug: string): boolean {
  const cred = SOURCE_CREDENTIALS[slug]
  if (!cred) return false
  const v = process.env[cred.skipFlag]
  return v === '1' || v === 'true'
}

/** 返回该源缺失的必需凭据列表 */
export function missingCredentials(slug: string): string[] {
  const cred = SOURCE_CREDENTIALS[slug]
  if (!cred) return []
  return cred.required.filter((name) => !process.env[name])
}

/**
 * 断言凭据齐备；缺失则抛错（fail-fast）
 *
 * 关键设计：默认失败，而非默认跳过。
 * 「没配凭据」是运维故障，不是可接受的正常状态——必须让 run 红掉。
 * 确需跳过时须显式设置 skipFlag，让跳过成为一次有意识的决定。
 */
export function assertSourceCredentials(slug: string, sourceName: string): void {
  if (isSourceExplicitlySkipped(slug)) {
    console.log(`  ⏭ ${sourceName} 被显式跳过（${SOURCE_CREDENTIALS[slug]?.skipFlag}=1）`)
    return
  }

  const missing = missingCredentials(slug)
  if (missing.length > 0) {
    const cred = SOURCE_CREDENTIALS[slug]
    throw new Error(
      `${sourceName} 缺少必需凭据: ${missing.join(', ')}。\n` +
        `  → 这是配置故障，不是「没有数据」。请检查 CI workflow 是否注入了对应 secret。\n` +
        `  → 若确实要跳过此源，请显式设置 ${cred?.skipFlag}=1。`,
    )
  }
}

/** 供契约测试使用：列出某源在 CI 中必须被注入的所有 secret 名 */
export function requiredSecretsFor(slug: string): string[] {
  return SOURCE_CREDENTIALS[slug]?.required ?? []
}

/** 供契约测试使用：所有源及其必需凭据 */
export function allSourceCredentials(): Array<{ slug: string; required: string[] }> {
  return Object.entries(SOURCE_CREDENTIALS).map(([slug, c]) => ({ slug, required: c.required }))
}

export type { NewsSource }
