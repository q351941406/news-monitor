'use client'

import { useState, useEffect } from 'react'

interface NewsItem {
  id: string
  source: string
  title: string | null
  url: string
  rawData: Record<string, unknown>
  summary: string | null
  fetchedAt: number
  isRead: boolean
}

const sourceLabels: Record<string, { name: string; icon: string }> = {
  github: { name: 'GitHub Trending', icon: '🐙' },
  producthunt: { name: 'Product Hunt', icon: '🚀' },
  twitter: { name: 'X / Twitter', icon: '𝕏' },
}

function NewsCard({ item, onMarkRead }: { item: NewsItem; onMarkRead: (id: string) => void }) {
  const rawData = item.rawData

  const getDescription = () => {
    switch (item.source) {
      case 'github':
        return rawData.description as string
      case 'producthunt':
        return rawData.tagline as string
      case 'twitter':
        return (rawData.text as string)?.slice(0, 200)
      default:
        return ''
    }
  }

  const getMetrics = () => {
    switch (item.source) {
      case 'github':
        return `⭐ ${(rawData.stars as number)?.toLocaleString()}`
      case 'producthunt':
        return `▲ ${rawData.votes}`
      case 'twitter':
        return `♡ ${rawData.likes}`
      default:
        return ''
    }
  }

  return (
    <div className={`border rounded-lg p-4 transition-all ${
      item.isRead
        ? 'bg-gray-50 opacity-60 border-gray-200'
        : 'bg-white hover:shadow-lg border-blue-200 border-l-4'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-lg leading-tight">
          <a href={item.url} target="_blank" rel="noopener noreferrer"
             className="hover:text-blue-600 transition-colors">
            {item.title}
          </a>
        </h3>
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {getMetrics()}
        </span>
      </div>

      <p className="text-gray-600 text-sm mt-1">{getDescription()}</p>

      {item.summary && (
        <div className="mt-3 p-3 bg-gray-50 rounded text-sm whitespace-pre-line">
          {item.summary}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <span>{sourceLabels[item.source]?.name}</span>
        <div className="flex items-center gap-2">
          <span>{new Date(item.fetchedAt).toLocaleString('zh-CN')}</span>
          {!item.isRead && (
            <button
              onClick={() => onMarkRead(item.id)}
              className="text-blue-500 hover:text-blue-700 underline"
            >
              已读
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [news, setNews] = useState<Record<string, NewsItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const fetchNews = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/news?showAll=${showAll}`)
      const data = await res.json()
      setNews(data.data || {})
    } catch (error) {
      console.error('Failed to fetch news:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNews()
  }, [showAll])

  const handleMarkRead = async (itemId: string) => {
    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', itemId }),
      })

      // 更新本地状态
      setNews(prev => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map(item =>
            item.id === itemId ? { ...item, isRead: true } : item
          )
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const handleMarkAllRead = async (source?: string) => {
    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'readAll', source }),
      })

      // 更新本地状态
      setNews(prev => {
        const updated = { ...prev }
        const sources = source ? [source] : Object.keys(updated)
        for (const s of sources) {
          updated[s] = updated[s].map(item => ({ ...item, isRead: true }))
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const totalCount = Object.values(news).reduce((sum, items) => sum + items.length, 0)
  const unreadCount = Object.values(news).reduce(
    (sum, items) => sum + items.filter(i => !i.isRead).length, 0
  )

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">📰 热点新闻监控</h1>
            <p className="text-gray-500 mt-1">
              共 {totalCount} 条 · {unreadCount} 条未读
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="rounded"
              />
              显示已读
            </label>
            <button
              onClick={() => handleMarkAllRead()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >
              全部已读
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-400">加载中...</p>
        </div>
      ) : (
        <div className="grid gap-8">
          {Object.entries(sourceLabels).map(([slug, meta]) => {
            const items = news[slug] || []
            return (
              <section key={slug}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{meta.icon}</span>
                    <h2 className="text-xl font-semibold">{meta.name}</h2>
                    <span className="text-sm text-gray-400">
                      ({items.filter(i => !i.isRead).length}/{items.length})
                    </span>
                  </div>
                  <button
                    onClick={() => handleMarkAllRead(slug)}
                    className="text-sm text-blue-500 hover:text-blue-700"
                  >
                    本组已读
                  </button>
                </div>

                {items.length === 0 ? (
                  <p className="text-gray-400 italic">
                    {showAll ? '暂无数据' : '没有未读内容'}
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {items.map(item => (
                      <NewsCard key={item.id} item={item} onMarkRead={handleMarkRead} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <footer className="mt-12 text-center text-sm text-gray-400 pb-8">
        <p>数据由 GitHub Actions 每 4 小时自动抓取</p>
      </footer>
    </main>
  )
}
