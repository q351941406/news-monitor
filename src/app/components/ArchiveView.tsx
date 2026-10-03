'use client'
import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Lock,
  LogOut,
  Home,
  RotateCcw,
  Search,
  Loader2,
} from 'lucide-react'
import { getAdminToken, setAdminToken, clearAdminToken, adminFetch } from '../../lib/admin-token'

interface NewsItem {
  id: string
  source: string
  title: string | null
  url: string
  summary: string | null
  details: string | null
  fetchedAt: number
  isRead: boolean
}
interface ArchiveViewProps {
  initialItems: NewsItem[]
  initialTotal: number
  initialSource: string
  initialQ: string
  initialDays: number | null
  page: number
  pageSize: number
}

const SOURCES = [
  { id: 'all', label: '全部' },
  { id: 'github', label: 'GitHub' },
  { id: 'producthunt', label: 'Product Hunt' },
  { id: 'twitter', label: 'Twitter' },
]
const TIME_FILTERS = [
  { days: null, label: '全部时间' },
  { days: 7, label: '7天' },
  { days: 30, label: '30天' },
  { days: 365, label: '今年' },
]
const SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub',
  producthunt: 'PH',
  twitter: 'TW',
}
const SOURCE_COLOR: Record<string, string> = {
  github: 'bg-red-600',
  producthunt: 'bg-stone-600',
  twitter: 'bg-sky-600',
}

