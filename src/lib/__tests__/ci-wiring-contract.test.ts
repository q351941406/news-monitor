/**
 * CI 接线契约测试
 *
 * 存在的理由（真实事故）：
 * 源码与 CI 配置之间的契约被两次「合理」的重构悄悄剪断——
 *   - a7795e9 删除 `pip install twitter-cli`，但源码仍 execSync 调用该 CLI
 *   - 2dce843 删除 PRODUCTHUNT_TOKEN / TWITTER_AUTH_TOKEN / TWITTER_CT0 注入
 * 契约的两半分别位于 .ts 与 .yml，review 同一个 diff 看不出矛盾——
 * 矛盾在 diff 与「未被改动的源码」之间。
 *
 * 结果：Product Hunt 断流 47 天、X 断流 57 天，全程 workflow 绿色、零告警。
 *
 * 本测试把该契约变成机器可校验的断言：任何单侧改动都会让 CI 红掉。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { allSourceCredentials } from '@/sources/credentials'

const ROOT = process.cwd()
const WORKFLOWS_DIR = path.join(ROOT, '.github/workflows')
const PIPELINE_ACTION = path.join(ROOT, '.github/actions/scrape-pipeline/action.yml')

/** 读取某源对应的 caller workflow 内容 */
function readSourceWorkflow(slug: string): string {
  const p = path.join(WORKFLOWS_DIR, `scrape-${slug}.yml`)
  if (!fs.existsSync(p)) throw new Error(`找不到 workflow: ${p}`)
  return fs.readFileSync(p, 'utf-8')
}

describe('CI 接线契约：源码依赖必须在 workflow 中被满足', () => {
  describe('数据源凭据', () => {
    for (const { slug, required } of allSourceCredentials()) {
      if (required.length === 0) continue

      it(`${slug}: workflow 注入了全部必需凭据 (${required.join(', ')})`, () => {
        const workflow = readSourceWorkflow(slug)
        const missing = required.filter((name) => !workflow.includes(`secrets.${name}`))
        expect(
          missing,
          `scrape-${slug}.yml 未注入: ${missing.join(', ')}\n` +
            `源码在凭据缺失时会直接抛错，抓取将无法进行。\n` +
            `如需新增凭据，请在 src/sources/credentials.ts 与本 workflow 同步更新。`,
        ).toEqual([])
      })
    }
  })

  describe('composite action 透传', () => {
    it('pipeline 将凭据透传给 scrape 步骤', () => {
      const action = fs.readFileSync(PIPELINE_ACTION, 'utf-8')
      // job-level env 会继承到 composite action 的 step，但 scrape 步骤的
      // 显式 env 块必须引用它们，否则脚本读不到
      const scrapeStep = action.slice(action.indexOf('Run scraper'))
      for (const { required } of allSourceCredentials()) {
        for (const name of required) {
          expect(scrapeStep.includes(name), `action.yml 的 Run scraper 步骤未透传 ${name}`).toBe(
            true,
          )
        }
      }
    })
  })

  describe('外部 CLI 依赖', () => {
    it('源码 execSync 调用的 CLI 必须在 pipeline 中安装', () => {
      // 扫源码找出所有 execSync 调用的可执行文件
      const sourcesDir = path.join(ROOT, 'src/sources')
      const calledBins = new Set<string>()
      for (const f of fs.readdirSync(sourcesDir)) {
        if (!f.endsWith('.ts') || f.includes('.test.')) continue
        const content = fs.readFileSync(path.join(sourcesDir, f), 'utf-8')
        for (const m of content.matchAll(/execSync\(\s*['"`]([a-z0-9_-]+)\s/g)) {
          calledBins.add(m[1])
        }
      }

      const action = fs.readFileSync(PIPELINE_ACTION, 'utf-8')
      const uninstalled = [...calledBins].filter(
        (bin) => !new RegExp(`pip install[^\\n]*${bin}|npm i[^\\n]*${bin}`).test(action),
      )
      expect(
        uninstalled,
        `源码调用了这些 CLI 但 action.yml 未安装: ${uninstalled.join(', ')}\n` +
          `历史故障：twitter-cli 的安装步骤被删，源码却仍调用它，导致 X 抓取静默断流。`,
      ).toEqual([])
    })
  })

  describe('反向检查：workflow 不应注入了源码不读的凭据', () => {
    it('每个被注入的 secret 都能在 credentials 声明或源码中被找到', () => {
      const declared = new Set(allSourceCredentials().flatMap((s) => s.required))
      const ignorable = new Set([
        'DATABASE_URL',
        'AI_API_KEY',
        'AI_BASE_URL',
        'AI_MODEL',
        'ADMIN_TOKEN',
        'GITHUB_TOKEN',
        'SENTRY_DSN',
      ])
      const offenders: string[] = []

      for (const { slug } of allSourceCredentials()) {
        const workflow = readSourceWorkflow(slug)
        for (const m of workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
          const name = m[1]
          if (declared.has(name) || ignorable.has(name)) continue
          offenders.push(`${slug}: ${name}`)
        }
      }
      expect(
        offenders,
        `以下 secret 被注入但源码未声明使用，可能是重构残留: ${offenders.join(', ')}`,
      ).toEqual([])
    })
  })
})
