/**
 * 迁移安全性检查 —— 把 expand-contract 纪律从「口头约定」变成 PR 门禁
 *
 * 存在的理由：
 * 生产迁移由 Vercel 构建时自动执行（`buildCommand: "npm run build && npm run db:migrate:ci"`，
 * 见 README「自动迁移」与 ADR-0007）。迁移与部署同批生效，因此**迁移必须向前兼容** ——
 * 否则部署切换窗口内，旧代码会读到不兼容的 schema，且回滚代码救不了（schema 已变）。
 *
 * 但这条纪律原先只是 README 里的一句 ⚠️，没有任何机制阻止破坏性迁移被合并。
 * 本脚本把它变成 CI 硬门禁：在 PR 阶段拦下（shift-left），而不是等部署时才炸。
 *
 * 为什么用「显式声明放行」而不是「一律禁止」：
 * 破坏性变更有合法场景（expand-contract 的 contract 阶段）。需要的是让人停下来
 * 确认并写下计划，不是禁止。所以在迁移文件里声明即可放行：
 *
 *   -- breaking: <理由与 expand-contract 计划>
 *
 * 用法：
 *   npx tsx scripts/check-migration-safety.ts              # 只查本次改动引入的迁移（CI 用）
 *   npx tsx scripts/check-migration-safety.ts --all        # 查全部迁移（人工审计用）
 *   npx tsx scripts/check-migration-safety.ts --base=<ref> # 指定对比基线
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type Severity = 'breaking' | 'notice'

export interface Finding {
  file: string
  line: number
  rule: string
  statement: string
  severity: Severity
}

interface Rule {
  id: string
  re: RegExp
  severity: Severity
  why: string
}

/** 破坏性 DDL：会让「旧代码 + 新 schema」失效，必须显式声明才能通过 */
const BREAKING_RULES: Rule[] = [
  {
    id: 'drop-table',
    re: /\bDROP\s+TABLE\b/i,
    severity: 'breaking',
    why: '删表后旧代码访问该表会直接报错',
  },
  {
    id: 'drop-column',
    re: /\bDROP\s+COLUMN\b/i,
    severity: 'breaking',
    why: '删列后旧代码 SELECT/INSERT 该列会报错',
  },
  {
    id: 'drop-constraint',
    re: /\bDROP\s+CONSTRAINT\b/i,
    severity: 'breaking',
    why: '删唯一约束会悄悄改变 ON CONFLICT 去重行为（本项目去重依赖唯一索引）',
  },
  {
    id: 'alter-column-type',
    re: /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i,
    severity: 'breaking',
    why: '改类型会让旧代码的读写语义错位',
  },
  {
    id: 'set-not-null',
    re: /\bALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/i,
    severity: 'breaking',
    why: '旧代码可能仍会写入 NULL，收紧约束会使其插入失败',
  },
  {
    id: 'rename',
    re: /\bRENAME\s+(?:COLUMN|TO)\b/i,
    severity: 'breaking',
    why: '重命名后旧代码引用的旧名字立即失效',
  },
  {
    id: 'truncate',
    re: /\bTRUNCATE\b/i,
    severity: 'breaking',
    why: '清空数据不可回滚',
  },
  {
    id: 'add-not-null-without-default',
    re: /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+\s+[^,;]*?\bNOT\s+NULL\b(?![^,;]*\bDEFAULT\b)/i,
    severity: 'breaking',
    why: '旧代码 INSERT 不带该列，无默认值会插入失败（应先加可空列再回填）',
  },
]

/** 非破坏但值得留意：在部署窗口里可能造成锁表/长事务 */
const NOTICE_RULES: Rule[] = [
  {
    id: 'create-index-blocking',
    re: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b(?!\s+CONCURRENTLY)/i,
    severity: 'notice',
    why: '非 CONCURRENTLY 建索引会持有写锁（本项目表量级小，通常无碍）',
  },
  {
    id: 'add-constraint',
    re: /\bADD\s+CONSTRAINT\b/i,
    severity: 'notice',
    why: '加约束会全表校验（大表上耗时）',
  },
]

const ALL_RULES = [...BREAKING_RULES, ...NOTICE_RULES]

/** 显式声明：放行该文件的破坏性迁移，并要求写下理由 */
const DECLARATION_RE = /^\s*--\s*breaking:\s*(\S.*)$/im

/** 去掉行注释，避免把注释里的 DROP COLUMN 当成真实语句（误报） */
function stripLineComment(line: string): string {
  const idx = line.indexOf('--')
  return idx === -1 ? line : line.slice(0, idx)
}

/** 去掉 /* *\/ 块注释（保留换行以维持行号） */
function stripBlockComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