export default function ArchiveView({
  initialItems,
  initialTotal,
  initialSource,
  initialQ,
  initialDays,
  page: initialPage,
  pageSize,
}: ArchiveViewProps) {
  const [items, setItems] = useState<NewsItem[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [source, setSource] = useState(initialSource)
  const [q, setQ] = useState(initialQ)
  const [days, setDays] = useState<number | null>(initialDays)
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenError, setTokenError] = useState(false)

  useEffect(() => {
    setIsAdmin(!!getAdminToken())
  }, [])

  const buildQuery = useCallback(
    (s: string, d: number | null, pg: number, keyword: string) => {
      const params = new URLSearchParams()
      if (s !== 'all') params.set('source', s)
      if (d) params.set('days', String(d))
      if (keyword.trim()) params.set('q', keyword.trim())
      params.set('page', String(pg))
      params.set('pageSize', String(pageSize))
      return params.toString()
    },
    [pageSize],
  )

  const fetchItems = useCallback(
    async (s: string, d: number | null, pg: number, keyword: string) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/archive?${buildQuery(s, d, pg, keyword)}`)
        const json = await res.json()
        setItems(json.data || [])
        setTotal(json.total || 0)
      } catch {
        setNotice('加载失败，请重试')
      } finally {
        setLoading(false)
      }
    },
    [buildQuery],
  )

  // 筛选条件变化时回到第 1 页并重新拉取
  const applyFilter = (s: string, d: number | null) => {
    setSource(s)
    setDays(d)
    setPage(1)
    fetchItems(s, d, 1, q)
  }
  const applySearch = () => {
    setPage(1)
    fetchItems(source, days, 1, q)
  }
  const goPage = (pg: number) => {
    setPage(pg)
    fetchItems(source, days, pg, q)
  }

  const handleLogin = async () => {
    if (!tokenInput.trim()) return
    setAdminToken(tokenInput.trim())
    setIsAdmin(true)
    setShowLogin(false)
    setTokenInput('')
    setTokenError(false)
    // 校验 token：无效时后端 403，回退访客态
    //
    // 曾存在的 bug：这里用裸 `fetch` 而非 `adminFetch`，**没有携带
    // x-admin-token header** → 后端必然 403 → 在归档页**永远无法登录成功**。
    // 统一走 adminFetch（它会附加 header），校验才真正有意义。
    const res = await adminFetch('/api/archive', {
      method: 'POST',
      body: JSON.stringify({ action: 'restore', itemId: '__validate__' }),
    })
    if (!res.ok) {
      clearAdminToken()
      setIsAdmin(false)
      setTokenError(true)
    }
  }
  const handleLogout = () => {
    clearAdminToken()
    setIsAdmin(false)
  }

  const handleRestore = async (id: string) => {
    const res = await adminFetch('/api/archive', {
      method: 'POST',
      body: JSON.stringify({ action: 'restore', itemId: id }),
    })
    if (res.ok) {
      setNotice('已恢复到未读')
      setItems((prev) => prev.filter((i) => i.id !== id))
      setTotal((t) => t - 1)
    } else {
      setNotice('操作失败：无管理员权限或 token 失效')
    }
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

  return (
    <>
      {/* 顶栏 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="truncate font-serif text-xl font-bold tracking-tight text-stone-900 sm:text-2xl"
            >
              News Monitor
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link
                href="/"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-stone-500 transition-colors hover:text-stone-900 sm:min-h-0"
              >
                <Home className="w-4 h-4" aria-hidden /> 首页
              </Link>
              {isAdmin ? (
                <>
                  <span className="hidden items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 sm:inline-flex">
                    管理员
                  </span>
                  <button
                    onClick={handleLogout}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-stone-400 transition-colors hover:text-stone-600 sm:min-h-0"
                    title="退出管理员模式"
                  >
                    <LogOut className="w-3.5 h-3.5" /> 退出
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:text-stone-800 sm:min-h-0"
                >
                  <Lock className="w-4 h-4" aria-hidden /> 管理员登录
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
      {/* 管理员登录弹窗 */}
      {showLogin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
          onClick={() => setShowLogin(false)}
        >
          <div
            className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="管理员登录"
          >
            <h2 className="text-lg font-semibold text-stone-900 mb-1">管理员登录</h2>
            <p className="text-sm text-stone-400 mb-4">输入管理员 Token 以解锁恢复 / 删除操作</p>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value)
                setTokenError(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="管理员 Token"
              autoFocus
              aria-label="管理员 Token"
              className="mb-3 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-stone-400 sm:text-sm"
            />
            {tokenError && <p className="text-xs text-red-600 mb-2">Token 无效，请重试</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogin(false)}
                className="min-h-11 flex-1 rounded-lg bg-stone-100 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-200"
              >
                取消
              </button>
              <button
                onClick={handleLogin}
                className="min-h-11 flex-1 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
              >
                解锁
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 页头 */}
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mb-6">
          <Archive className="h-6 w-6 shrink-0 text-stone-500" />
          <h1 className="font-serif text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            历史归档
          </h1>
          <span className="text-sm tabular-nums text-stone-400">共 {total} 条已读内容</span>
        </div>

        {/* 筛选栏 */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {/* 来源 */}
          <div className="scrollbar-hide -mx-1 flex overflow-x-auto px-1 sm:mx-0 sm:inline-flex sm:rounded-lg sm:border sm:border-stone-200 sm:bg-white sm:p-1">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => applyFilter(s.id, days)}
                className={`min-h-10 shrink-0 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors sm:min-h-0 sm:py-1.5 ${
                  source === s.id ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {/* 时间 */}
          <div className="scrollbar-hide -mx-1 flex overflow-x-auto px-1 sm:mx-0 sm:inline-flex sm:rounded-lg sm:border sm:border-stone-200 sm:bg-white sm:p-1">
            {TIME_FILTERS.map((t) => (
              <button
                key={t.days ?? 'all'}
                onClick={() => applyFilter(source, t.days)}
                className={`min-h-10 shrink-0 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors sm:min-h-0 sm:py-1.5 ${
                  days === t.days
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* 搜索 */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[200px]">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                placeholder="搜索标题 / 关键词…"
                aria-label="搜索归档内容"
                className="min-h-11 w-full rounded-lg border border-stone-200 py-2 pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-stone-400 sm:min-h-0 sm:text-sm"
              />
            </div>
            <button
              onClick={applySearch}
              className="min-h-11 shrink-0 rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200"
            >
              搜索
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-4 px-4 py-2 text-sm text-stone-700 bg-stone-100 rounded-lg flex justify-between items-center">
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              aria-label="关闭提示"
              className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* 列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-stone-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-stone-400">
            <Archive className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>暂无已读归档内容</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="border border-stone-200 rounded-xl bg-white hover:border-stone-300 transition-colors"
              >
                {/* 第 1 级：卡片 */}
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white ${SOURCE_COLOR[item.source] ?? 'bg-stone-600'}`}
                  >
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="break-words text-sm font-semibold leading-snug text-stone-900">
                      {item.title || '(无标题)'}
                    </h3>
                    {item.summary && (
                      <p className="mt-1 text-sm text-stone-500 line-clamp-2">{item.summary}</p>
                    )}
                    <p className="mt-1 text-xs text-stone-400">已读 · {fmtTime(item.fetchedAt)}</p>
                  </div>
                  {/* 操作区：仅管理员可见 */}
                  {isAdmin && (
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleRestore(item.id)}
                        title="恢复到未读"
                        aria-label="恢复到未读"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 active:bg-emerald-100"
                      >
                        <RotateCcw className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                  )}
                  <span
                    className="flex h-8 w-6 shrink-0 items-center justify-center text-stone-300"
                    aria-hidden
                  >
                    {expandedId === item.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </div>
                {/* 第 2 级：展开详情 */}
                {expandedId === item.id && (
                  <div className="px-4 pb-4 border-t border-stone-100 pt-3">
                    <div className="space-y-2 text-sm text-stone-600">
                      {item.details && (
                        <p className="whitespace-pre-wrap leading-relaxed">{item.details}</p>
                      )}
                      {item.summary && !item.details && <p>{item.summary}</p>}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> {item.url}
                        </a>
                      )}
                      <p className="text-xs text-stone-400 break-all">ID: {item.id}</p>
                    </div>
                    {!isAdmin && (
                      <p className="mt-3 text-xs text-stone-400">仅管理员可恢复为未读</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between gap-3 sm:justify-center sm:gap-4">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 transition-colors hover:text-stone-900 disabled:text-stone-300 sm:min-h-0 sm:border-0 sm:py-1.5"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden /> 上一页
            </button>
            <span className="text-sm tabular-nums text-stone-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 transition-colors hover:text-stone-900 disabled:text-stone-300 sm:min-h-0 sm:border-0 sm:py-1.5"
            >
              下一页 <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
