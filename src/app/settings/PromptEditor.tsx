'use client'
import { useCallback, useEffect, useState } from 'react'
import { FlaskConical, Lock, RotateCcw, Save } from 'lucide-react'
import { getAdminToken, adminFetch } from '@/lib/admin-token'

/**
 * AI 提示词编辑岛（Client Island）
 *
 * - 访客：只读提示 + 管理员登录入口（token 存 localStorage，复用全站约定）
 * - 管理员：查看 / 编辑 / 恢复默认 GitHub 单条摘要模板
 * - 无 token 时不发任何请求（公开页别给后端添噪音）
 */

interface PromptPayload {
  key: string
  template: string
  isCustom: boolean
  maxLength: number
  variables: Array<{ name: string; desc: string }>
}

const KEY_LABELS: Record<string, string> = {
  'github-single-summary': 'GitHub 单条摘要',
}

export default function PromptEditor() {
  const [token, setToken] = useState<string | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [loginError, setLoginError] = useState(false)
  const [payload, setPayload] = useState<PromptPayload | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    setToken(getAdminToken())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await adminFetch('/api/admin/prompts')
      if (res.status === 403) {
        setToken(null)
        setPayload(null)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as PromptPayload
      setPayload(data)
      setDraft(data.template)
    } catch {
      setMessage({ kind: 'err', text: '模板加载失败，请稍后重试' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  /** 用输入的 token 试读一次：读得出来才是真管理员（与 Header 登录语义一致） */
  const handleLogin = async () => {
    const t = tokenInput.trim()
    if (!t) return
    setLoginError(false)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/prompts', {
        headers: { 'Content-Type': 'application/json', 'x-admin-token': t },
      })
      if (!res.ok) {
        setLoginError(true)
        return
      }
      const { setAdminToken } = await import('@/lib/admin-token')
      setAdminToken(t)
      setToken(t)
      setTokenInput('')
    } catch {
      setLoginError(true)
    }
  }

  const handleSave = async () => {
    if (!payload || saving) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await adminFetch('/api/admin/prompts', {
        method: 'PUT',
        body: JSON.stringify({ key: payload.key, template: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({
          kind: 'err',
          text: (data as { error?: string }).error || `保存失败（HTTP ${res.status}）`,
        })
        return
      }
      setPayload({ ...payload, template: draft.trim(), isCustom: true })
      setDraft(draft.trim())
      setMessage({ kind: 'ok', text: '已保存，下次 AI 富化运行时生效（60 秒内）' })
    } catch {
      setMessage({ kind: 'err', text: '保存失败，请检查网络后重试' })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!payload || saving) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await adminFetch(`/api/admin/prompts?key=${payload.key}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
      setMessage({ kind: 'ok', text: '已恢复默认模板' })
    } catch {
      setMessage({ kind: 'err', text: '恢复失败，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }

  const dirty = payload !== null && draft !== payload.template

  return (
    <section
      aria-label="AI 提示词配置"
      className="mt-6 rounded-xl border border-stone-200 bg-white p-4 sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100">
          <FlaskConical className="h-5 w-5 text-stone-600" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-stone-900 sm:text-lg">AI 提示词</h2>
          <p className="mt-1 text-sm text-stone-500">
            {payload ? (KEY_LABELS[payload.key] ?? payload.key) : 'GitHub 单条摘要'}
            {payload && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                  payload.isCustom ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-500'
                }`}
              >
                {payload.isCustom ? '已定制' : '默认模板'}
              </span>
            )}
          </p>
        </div>
      </div>

      {!token ? (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm text-stone-500">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            提示词修改需要管理员权限，查看当前模板请先登录
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value)
                setLoginError(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && void handleLogin()}
              placeholder="输入管理员 Token"
              aria-label="管理员 Token"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-red-500 sm:text-sm"
            />
            <button
              onClick={() => void handleLogin()}
              className="min-h-11 shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
            >
              解锁
            </button>
          </div>
          {loginError && <p className="mt-2 text-xs text-red-600">Token 错误，请重试</p>}
        </div>
      ) : loading || !payload ? (
        <p className="mt-4 text-sm text-stone-400">
          {message?.kind === 'err' ? message.text : '模板加载中…'}
        </p>
      ) : (
        <div className="mt-4">
          <label htmlFor="prompt-template" className="mb-2 block text-xs text-stone-500">
            模板正文（可用变量见下方说明；`{'{{变量}}'}` 会被替换为实际内容）
          </label>
          <textarea
            id="prompt-template"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs leading-relaxed text-stone-800 focus:outline-none focus:ring-2 focus:ring-red-500 sm:text-sm"
          />
          <p className="mt-1 text-right text-xs tabular-nums text-stone-400">
            {draft.length} / {payload.maxLength} 字符
          </p>

          <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2">
            <p className="text-xs font-medium text-stone-600">可用变量</p>
            <ul className="mt-1 space-y-0.5">
              {payload.variables.map((v) => (
                <li key={v.name} className="font-mono text-xs text-stone-500">
                  <code className="text-stone-700">{`{{${v.name}}}`}</code>
                  <span className="font-sans"> — {v.desc}</span>
                </li>
              ))}
            </ul>
          </div>

          {message && (
            <p
              className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}
              role="status"
            >
              {message.text}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-40"
            >
              <Save className="h-4 w-4" aria-hidden />
              {saving ? '保存中…' : '保存模板'}
            </button>
            {payload.isCustom && (
              <button
                onClick={() => void handleReset()}
                disabled={saving}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                恢复默认
              </button>
            )}
            {!dirty && (
              <span className="text-xs text-stone-400">未改动时保存按钮不可点，避免空写库</span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
