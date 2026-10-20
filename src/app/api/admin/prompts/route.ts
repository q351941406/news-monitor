import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { isAdminAuthorized, unauthorized } from '@/lib/admin-auth'
import {
  GITHUB_SINGLE_SUMMARY_KEY,
  DEFAULT_GITHUB_SINGLE_SUMMARY_TEMPLATE,
  GITHUB_SINGLE_SUMMARY_VARIABLES,
  PROMPT_TEMPLATE_MAX_LENGTH,
  validatePromptTemplate,
} from '@/lib/prompts'
import {
  getCustomPromptTemplate,
  saveCustomPromptTemplate,
  deleteCustomPromptTemplate,
} from '@/lib/db/prompt-repo'
/**
 * AI 提示词模板管理 API
 * GET /api/admin/prompts?key=github-single-summary
 * PUT /api/admin/prompts { key, template }
 * DELETE /api/admin/prompts?key=github-single-summary（恢复默认）
 *
 * 全部需要管理员 token（/api/admin/* 连 GET 也受保护，见 admin-paths.ts）。
 * 第一期只开放 github-single-summary 一个键：allowlist 拒绝未知键，
 * 后续批量摘要/主题聚合照此键扩展即可。
 */

const KNOWN_KEYS = [GITHUB_SINGLE_SUMMARY_KEY] as const
type KnownKey = (typeof KNOWN_KEYS)[number]

function resolveKey(raw: string | null): KnownKey | null {
  const key = raw || GITHUB_SINGLE_SUMMARY_KEY
  return (KNOWN_KEYS as readonly string[]).includes(key) ? (key as KnownKey) : null
}

function defaultFor(key: KnownKey): string {
  switch (key) {
    case GITHUB_SINGLE_SUMMARY_KEY:
      return DEFAULT_GITHUB_SINGLE_SUMMARY_TEMPLATE
  }
}

function variablesFor(key: KnownKey) {
  switch (key) {
    case GITHUB_SINGLE_SUMMARY_KEY:
      return GITHUB_SINGLE_SUMMARY_VARIABLES
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) {
    return unauthorized()
  }
  const key = resolveKey(request.nextUrl.searchParams.get('key'))
  if (!key) {
    return NextResponse.json({ error: 'Unknown prompt key' }, { status: 400 })
  }
  try {
    const custom = await getCustomPromptTemplate(key)
    return NextResponse.json({
      key,
      template: custom ?? defaultFor(key),
      isCustom: custom !== null,
      maxLength: PROMPT_TEMPLATE_MAX_LENGTH,
      variables: variablesFor(key),
    })
  } catch (err) {
    console.error('[admin/prompts] 读取模板失败:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: 'Failed to fetch prompt template' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) {
    return unauthorized()
  }
  let body: { key?: unknown; template?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const key = resolveKey(typeof body.key === 'string' ? body.key : null)
  if (!key) {
    return NextResponse.json({ error: 'Unknown prompt key' }, { status: 400 })
  }
  const invalid = validatePromptTemplate(body.template)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }
  try {
    const template = (body.template as string).trim()
    await saveCustomPromptTemplate(key, template)
    return NextResponse.json({ success: true, key, isCustom: true })
  } catch (err) {
    console.error('[admin/prompts] 保存模板失败:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: 'Failed to save prompt template' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) {
    return unauthorized()
  }
  const key = resolveKey(request.nextUrl.searchParams.get('key'))
  if (!key) {
    return NextResponse.json({ error: 'Unknown prompt key' }, { status: 400 })
  }
  try {
    await deleteCustomPromptTemplate(key)
    return NextResponse.json({ success: true, key, isCustom: false })
  } catch (err) {
    console.error('[admin/prompts] 恢复默认模板失败:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: 'Failed to reset prompt template' }, { status: 500 })
  }
}
