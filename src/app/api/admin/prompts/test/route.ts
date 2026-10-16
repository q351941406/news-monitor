import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { isAdminAuthorized, unauthorized } from '@/lib/admin-auth'
import {
  GITHUB_SINGLE_SUMMARY_KEY,
  buildGithubSingleSummaryVars,
  renderTemplate,
  validatePromptTemplate,
} from '@/lib/prompts'
import { fetchRepoPreview, parseGithubRepoUrl, PreviewError } from '@/lib/repo-preview'
import { runSingleSummaryPrompt } from '@/lib/ai-service'
/**
 * 提示词效果测试 API
 * POST /api/admin/prompts/test { key, template, url }
 *
 * 用**当前草稿模板**（无需先保存）对一个真实 GitHub 仓库跑一次 AI，
 * 返回摘要结果 + 实际渲染出的 prompt，供调模板时即时验证。
 * 仅管理员可调用（/api/admin/* 全路径受保护）；每次调用消耗一次 AI 调用。
 */

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) {
    return unauthorized()
  }
  let body: { key?: unknown; template?: unknown; url?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (body.key !== undefined && body.key !== GITHUB_SINGLE_SUMMARY_KEY) {
    return NextResponse.json({ error: 'Unknown prompt key' }, { status: 400 })
  }
  const invalid = validatePromptTemplate(body.template)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }
  const parsed = typeof body.url === 'string' ? parseGithubRepoUrl(body.url) : null
  if (!parsed) {
    return NextResponse.json(
      { error: '请输入有效的 GitHub 仓库链接，如 https://github.com/owner/repo' },
      { status: 400 },
    )
  }
  const startedAt = Date.now()
  let preview: Awaited<ReturnType<typeof fetchRepoPreview>>
  try {
    preview = await fetchRepoPreview(parsed.owner, parsed.repo)
  } catch (err) {
    if (err instanceof PreviewError) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
    console.error('[admin/prompts/test] 拉取仓库失败:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: '拉取仓库信息时发生内部错误' }, { status: 500 })
  }
  // id 归一化为小写：与抓取入库的 RawItem id 语义一致（见 sources/github.ts）
  const prompt = renderTemplate(
    (body.template as string).trim(),
    buildGithubSingleSummaryVars({
      id: `github:${preview.fullName.toLowerCase()}`,
      title: preview.fullName,
      rawData: {
        description: preview.description,
        language: preview.language,
        stars: preview.stars,
        readme: preview.readme,
      },
    }),
  )
  let result: Awaited<ReturnType<typeof runSingleSummaryPrompt>>
  try {
    // 测试求快：2 次重试；用量记到 singleSummaryTest，与生产消耗分开看
    result = await runSingleSummaryPrompt(prompt, {
      maxRetries: 2,
      operation: 'singleSummaryTest',
    })
  } catch (err) {
    console.error('[admin/prompts/test] AI 调用异常:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: 'AI 调用时发生内部错误，请稍后重试' }, { status: 500 })
  }
  if (!result) {
    return NextResponse.json(
      { error: 'AI 未返回可用结果（可能超时或被截断），可简化模板后重试' },
      { status: 502 },
    )
  }
  return NextResponse.json({
    summary: result.summary,
    details: result.details,
    renderedPrompt: prompt,
    repo: {
      fullName: preview.fullName,
      url: `https://github.com/${preview.fullName}`,
      description: preview.description,
      language: preview.language,
      stars: preview.stars,
    },
    durationMs: Date.now() - startedAt,
  })
}