export function scanMigrationSql(sql: string, file = 'migration.sql'): Finding[] {
  const code = stripBlockComments(sql).split('\n').map(stripLineComment).join('\n')

  const findings: Finding[] = []
  for (const rule of ALL_RULES) {
    // 全局匹配以捕获同一规则的多处命中
    const global = new RegExp(
      rule.re.source,
      rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g',
    )
    for (const m of code.matchAll(global)) {
      const line = code.slice(0, m.index).split('\n').length
      findings.push({
        file,
        line,
        rule: rule.id,
        statement: m[0].replace(/\s+/g, ' ').trim(),
        severity: rule.severity,
      })
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
}

export function readDeclaration(sql: string): string | null {
  const m = sql.match(DECLARATION_RE)
  return m ? m[1].trim() : null
}

export interface Evaluation {
  failures: Finding[]
  notices: Finding[]
  declared: { file: string; reason: string }[]
  scanned: number
}

export function evaluate(files: { file: string; sql: string }[]): Evaluation {
  const failures: Finding[] = []
  const notices: Finding[] = []
  const declared: { file: string; reason: string }[] = []

  for (const { file, sql } of files) {
    const reason = readDeclaration(sql)
    if (reason) declared.push({ file, reason })
    for (const f of scanMigrationSql(sql, file)) {
      // 已显式声明的文件：破坏性项降级为提示，仍需在日志里可见
      if (f.severity === 'breaking' && reason) notices.push(f)
      else if (f.severity === 'breaking') failures.push(f)
      else notices.push(f)
    }
  }
  return { failures, notices, declared, scanned: files.length }
}

export function formatReport(result: Evaluation): string {
  const out: string[] = []
  for (const f of result.failures) {
    out.push(`  ${f.file}:${f.line}  [${f.rule}]  ${f.statement}`)
  }
  for (const d of result.declared) {
    out.push(`  ${d.file}  已声明 breaking：${d.reason}`)
  }
  if (result.notices.length) {
    out.push('')
    out.push('提示（不阻塞）：')
    for (const n of result.notices) {
      out.push(`  ${n.file}:${n.line}  [${n.rule}]  ${n.statement}`)
    }
  }
  return out.join('\n')
}

/** 找出本次改动新增/修改的迁移文件（--diff-filter=AM） */
export function changedMigrationFiles(baseRef: string, cwd = process.cwd()): string[] {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

  const mergeBase = git('merge-base', baseRef, 'HEAD')
  // 三个来源都要收，否则会漏检：已提交（CI/PR）、工作区/暂存（本地改到一半）、
  // 未跟踪的新文件（刚写好还没 git add —— git diff 看不见它们）
  const sources = [
    git('diff', '--name-only', '--diff-filter=AM', mergeBase, 'HEAD', '--', 'drizzle'),
    git('diff', '--name-only', '--diff-filter=AM', mergeBase, '--', 'drizzle'),
    git('ls-files', '--others', '--exclude-standard', '--', 'drizzle'),
  ]
  return [
    ...new Set(sources.flatMap((out) => out.split(String.fromCharCode(10)).map((s) => s.trim()))),
  ]
    .filter((s) => s.endsWith('.sql'))
    .sort()
}

function listAllMigrations(cwd = process.cwd()): string[] {
  const git = execFileSync('git', ['ls-files', 'drizzle'], { cwd, encoding: 'utf8' })
  return git
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.sql'))
}

function main() {
  const argv = process.argv.slice(2)
  const all = argv.includes('--all')
  const baseArg = argv.find((a) => a.startsWith('--base='))
  const baseRef = baseArg ? baseArg.slice('--base='.length) : process.env.BASE_REF || 'origin/main'

  let files: string[]
  if (all) {
    files = listAllMigrations()
    console.log(`🔍 迁移安全性检查（--all：全部 ${files.length} 个迁移文件）`)
  } else {
    try {
      files = changedMigrationFiles(baseRef)
    } catch {
      // 无法确定基线属于配置错误：显式失败，不静默跳过
      console.error(
        `❌ 无法确定对比基线 \`${baseRef}\`（git merge-base 失败）。\n` +
          `   迁移安全性检查无法执行 —— 不静默跳过。\n` +
          `   修复：CI 里 checkout 需 fetch-depth: 0；本地请确保存在 origin/main，\n` +
          `   或用 --base=<ref> 指定基线，--all 审计全部迁移。`,
      )
      process.exit(1)
    }
    console.log(`🔍 迁移安全性检查（基线 ${baseRef}，本次改动 ${files.length} 个迁移文件）`)
    if (files.length === 0) {
      console.log('✅ 本次改动未触及 drizzle/*.sql')
      return
    }
  }

  const loaded = files
    .map((f) => ({ file: f, abs: path.resolve(f) }))
    .filter((f) => existsSync(f.abs))
    .map((f) => ({ file: f.file, sql: readFileSync(f.abs, 'utf8') }))

  const result = evaluate(loaded)

  if (result.failures.length === 0) {
    console.log(`✅ 未发现未声明的破坏性迁移（已扫描 ${result.scanned} 个文件）`)
    if (result.notices.length) console.log(formatReport(result))
    return
  }

  console.error(`\n❌ 检测到未声明的破坏性迁移（${result.failures.length} 处）\n`)
  console.error(formatReport(result))
  console.error(
    `\n生产迁移由 Vercel 构建时自动执行，与部署同批生效，因此迁移必须向前兼容\n` +
      `（additive / expand-contract：先加后删，禁止单次迁移里破坏性变更）。\n` +
      `\n若确属有意为之（如 contract 阶段），在该迁移文件顶部显式声明并写下计划：\n` +
      `  -- breaking: <理由与 expand-contract 计划>\n` +
      `\n详见 ADR-0007 与 README「自动迁移（生产部署）」。`,
  )
  process.exit(1)
}

// 仅在被直接执行时跑 main（被 import 时不执行，便于单测）
if (process.argv[1] && process.argv[1].includes('check-migration-safety')) {
  main()
}
