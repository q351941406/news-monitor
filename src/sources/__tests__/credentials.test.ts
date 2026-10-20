/**
 * 数据源凭据声明的契约测试
 *
 * 核心价值：锁死「缺凭据 = 故障（fail-fast）」而不是「静默跳过」。
 * 历史上 CI 的 env 注入被清理后，源静默返回 []，断流 47~57 天全程绿灯。
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  SOURCE_CREDENTIALS,
  isSourceExplicitlySkipped,
  missingCredentials,
  assertSourceCredentials,
  requiredSecretsFor,
  allSourceCredentials,
} from '../credentials'

const MANAGED_ENVS = [
  'SKIP_SOURCE_GITHUB',
  'SKIP_SOURCE_PRODUCTHUNT',
  'SKIP_SOURCE_TWITTER',
  'PRODUCTHUNT_TOKEN',
  'TWITTER_AUTH_TOKEN',
  'TWITTER_CT0',
]

describe('isSourceExplicitlySkipped', () => {
  afterEach(() => {
    for (const key of MANAGED_ENVS) delete process.env[key]
  })

  it('未登记的源不算被跳过', () => {
    expect(isSourceExplicitlySkipped('unknown')).toBe(false)
  })

  it('skipFlag=1 / true 都算显式跳过', () => {
    process.env.SKIP_SOURCE_TWITTER = '1'
    expect(isSourceExplicitlySkipped('twitter')).toBe(true)
    process.env.SKIP_SOURCE_TWITTER = 'true'
    expect(isSourceExplicitlySkipped('twitter')).toBe(true)
  })

  it('其他取值不算跳过（避免误伤）', () => {
    process.env.SKIP_SOURCE_TWITTER = '0'
    expect(isSourceExplicitlySkipped('twitter')).toBe(false)
    process.env.SKIP_SOURCE_TWITTER = 'yes'
    expect(isSourceExplicitlySkipped('twitter')).toBe(false)
  })
})

describe('missingCredentials', () => {
  afterEach(() => {
    for (const key of MANAGED_ENVS) delete process.env[key]
  })

  it('未登记的源没有必需凭据', () => {
    expect(missingCredentials('unknown')).toEqual([])
  })

  it('列出缺失的全部凭据名', () => {
    expect(missingCredentials('twitter')).toEqual(['TWITTER_AUTH_TOKEN', 'TWITTER_CT0'])
    process.env.TWITTER_AUTH_TOKEN = 'x'
    expect(missingCredentials('twitter')).toEqual(['TWITTER_CT0'])
  })

  it('github 无必需凭据', () => {
    expect(missingCredentials('github')).toEqual([])
  })
})

describe('assertSourceCredentials —— 缺凭据必须 fail-fast', () => {
  afterEach(() => {
    for (const key of MANAGED_ENVS) delete process.env[key]
  })

  it('缺凭据时抛错，且错误信息点名缺失的变量', () => {
    let msg = ''
    try {
      assertSourceCredentials('producthunt', 'Product Hunt')
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toContain('PRODUCTHUNT_TOKEN')
    expect(msg).toContain('配置故障')
    expect(msg).toContain('SKIP_SOURCE_PRODUCTHUNT')
  })

  it('凭据齐备时静默通过', () => {
    process.env.PRODUCTHUNT_TOKEN = 'token'
    expect(() => assertSourceCredentials('producthunt', 'Product Hunt')).not.toThrow()
  })

  it('显式设置 skipFlag 时跳过（跳过必须是有意识的决定）', () => {
    process.env.SKIP_SOURCE_PRODUCTHUNT = '1'
    expect(() => assertSourceCredentials('producthunt', 'Product Hunt')).not.toThrow()
  })
})

describe('契约查询函数', () => {
  it('requiredSecretsFor：未登记的源返回空数组', () => {
    expect(requiredSecretsFor('unknown')).toEqual([])
    expect(requiredSecretsFor('twitter')).toEqual(['TWITTER_AUTH_TOKEN', 'TWITTER_CT0'])
  })

  it('allSourceCredentials：列出全部源及其必需凭据', () => {
    const all = allSourceCredentials()
    expect(all.map((s) => s.slug).sort()).toEqual(['github', 'producthunt', 'twitter'])
    expect(all.find((s) => s.slug === 'github')!.required).toEqual([])
  })

  it('SOURCE_CREDENTIALS 的每个源都有 skipFlag', () => {
    for (const cred of Object.values(SOURCE_CREDENTIALS)) {
      expect(cred.skipFlag).toMatch(/^SKIP_SOURCE_/)
    }
  })
})
