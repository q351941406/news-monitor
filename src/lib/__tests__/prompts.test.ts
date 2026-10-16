import { describe, it, expect } from 'vitest'
import {
  GITHUB_SINGLE_SUMMARY_KEY,
  DEFAULT_GITHUB_SINGLE_SUMMARY_TEMPLATE,
  PROMPT_TEMPLATE_MAX_LENGTH,
  PROMPT_README_MAX_CHARS,
  validatePromptTemplate,
  renderTemplate,
  buildGithubSingleSummaryVars,
} from '../prompts'

describe('validatePromptTemplate', () => {
  it('正常模板通过', () => {
    expect(validatePromptTemplate('分析 {{title}}')).toBeNull()
  })
  it('空 / 空白 / 非字符串模板被拒绝', () => {
    expect(validatePromptTemplate('')).toBe('模板不能为空')
    expect(validatePromptTemplate('   \n  ')).toBe('模板不能为空')
    expect(validatePromptTemplate(undefined)).toBe('模板不能为空')
    expect(validatePromptTemplate({} as unknown as string)).toBe('模板不能为空')
  })
  it('超长模板被拒绝，边界值通过', () => {
    expect(validatePromptTemplate('x'.repeat(PROMPT_TEMPLATE_MAX_LENGTH + 1))).toContain('模板过长')
    expect(validatePromptTemplate('x'.repeat(PROMPT_TEMPLATE_MAX_LENGTH))).toBeNull()
  })
})

describe('renderTemplate', () => {
  it('替换已知变量', () => {
    expect(renderTemplate('ID: {{id}}，标题: {{title}}', { id: 'a', title: 'b' })).toBe(
      'ID: a，标题: b',
    )
  })
  it('变量名两侧空格被容忍', () => {
    expect(renderTemplate('[{{ id }}]', { id: 'x' })).toBe('[x]')
  })
  it('缺失值与未知变量置空，不把 {{typo}} 喂给模型', () => {
    expect(renderTemplate('a{{missing}}b{{typo}}c', {})).toBe('abc')
    expect(renderTemplate('a{{v}}b', { v: null })).toBe('ab')
    expect(renderTemplate('a{{v}}b', { v: undefined })).toBe('ab')
  })
  it('数字变量转字符串', () => {
    expect(renderTemplate('Stars: {{stars}}', { stars: 100 })).toBe('Stars: 100')
  })
})

describe('buildGithubSingleSummaryVars', () => {
  const base = {
    id: 'github:owner/repo',
    title: 'owner/repo',
    rawData: {
      description: 'test desc',
      language: 'TypeScript',
      stars: 100,
      starsToday: 5,
      readme: '# Full README',
    },
  }

  it('全字段组装 key_info 与 readme_block', () => {
    const vars = buildGithubSingleSummaryVars(base)
    expect(vars.id).toBe('github:owner/repo')
    expect(vars.title).toBe('owner/repo')
    expect(vars.key_info).toContain('描述: test desc')
    expect(vars.key_info).toContain('语言: TypeScript')
    expect(vars.key_info).toContain('Stars: 100')
    expect(vars.key_info).toContain('今日新增 Stars: 5')
    expect(vars.readme_block).toContain('README 全文')
    expect(vars.readme_block).toContain('# Full README')
    expect(vars.readme_block).not.toContain('已截断')
  })

  it('缺失项自动省略（无标题/无描述/无 README）', () => {
    const vars = buildGithubSingleSummaryVars({ id: 'x', title: null, rawData: {} })
    expect(vars.title).toBe('无')
    expect(vars.key_info).toBe('')
    expect(vars.readme_block).toBe('')
  })

  it('stars=0 时省略 Stars 行（与历史硬编码一致）', () => {
    const vars = buildGithubSingleSummaryVars({
      id: 'x',
      title: 't',
      rawData: { stars: 0 },
    })
    expect(vars.key_info).not.toContain('Stars')
  })

  it('非字符串 README 被视为空', () => {
    const vars = buildGithubSingleSummaryVars({
      id: 'x',
      title: 't',
      rawData: { readme: { not: 'a string' } },
    })
    expect(vars.readme_block).toBe('')
    expect(vars.readme).toBe('')
  })

  it('超长 README 截断至上限并带截断注记', () => {
    const vars = buildGithubSingleSummaryVars({
      id: 'x',
      title: 't',
      rawData: { readme: 'r'.repeat(PROMPT_README_MAX_CHARS + 100) },
    })
    expect(vars.readme).toHaveLength(PROMPT_README_MAX_CHARS)
    expect(vars.readme_block).toContain('已截断')
  })
})

describe('默认模板', () => {
  it('键名稳定（存量数据与 API 共用）', () => {
    expect(GITHUB_SINGLE_SUMMARY_KEY).toBe('github-single-summary')
  })
  it('渲染后与历史硬编码 prompt 关键内容一致（零回归）', () => {
    const rendered = renderTemplate(
      DEFAULT_GITHUB_SINGLE_SUMMARY_TEMPLATE,
      buildGithubSingleSummaryVars({
        id: 'github:owner/repo',
        title: 'owner/repo',
        rawData: { description: 'd', readme: '# readme' },
      }),
    )
    expect(rendered).toContain('请用中文详细分析以下 GitHub 仓库内容。')
    expect(rendered).toContain('ID: github:owner/repo')
    expect(rendered).toContain('标题: owner/repo')
    expect(rendered).toContain('描述: d')
    expect(rendered).toContain('README 全文')
    expect(rendered).toContain('# readme')
    expect(rendered).toContain('{"id":"github:owner/repo"')
    expect(rendered).toContain('原样返回')
    // 无残留占位符
    expect(rendered).not.toMatch(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/)
  })
})
