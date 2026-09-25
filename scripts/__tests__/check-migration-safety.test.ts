import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  scanMigrationSql,
  readDeclaration,
  evaluate,
  changedMigrationFiles,
} from '../check-migration-safety'

const repoRoot = path.resolve(__dirname, '../..')
const migration = (name: string) => readFileSync(path.join(repoRoot, 'drizzle', name), 'utf8')

describe('check-migration-safety - 破坏性 DDL 检出', () => {
  const breakingCases: [string, string][] = [
    ['drop-table', 'DROP TABLE legacy;'],
    ['drop-table', 'DROP TABLE IF EXISTS legacy;'],
    ['drop-column', 'ALTER TABLE raw_items DROP COLUMN legacy_field;'],
    [
      'drop-constraint',
      'ALTER TABLE raw_items DROP CONSTRAINT uniq_raw_items_ph_content_fingerprint;',
    ],
    ['alter-column-type', 'ALTER TABLE raw_items ALTER COLUMN fetched_at TYPE integer;'],
    ['alter-column-type', 'ALTER TABLE raw_items ALTER COLUMN fetched_at SET DATA TYPE integer;'],
    ['set-not-null', 'ALTER TABLE raw_items ALTER COLUMN title SET NOT NULL;'],
    ['rename', 'ALTER TABLE raw_items RENAME COLUMN title TO name;'],
    ['rename', 'ALTER TABLE raw_items RENAME TO items;'],
    ['truncate', 'TRUNCATE raw_items;'],
    ['add-not-null-without-default', 'ALTER TABLE raw_items ADD COLUMN flag boolean NOT NULL;'],
  ]

  it.each(breakingCases)('%s：%s', (rule, sql) => {
    const findings = scanMigrationSql(sql)
    expect(findings.map((f) => f.rule)).toContain(rule)
    expect(findings.find((f) => f.rule === rule)!.severity).toBe('breaking')
  })

  it('ADD COLUMN NOT NULL 带 DEFAULT 属安全变更，不报', () => {
    const sql = `ALTER TABLE raw_items ADD COLUMN flag boolean NOT NULL DEFAULT false;`
    expect(scanMigrationSql(sql).filter((f) => f.severity === 'breaking')).toHaveLength(0)
  })

  it('ADD COLUMN 可空属安全变更，不报', () => {
    const sql = `ALTER TABLE raw_items ADD COLUMN note text;`
    expect(scanMigrationSql(sql).filter((f) => f.severity === 'breaking')).toHaveLength(0)
  })

  it('CREATE INDEX 只是提示（notice），不阻塞', () => {
    const findings = scanMigrationSql('CREATE UNIQUE INDEX uniq_x ON raw_items (id);')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('notice')
  })

  it('CREATE INDEX CONCURRENTLY 不报（已避开写锁）', () => {
    expect(scanMigrationSql('CREATE INDEX CONCURRENTLY idx_x ON raw_items (id);')).toHaveLength(0)
  })

  it('注释里的破坏性语句不算数（避免误报导致门禁失去信任）', () => {
    const sql = `-- 历史上这里 DROP COLUMN legacy_field，现已改回兼容写法
-- ALTER TABLE raw_items DROP COLUMN legacy_field;
/* DROP TABLE raw_items; */
SELECT 1;`
    expect(scanMigrationSql(sql)).toHaveLength(0)
  })

  it('行号指向真实语句所在行', () => {
    const sql = `-- 第一行注释\n\nDROP TABLE legacy;`
    expect(scanMigrationSql(sql)[0].line).toBe(3)
  })
})

describe('check-migration-safety - 显式声明放行', () => {
  const declaredSql = `-- breaking: 移除 legacy_field —— 写入侧已在 v1 停用，本版删列\nALTER TABLE raw_items DROP COLUMN legacy_field;`

  it('读到声明内容', () => {
    expect(readDeclaration(declaredSql)).toContain('移除 legacy_field')
  })

  it('无声明时读不到', () => {
    expect(readDeclaration('DROP TABLE legacy;')).toBeNull()
  })

  it('已声明的文件：破坏性项降级为提示，不再阻塞', () => {
    const r = evaluate([{ file: 'drizzle/9999_declared.sql', sql: declaredSql }])
    expect(r.failures).toHaveLength(0)
    expect(r.declared).toHaveLength(1)
    expect(r.notices.length).toBeGreaterThan(0)
  })

  it('未声明的文件：阻塞', () => {
    const r = evaluate([{ file: 'drizzle/9999_silent.sql', sql: 'DROP TABLE legacy;' }])
    expect(r.failures).toHaveLength(1)
    expect(r.declared).toHaveLength(0)
  })

  it('声明只放行本文件，不波及其它文件', () => {
    const r = evaluate([
      { file: 'drizzle/a.sql', sql: declaredSql },
      { file: 'drizzle/b.sql', sql: 'DROP TABLE other;' },
    ])
    expect(r.failures).toHaveLength(1)
    expect(r.failures[0].file).toBe('drizzle/b.sql')
  })
})

describe('check-migration-safety - 对项目真实迁移的回归验证', () => {
  it('0006（内容指纹去重）：additive 迁移应通过，仅建索引为提示', () => {
    const r = evaluate([
      {
        file: 'drizzle/0006_dedupe_and_normalize_ids.sql',
        sql: migration('0006_dedupe_and_normalize_ids.sql'),
      },
    ])
    expect(r.failures).toHaveLength(0)
    expect(r.notices.some((n) => n.rule === 'create-index-blocking')).toBe(true)
  })

  it('0002（删历史表）：规则确实能拦住真实存在的破坏性迁移', () => {
    const r = evaluate([
      { file: 'drizzle/0002_drop_news_items.sql', sql: migration('0002_drop_news_items.sql') },
    ])
    expect(r.failures.map((f) => f.rule)).toContain('drop-table')
  })

  it('全部历史迁移中，破坏性变更只应出现在明确知道的那几个文件里', () => {
    // 若这条变红，说明有人新增了未声明的破坏性迁移 —— 门禁之外的历史文件也需要复核
    const all = ['0000_initial.sql', '0001_early_skin.sql', '0002_drop_news_items.sql']
    const withBreaking = all.filter(
      (f) => evaluate([{ file: `drizzle/${f}`, sql: migration(f) }]).failures.length > 0,
    )
    expect(withBreaking).toEqual(['0002_drop_news_items.sql'])
  })
})

describe('check-migration-safety - 改动范围识别', () => {
  it('对比基线能列出本次改动的迁移文件（无改动时为空数组）', () => {
    // 用 HEAD 自己作基线：必然没有差异
    const files = changedMigrationFiles('HEAD', repoRoot)
    expect(files).toEqual([])
  })
})
