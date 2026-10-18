/**
 * AI 提示词模板 —— 可配置化的提示词定义与渲染
 *
 * 背景：提示词曾硬编码在 `ai-service.ts` 的 buildXxxPrompt 里，
 * 改一句提示词就要走一次代码发布。本模块把「GitHub 单条摘要」
 * 提示词抽成带 `{{变量}}` 占位符的模板，存库后可在设置页手动改，
 * 生效无需重新部署。
 *
 * 分层：
 * - 本模块是纯函数（无 DB、无 IO）：模板常量 + 渲染，可被单测直接覆盖
 * - 存取走 `db/prompt-repo.ts`；实际调用方是 `ai-service.ts`
 */

/** 提示词键。预留命名空间，后续批量摘要/主题聚合可照此扩展 */
export const GITHUB_SINGLE_SUMMARY_KEY = 'github-single-summary'

/** 模板长度上限（字符）。保护 DB 字段与 LLM 上下文不被意外撑爆 */
export const PROMPT_TEMPLATE_MAX_LENGTH = 20_000

/** README 截断长度（字符）。与历史行为一致：开头保留核心信息 */
export const PROMPT_README_MAX_CHARS = 24_000

/**
 * GitHub 单条摘要的默认模板。
 *
 * 与历史硬编码 prompt 逐字等价（标题行 / keyInfo 行 / README 块 /
 * 要求 / JSON 结构说明），只是把数据点换成了 `{{变量}}`。
 * 因此「未定制」时的 AI 行为与过去完全一致，零回归。
 */
export const DEFAULT_GITHUB_SINGLE_SUMMARY_TEMPLATE = `请用中文详细分析以下 GitHub 仓库内容。
仓库: {{title}}
仓库地址: {{url}}
Stars: {{stars}}
{{readme_block}}
要求：
- 摘要：详细概括仓库核心内容，包含关键背景和上下文，突出技术要点、应用场景与特性
要求：同时输出摘要与详情
- 摘要：一句话概括仓库核心内容
- 详情：保留重要细节、技术要点、应用场景、特性
严格按以下 JSON 结构输出：
{"summary":"一句话概括","details":"补充信息"}
- 不要编造原文未提供的信息
- 保留原文中的具体数据、技术术语、关键信息`

/** 模板变量说明（设置页展示给用户看） */
export const GITHUB_SINGLE_SUMMARY_VARIABLES: Array<{ name: string; desc: string }> = [
  { name: 'id', desc: '新闻 ID（如 github:owner/repo），原样返回' },
  { name: 'title', desc: '仓库标题，无标题时为「无」' },
  { name: 'key_info', desc: '描述 / 语言 / Stars 等关键信息行（缺失项自动省略）' },
  { name: 'readme_block', desc: 'README 全文块（自动截断至前 24000 字符，无 README 时为空）' },
  { name: 'description', desc: '仓库描述（可能为空）' },
  { name: 'language', desc: '主要语言（可能为空）' },
  { name: 'stars', desc: 'Stars 数（可能为空）' },
  { name: 'stars_today', desc: '今日新增 Stars（可能为空）' },
  { name: 'readme', desc: 'README 原文（已截断，不含标题包装）' },
]

/** 校验模板。返回 null 表示通过，否则返回给用户看的错误信息 */
export function validatePromptTemplate(template: unknown): string | null {
  if (typeof template !== 'string' || template.trim().length === 0) {
    return '模板不能为空'
  }
  if (template.length > PROMPT_TEMPLATE_MAX_LENGTH) {
    return `模板过长（${template.length} 字符），上限为 ${PROMPT_TEMPLATE_MAX_LENGTH} 字符`
  }
  return null
}

/**
 * 渲染模板：把 `{{变量}}` 替换为实际值。
 *
 * - 未提供值的变量替换为空字符串（缺失字段不污染 prompt）
 * - 模板里写错的未知变量同样置空，避免 `{{typo}}` 原样喂给模型
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, name: string) => {
    const value = vars[name]
    if (value === null || value === undefined) return ''
    return String(value)
  })
}

export interface GithubSingleSummaryVars {
  id: string
  title: string | null
  rawData: Record<string, unknown>
}

/** 从 RawItem 组装 GitHub 单条摘要模板的全部变量（含 README 截断） */
export function buildGithubSingleSummaryVars(
  item: GithubSingleSummaryVars,
): Record<string, string> {
  const data = item.rawData
  const asText = (v: unknown): string =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : ''

  const description = asText(data.description)
  const language = asText(data.language)
  const stars = asText(data.stars)
  const starsToday = asText(data.starsToday)
  const url =
    typeof data.url === 'string' && data.url
      ? data.url
      : item.title
        ? `https://github.com/${item.title}`
        : ''

  // 缺失项自动省略：判定用原始值（与历史硬编码一致，如 stars=0 时省略该行）
  let keyInfo = ''
  if (data.description) keyInfo += `描述: ${description}\n`
  if (data.language) keyInfo += `语言: ${language}\n`
  if (data.stars) keyInfo += `Stars: ${stars}\n`
  if (data.starsToday) keyInfo += `今日新增 Stars: ${starsToday}\n`

  const rawReadme = typeof data.readme === 'string' ? data.readme : ''
  const readme = rawReadme.slice(0, PROMPT_README_MAX_CHARS)
  // README 可能极大（数十万字符），超出多数模型的上下文上限会导致整条失败；
  // 故截取前 24000 字符，保留项目核心信息（开头通常含简介/特性/用法）。
  const readmeBlock = rawReadme
    ? `\nREADME 全文（可能含 HTML，忽略其中的图片/徽章/样式）：\n${readme}${rawReadme.length > PROMPT_README_MAX_CHARS ? `\n\n[README 过长，已截断至前 ${PROMPT_README_MAX_CHARS} 字符]` : ''}\n`
    : ''

  return {
    id: item.id,
    title: item.title || '无',
    url,
    description,
    language,
    stars,
    stars_today: starsToday,
    readme,
    key_info: keyInfo,
    readme_block: readmeBlock,
  }
}
