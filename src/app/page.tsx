'use client'

import { useState, useEffect } from 'react'
import Header from './components/Header'
import SourceTabs from './components/SourceTabs'
import TopicGroup from './components/TopicGroup'

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

// 临时主题分组（后续用 AI 自动生成）
const topicConfig: Record<string, { icon: string; label: string }> = {
  'ai': { icon: '🤖', label: 'AI / 人工智能' },
  'web': { icon: '🌐', label: 'Web 开发' },
  'tools': { icon: '🛠️', label: '开发工具' },
  'finance': { icon: '💰', label: '金融量化' },
  'other': { icon: '📦', label: '其他' },
}

// 简单的主题分类逻辑（后续用 AI 替代）
function categorizeItem(item: NewsItem): string {
  const text = JSON.stringify(item.rawData).toLowerCase()
  const title = (item.title || '').toLowerCase()

  if (text.includes('ai') || text.includes('llm') || text.includes('agent') || text.includes('机器学习') || title.includes('ai')) {
    return 'ai'
  }
  if (text.includes('react') || text.includes('vue') || text.includes('next') || text.includes('frontend') || text.includes('web')) {
    return 'web'
  }
  if (text.includes('cli') || text.includes('terminal') || text.includes('editor') || text.includes('tool') || text.includes('devtool')) {
    return 'tools'
  }
  if (text.includes('trading') || text.includes('quant') || text.includes('finance') || text.includes('crypto') || text.includes('量化')) {
    return 'finance'
  }
  return 'other'
}

export default function Home() {
  const [news, setNews] = useState<Record<string, NewsItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [showRead, setShowRead] = useState(false)
  const [activeSource, setActiveSource] = useState('all')

  const fetchNews = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/news?showAll=${showRead}`)
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
  }, [showRead])

  const handleMarkRead = async (itemId: string) => {
    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', itemId }),
      })

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

  const handleMarkUnread = async (itemId: string) => {
    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unread', itemId }),
      })

      setNews(prev => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map(item =>
            item.id === itemId ? { ...item, isRead: false } : item
          )
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to mark as unread:', error)
    }
  }

  const handleMarkGroupRead = async (topic: string) => {
    const itemsToMark = allItems.filter(item => {
      const itemTopic = categorizeItem(item)
      return itemTopic === topic && !item.isRead
    })

    for (const item of itemsToMark) {
      await handleMarkRead(item.id)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'readAll' }),
      })

      setNews(prev => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map(item => ({ ...item, isRead: true }))
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const handleResetAllRead = async () => {
    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resetAll' }),
      })

      setNews(prev => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map(item => ({ ...item, isRead: false }))
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to reset all read:', error)
    }
  }

  // 合并所有新闻
  const allItems = Object.values(news).flat()

  // 按来源筛选
  const filteredItems = activeSource === 'all'
    ? allItems
    : allItems.filter(item => item.source === activeSource)

  // 按主题分组
  const groupedItems: Record<string, NewsItem[]> = {}
  for (const item of filteredItems) {
    const topic = categorizeItem(item)
    if (!groupedItems[topic]) {
      groupedItems[topic] = []
    }
    groupedItems[topic].push(item)
  }

  // 按未读数量排序主题
  const sortedTopics = Object.entries(groupedItems).sort(
    ([, a], [, b]) => b.filter(i => !i.isRead).length - a.filter(i => !i.isRead).length
  )

  // 来源统计
  const sources = [
    { id: 'github', label: 'GitHub', icon: '🐙', count: news.github?.length || 0, unread: news.github?.filter(i => !i.isRead).length || 0 },
    { id: 'producthunt', label: 'Product Hunt', icon: '🚀', count: news.producthunt?.length || 0, unread: news.producthunt?.filter(i => !i.isRead).length || 0 },
    { id: 'twitter', label: 'X / Twitter', icon: '𝕏', count: news.twitter?.length || 0, unread: news.twitter?.filter(i => !i.isRead).length || 0 },
  ]

  const totalUnread = allItems.filter(i => !i.isRead).length
  const totalCount = allItems.length

  return (
    <div className="min-h-screen bg-stone-50">
      <Header
        unreadCount={totalUnread}
        totalCount={totalCount}
        showRead={showRead}
        onShowReadChange={setShowRead}
        onMarkAllRead={handleMarkAllRead}
        onResetAllRead={handleResetAllRead}
      />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Source Tabs */}
        <div className="mb-6">
          <SourceTabs
            sources={sources}
            activeSource={activeSource}
            onSourceChange={setActiveSource}
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin mb-4" />
            <p className="text-stone-500">加载中...</p>
          </div>
        ) : sortedTopics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-stone-400 text-lg">
              {showRead ? '暂无数据' : '没有未读内容 🎉'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedTopics.map(([topic, items]) => {
              const config = topicConfig[topic] || topicConfig['other']
              return (
                <TopicGroup
                  key={topic}
                  topic={config.label}
                  icon={config.icon}
                  items={items}
                  onMarkRead={handleMarkRead}
                  onMarkUnread={handleMarkUnread}
                  onMarkGroupRead={handleMarkGroupRead}
                />
              )
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-sm text-stone-400">
        <p>数据由 GitHub Actions 每 4 小时自动抓取</p>
      </footer>
    </div>
  )
}
