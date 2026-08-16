'use client'
import { getAdminToken, adminFetch } from '../../lib/admin-token'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Lock,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  TrendingUp,
  Clock,
  Sparkles,
} from 'lucide-react'

interface RunLog {
  id: string
  source: string
  stage: string
  status: string
  itemsCount: number
  durationMs: number
  error: string | null
  startedAt: string
}

interface DailyStat {
  date: string
  source: string
  totalRuns: number
  successes: number
  failures: number
  totalItems: number
}

interface SourceStat {
  source: string
  lastRun: string | null
  lastStatus: string | null
  successRate: number
  totalItems: number
}

interface AIUsageDaily {
  date: string
  calls: number
  inputTokens: number
  outputTokens: number
  failures: number
}
interface AIUsageStats {
  todayCalls: number
  todayInputTokens: number
  todayOutputTokens: number
  todayFailures: number
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalFailures: number
  byOperation: Array<{
    operation: string
    calls: number
    inputTokens: number
    outputTokens: number
    failures: number
    successRate: number
  }>
  daily: AIUsageDaily[]
}
interface Metrics {
  recentRuns: RunLog[]
  dailyStats: DailyStat[]
  sourceStats: SourceStat[]
  alerts: Array<{ type: string; source: string; message: string }>
  aiUsage: AIUsageStats
}

const SOURCE_LABELS: Record<string, string> = {
  github: 'GitHub',
  producthunt: 'ProductHunt',
  twitter: 'Twitter',
}
const STAGE_LABELS: Record<string, string> = {
  scrape: '抓取',
  'ai-process': 'AI处理',
  'topic-aggregate': '主题聚合',
}
const SOURCE_COLORS: Record<string, string> = {
  github: 'bg-stone-700',
  producthunt: 'bg-orange-600',
  twitter: 'bg-sky-500',
}

function formatToken(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
const OPERATION_LABELS: Record<string, string> = {
  batchSummarize: '批量摘要',
  singleSummary: '单条摘要',
  topicAggregation: '主题聚合',
}
const aiModelLabel = process.env.NEXT_PUBLIC_AI_MODEL || 'deepseek-v4-flash'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}
function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function formatDate(date: string): string {
  // date 为 "YYYY-MM-DD"，直接切片避免 new Date 的时区解析偏移
  const m = date.slice(5, 7)
  const d = date.slice(8, 10)
  return `${m}/${d}`
}

