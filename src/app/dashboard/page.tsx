'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  TrendingUp,
  Clock,
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

interface Metrics {
  recentRuns: RunLog[]
  dailyStats: DailyStat[]
  sourceStats: SourceStat[]
  alerts: Array<{ type: string; source: string; message: string }>
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
  return new Date(date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchMetrics = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/metrics')
      const data = await res.json()
      setMetrics(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

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
        {metrics && metrics.alerts.length > 0 && (
          <div className="space-y-2">
            {metrics.alerts.map((alert, i) => (
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
          {metrics?.sourceStats.map((stat) => {
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
                {metrics?.recentRuns.map((run) => (
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
