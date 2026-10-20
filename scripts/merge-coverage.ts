/**
 * 合并单元 + 集成覆盖率（v8 raw → 行级 union）
 *
 * 用法: npm run test:coverage:merge
 * 读取 coverage/unit + coverage/integration 的 coverage-final.json
 * 用 istanbul-lib-coverage 按语句/函数/分支/行做 union 合并，
 * 输出合并后的 coverage/coverage-summary.json 并检查 DevOps 门槛。
 *
 * 门槛 **90%**（四项全达标才算通过）是硬门禁：
 * CI 的 coverage job 跑它，不达标 → 退出码 1 → workflow 红 →
 * 分支保护的 required check 不通过 → **禁止合并**。
 */
import fs from 'fs'
import path from 'path'
import { createCoverageMap } from 'istanbul-lib-coverage'

const UNIT = path.resolve(process.cwd(), 'coverage/unit/coverage-final.json')
const INTEGRATION = path.resolve(process.cwd(), 'coverage/integration/coverage-final.json')
const OUT = path.resolve(process.cwd(), 'coverage/coverage-summary.json')

function load(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) {
    console.error(`❌ 缺少覆盖率报告: ${file}\n请先运行单测与集成测试的 coverage`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

function main() {
  const unit = load(UNIT)
  const integration = load(INTEGRATION)
  const map = createCoverageMap(unit)
  map.merge(createCoverageMap(integration))

  // 输出合并后的文件级 summary
  const fileSummaries: Record<string, unknown> = {}
  for (const key of map.files()) {
    fileSummaries[key] = map.fileCoverageFor(key).toSummary()
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(fileSummaries, null, 2))

  const t = map.getCoverageSummary()
  console.log('=== 合并后总覆盖率 (unit ∪ integration) ===')
  console.log(`  lines:      ${t.lines.pct.toFixed(1)}%  (${t.lines.covered}/${t.lines.total})`)
  console.log(
    `  statements: ${t.statements.pct.toFixed(1)}%  (${t.statements.covered}/${t.statements.total})`,
  )
  console.log(
    `  functions:  ${t.functions.pct.toFixed(1)}%  (${t.functions.covered}/${t.functions.total})`,
  )
  console.log(
    `  branches:   ${t.branches.pct.toFixed(1)}%  (${t.branches.covered}/${t.branches.total})`,
  )

  // DevOps 门槛：四项全 ≥ 90%
  //
  // 为什么是 90 而不是更低：80 时 branches 实测只有 85.1%（勉强过线，
  // 一行代码就能跌破），门槛形同虚设。补齐缺口后四项均在 92%+，
  // 90 是既有缓冲、又不至于松到失去意义。
  const thresholds = { lines: 90, statements: 90, functions: 90, branches: 90 }
  let pass = true
  const vals: Record<string, number> = {
    lines: t.lines.pct,
    statements: t.statements.pct,
    functions: t.functions.pct,
    branches: t.branches.pct,
  }
  for (const [k, v] of Object.entries(thresholds)) {
    if (vals[k] < v) {
      console.error(`  ❌ ${k}: ${vals[k].toFixed(1)}% < ${v}%`)
      pass = false
    }
  }
  if (!pass) {
    console.error('❌ 覆盖率低于 DevOps 门槛，请补充测试')
    process.exit(1)
  }
  console.log('✅ 覆盖率达标 (lines/statements/functions/branches 全部 ≥90%)')
}

main()