/** 校验 metrics 响应结构，防止后端异常 payload（如 {error}）导致渲染崩溃 */
function isValidMetrics(data: unknown): data is Metrics {
  if (!data || typeof data !== 'object') return false
  const m = data as Record<string, unknown>
  return (
    Array.isArray(m.recentRuns) &&
    Array.isArray(m.dailyStats) &&
    Array.isArray(m.sourceStats) &&
    Array.isArray(m.alerts) &&
    !!m.aiUsage &&
    typeof m.aiUsage === 'object'
  )
}
export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchMetrics = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await adminFetch('/api/admin/metrics')
      if (res.status === 403) {
        setAuthed(false)
        setLoading(false)
        return
      }
      if (!res.ok) {
        // 后端异常（如 500）：保留现有数据，不覆盖、不崩溃
        console.error(`[dashboard] metrics 请求失败: HTTP ${res.status}`)
        setAuthed(true)
        return
      }
      const data: unknown = await res.json()
      if (!isValidMetrics(data)) {
        // 响应结构异常（历史上出现过 {error} 被当 metrics 导致崩溃）
        console.error('[dashboard] metrics 响应结构异常，忽略本次数据')
        setAuthed(true)
        return
      }
      setMetrics(data)
      setAuthed(true)
    } catch (err) {
      // 网络异常：保留现有数据
      console.error('[dashboard] metrics 拉取异常:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const token = getAdminToken()
    if (!token) {
      setLoading(false)
      setAuthed(false)
      return
    }
    setAuthed(true)
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const alerts = metrics?.alerts ?? []
  if (!authed && !loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center p-8">
          <Lock className="w-10 h-10 text-stone-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-stone-800 mb-2">需要管理员权限</h2>
          <p className="text-stone-500 mb-6">请先在首页登录管理员模式后再访问此页面</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </Link>
        </div>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" /> 加载中...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-stone-400 hover:text-stone-700 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-semibold text-stone-900">运维仪表盘</h1>
          </div>
          <button
            onClick={fetchMetrics}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl"
              >
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-red-900">
                    {SOURCE_LABELS[alert.source] || alert.source}
                  </span>
                  <span className="text-red-700 ml-2">{alert.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Source Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(metrics?.sourceStats ?? []).map((stat) => {
            const isHealthy = stat.lastStatus === 'success'
            const isSilent = stat.lastStatus === 'success' && stat.totalItems === 0
            return (
              <div
                key={stat.source}
                className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${SOURCE_COLORS[stat.source] || 'bg-stone-400'}`}
                    />
                    <span className="font-medium text-stone-900">
                      {SOURCE_LABELS[stat.source] || stat.source}
                    </span>
                  </div>
                  {isSilent ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : isHealthy ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-stone-400">成功率</div>
                    <div
                      className={`font-semibold ${stat.successRate >= 80 ? 'text-emerald-600' : stat.successRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}
                    >
                      {stat.successRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400">数据量</div>
                    <div className="font-semibold text-stone-700">{stat.totalItems}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-stone-400">最近执行</div>
                    <div className="font-medium text-stone-700 text-xs">
                      {stat.lastRun ? formatTime(stat.lastRun) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 7-Day Trend */}
        {metrics && metrics.dailyStats.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-stone-500" />
              <h2 className="font-semibold text-stone-900 text-sm">7 天抓取趋势</h2>
            </div>
            <TrendChart dailyStats={metrics.dailyStats} />
          </div>
        )}

        {/* AI 用量统计 */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 p-5 border-b border-stone-100">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <h2 className="font-semibold text-stone-900 text-sm">AI 调用用量</h2>
            <span className="text-[11px] text-stone-400 ml-1">
              Token 统计 · 模型: {aiModelLabel}
            </span>
          </div>
          <div className="p-5 grid gap-5 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-violet-50/60 border border-violet-100 p-4">
                <div className="text-xs text-violet-600/70">今日 Token</div>
                <div className="text-2xl font-bold text-stone-900 mt-1 tabular-nums">
                  {formatToken(
                    (metrics?.aiUsage.todayInputTokens || 0) +
                      (metrics?.aiUsage.todayOutputTokens || 0),
                  )}
                </div>
                <div className="text-[11px] text-stone-400 mt-1">
                  {metrics?.aiUsage.todayCalls || 0} 次调用 · {metrics?.aiUsage.todayFailures || 0}{' '}
                  失败
                </div>
              </div>
              <div className="rounded-lg bg-stone-50 border border-stone-100 p-4">
                <div className="text-xs text-stone-500">累计 Token</div>
                <div className="text-2xl font-bold text-stone-900 mt-1 tabular-nums">
                  {formatToken(
                    (metrics?.aiUsage.totalInputTokens || 0) +
                      (metrics?.aiUsage.totalOutputTokens || 0),
                  )}
                </div>
                <div className="text-[11px] text-stone-400 mt-1">
                  {metrics?.aiUsage.totalCalls || 0} 次调用 · {metrics?.aiUsage.totalFailures || 0}{' '}
                  失败
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-stone-500 mb-2">按操作分布（近 7 天）</div>
              <div className="space-y-2">
                {(metrics?.aiUsage.byOperation || []).map((op) => (
                  <div key={op.operation} className="flex items-center gap-3 text-sm">
                    <span className="w-32 text-stone-600 truncate" title={op.operation}>
                      {OPERATION_LABELS[op.operation] || op.operation}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-400"
                        style={{ width: `${op.successRate}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-stone-500 tabular-nums w-16 text-right">
                      {formatToken(op.inputTokens + op.outputTokens)}
                    </span>
                    <span className="text-[11px] text-stone-400 tabular-nums w-14 text-right">
                      {op.calls} 次
                    </span>
                  </div>
                ))}
                {(metrics?.aiUsage.byOperation || []).length === 0 && (
                  <div className="text-stone-400 text-sm py-4 text-center">暂无 AI 调用记录</div>
                )}
              </div>
            </div>
          </div>
          {(metrics?.aiUsage.daily || []).length > 0 && (
            <div className="px-5 pb-5">
              <div className="text-xs text-stone-500 mb-2">近 7 天调用趋势</div>
              <div className="flex items-end gap-1.5 h-24">
                {metrics?.aiUsage.daily.map((d) => {
                  const maxCalls = Math.max(...metrics.aiUsage.daily.map((x) => x.calls), 1)
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="text-[10px] text-stone-400 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.calls} 次
                      </div>
                      <div
                        className="w-full rounded-t bg-violet-200 group-hover:bg-violet-300 transition-colors"
                        style={{
                          height: `${(d.calls / maxCalls) * 100}%`,
                          minHeight: d.calls > 0 ? 4 : 0,
                        }}
                      />
                      <div className="text-[10px] text-stone-400">{d.date.slice(5)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Recent Runs Table */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 p-5 border-b border-stone-100">
            <Activity className="w-4 h-4 text-stone-500" />
            <h2 className="font-semibold text-stone-900 text-sm">最近运行日志</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-400 text-xs">
                  <th className="text-left font-medium px-5 py-3">时间</th>
                  <th className="text-left font-medium px-5 py-3">来源</th>
                  <th className="text-left font-medium px-5 py-3">阶段</th>
                  <th className="text-left font-medium px-5 py-3">状态</th>
                  <th className="text-right font-medium px-5 py-3">条数</th>
                  <th className="text-right font-medium px-5 py-3">耗时</th>
                  <th className="text-left font-medium px-5 py-3">错误</th>
                </tr>
              </thead>
              <tbody>
                {(metrics?.recentRuns ?? []).map((run) => (
                  <tr key={run.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-stone-600 text-xs whitespace-nowrap">
                      {formatTime(run.startedAt)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${SOURCE_COLORS[run.source] || 'bg-stone-400'}`}
                        />
                        <span className="text-stone-700">
                          {SOURCE_LABELS[run.source] || run.source}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {STAGE_LABELS[run.stage] || run.stage}
                    </td>
                    <td className="px-5 py-3">
                      {run.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle className="w-3.5 h-3.5" /> 成功
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <XCircle className="w-3.5 h-3.5" /> 失败
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-stone-600 tabular-nums">
                      {run.itemsCount}
                    </td>
                    <td className="px-5 py-3 text-right text-stone-600 tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" />
                        {formatDuration(run.durationMs)}
                      </span>
                    </td>
                    <td
                      className="px-5 py-3 text-red-500 text-xs max-w-xs truncate"
                      title={run.error || ''}
                    >
                      {run.error || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {metrics?.recentRuns.length === 0 && (
              <div className="text-center text-stone-400 py-12 text-sm">暂无运行记录</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function TrendChart({ dailyStats }: { dailyStats: DailyStat[] }) {
  const dates = [...new Set(dailyStats.map((d) => d.date))].sort()
  const sources = [...new Set(dailyStats.map((d) => d.source))]
  const maxItems = Math.max(...dailyStats.map((d) => d.totalItems), 1)

  return (
    <div className="space-y-3">
      {sources.map((source) => {
        const sourceData = dates.map((date) => {
          const stat = dailyStats.find((d) => d.date === date && d.source === source)
          return { date, items: stat?.totalItems || 0 }
        })
        return (
          <div key={source}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${SOURCE_COLORS[source] || 'bg-stone-400'}`} />
              <span className="text-xs text-stone-500">{SOURCE_LABELS[source] || source}</span>
            </div>
            <div className="flex items-end gap-1 h-20">
              {sourceData.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="text-[10px] text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.items}
                  </div>
                  <div
                    className={`w-full rounded-t ${SOURCE_COLORS[source] || 'bg-stone-400'} transition-all`}
                    style={{
                      height: `${(d.items / maxItems) * 100}%`,
                      minHeight: d.items > 0 ? '4px' : '0',
                    }}
                  />
                  <div className="text-[10px] text-stone-400">{formatDate(d.date)}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
