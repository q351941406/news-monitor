'use client'
import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  LogOut,
  Home,
  RotateCcw,
  Search,
  Trash2,
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
    const res = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', itemId: '__validate__' }),
    })
    if (res.status === 403) {
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
  const handleDelete = async (id: string) => {
    if (!window.confirm('确认彻底删除这条内容？此操作不可恢复。')) return
    const res = await adminFetch('/api/archive', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', itemId: id }),
    })
    if (res.ok) {
      setNotice('已彻底删除')
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
            <Link href="/" className="font-serif text-2xl font-bold text-stone-900 tracking-tight">
              News Monitor
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors"
              >
                <Home className="w-4 h-4" /> 首页
              </Link>
              {isAdmin ? (
                <>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                    管理员
                  </span>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
                    title="退出管理员模式"
                  >
                    <LogOut className="w-3.5 h-3.5" /> 退出
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
                >
                  <Lock className="w-4 h-4" /> 管理员登录
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
            className="bg-white rounded-2xl p-6 w-80 shadow-xl"
            onClick={(e) => e.stopPropagation()}
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
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 mb-3"
            />
            {tokenError && <p className="text-xs text-red-600 mb-2">Token 无效，请重试</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogin(false)}
                className="flex-1 px-4 py-2 text-sm text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleLogin}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-700 transition-colors"
              >
                解锁
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 页头 */}
        <div className="flex items-center gap-3 mb-6">
          <Archive className="w-6 h-6 text-stone-500" />
          <h1 className="font-serif text-3xl font-bold text-stone-900 tracking-tight">历史归档</h1>
          <span className="text-sm text-stone-400">共 {total} 条已读内容</span>
        </div>

        {/* 筛选栏 */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* 来源 */}
          <div className="inline-flex rounded-lg border border-stone-200 bg-white p-1">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => applyFilter(s.id, days)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  source === s.id
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {/* 时间 */}
          <div className="inline-flex rounded-lg border border-stone-200 bg-white p-1">
            {TIME_FILTERS.map((t) => (
              <button
                key={t.days ?? 'all'}
                onClick={() => applyFilter(source, t.days)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
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
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                placeholder="搜索标题 / 关键词…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>
            <button
              onClick={applySearch}
              className="px-4 py-2 text-sm font-medium text-stone-700 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
            >
              搜索
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-4 px-4 py-2 text-sm text-stone-700 bg-stone-100 rounded-lg flex justify-between items-center">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="text-stone-400 hover:text-stone-600">
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
                    <h3 className="text-sm font-semibold text-stone-900 leading-snug">
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
                        className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        title="彻底删除"
                        className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <span className="text-stone-300 text-sm shrink-0">
                    {expandedId === item.id ? '▴' : '▾'}
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
                      <p className="mt-3 text-xs text-stone-400">仅管理员可恢复 / 删除归档内容</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-stone-600 disabled:text-stone-300 hover:text-stone-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> 上一页
            </button>
            <span className="text-sm text-stone-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-stone-600 disabled:text-stone-300 hover:text-stone-900 transition-colors"
            >
              下一页 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
