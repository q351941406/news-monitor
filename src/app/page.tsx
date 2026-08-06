'use client'
import { useState, useEffect, useCallback } from 'react'
import { getAdminToken, setAdminToken, clearAdminToken, adminFetch } from '../lib/admin-token'
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
  details: string | null
  fetchedAt: number
  isRead: boolean
}
interface TopicGroupData {
  id: string
  topic: string
  summary: string
  items: NewsItem[]
}
interface SourceCounts {
  total: number
  unread: number
}
export default function Home() {
  const [news, setNews] = useState<Record<string, NewsItem[]>>({})
  const [counts, setCounts] = useState<Record<string, SourceCounts>>({})
  const [topics, setTopics] = useState<Record<string, TopicGroupData[]>>({})
  const [loading, setLoading] = useState(true)
  const [showRead, setShowRead] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeSource, setActiveSource] = useState('all')
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  useEffect(() => {
    setIsAdmin(!!getAdminToken())
  }, [])

  const handleLogin = (token: string) => {
    setAdminToken(token)
    setIsAdmin(true)
    // 触发一次受保护请求验证 token；无效时由后端返回 403，页面保持访客态
    adminFetch('/api/admin/metrics').catch(() => {})
  }
  const handleLogout = () => {
    clearAdminToken()
    setIsAdmin(false)
    window.location.reload()
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [newsRes, topicsRes] = await Promise.all([
        fetch(`/api/news?showAll=${showRead}`),
        fetch(`/api/topics?showAll=${showRead}`),
      ])
      const newsData = await newsRes.json()
      const topicsData = await topicsRes.json()
      setNews(newsData.data || {})
      setCounts(newsData.counts || {})
      setTopics(topicsData.data || {})
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }, [showRead])
  useEffect(() => {
    fetchData()
  }, [fetchData])
  const handleMarkRead = async (itemId: string) => {
    try {
      await adminFetch('/api/news', {
        method: 'POST',
        body: JSON.stringify({ action: 'read', itemId }),
      })
      setNews((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map((item) =>
            item.id === itemId ? { ...item, isRead: true } : item,
          )
        }
        return updated
      })
      // 更新本地计数
      setCounts((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          if (news[source]?.some((i) => i.id === itemId)) {
            updated[source] = {
              ...updated[source],
              unread: Math.max(0, updated[source].unread - 1),
            }
          }
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }
  const handleMarkUnread = async (itemId: string) => {
    try {
      await adminFetch('/api/news', {
        method: 'POST',
        body: JSON.stringify({ action: 'unread', itemId }),
      })
      setNews((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map((item) =>
            item.id === itemId ? { ...item, isRead: false } : item,
          )
        }
        return updated
      })
      // 更新本地计数
      setCounts((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          if (news[source]?.some((i) => i.id === itemId)) {
            updated[source] = { ...updated[source], unread: updated[source].unread + 1 }
          }
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to mark as unread:', error)
    }
  }
  const handleMarkGroupRead = async (topicId: string) => {
    for (const source of Object.keys(topics)) {
      const group = topics[source]?.find((g) => g.id === topicId)
      if (group) {
        for (const item of group.items) {
          if (!item.isRead) {
            await handleMarkRead(item.id)
          }
        }
        break
      }
    }
  }
  const handleMarkAllRead = async () => {
    try {
      await adminFetch('/api/news', {
        method: 'POST',
        body: JSON.stringify({ action: 'readAll' }),
      })
      setNews((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map((item) => ({ ...item, isRead: true }))
        }
        return updated
      })
      // 重置所有计数为 0 未读
      setCounts((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = { ...updated[source], unread: 0 }
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }
  const handleResetAllRead = async () => {
    try {
      await adminFetch('/api/news', {
        method: 'POST',
        body: JSON.stringify({ action: 'resetAll' }),
      })
      setNews((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map((item) => ({ ...item, isRead: false }))
        }
        return updated
      })
      // 恢复未读计数为总数
      setCounts((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = { ...updated[source], unread: updated[source].total }
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to reset all read:', error)
    }
  }
  // 使用真实计数
  const totalUnread = Object.values(counts).reduce((sum, c) => sum + c.unread, 0)
  // 来源统计（使用真实数据库计数，不受 limit 影响）
  const sources = [
    {
      id: 'github',
      label: 'GitHub',
      icon: '🐙',
      count: counts.github?.total || 0,
      unread: counts.github?.unread || 0,
    },
    {
      id: 'producthunt',
      label: 'Product Hunt',
      icon: '🚀',
      count: counts.producthunt?.total || 0,
      unread: counts.producthunt?.unread || 0,
    },
    {
      id: 'twitter',
      label: 'X / Twitter',
      icon: '𝕏',
      count: counts.twitter?.total || 0,
      unread: counts.twitter?.unread || 0,
    },
  ]
  // 获取当前数据源的主题聚合
  const currentTopics =
    activeSource === 'all' ? Object.values(topics).flat() : topics[activeSource] || []
  return (
    <div className="min-h-screen bg-stone-50">
      <Header
        unreadCount={totalUnread}
        showRead={showRead}
        isAdmin={isAdmin}
        onShowReadChange={setShowRead}
        onMarkAllRead={handleMarkAllRead}
        onResetAllRead={handleResetAllRead}
        onLogin={handleLogin}
        onLogout={handleLogout}
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
        ) : currentTopics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-stone-400 text-lg">{showRead ? '暂无数据' : '没有未读内容 🎉'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {currentTopics.map((group) => (
              <TopicGroup
                key={group.id}
                topic={group.topic}
                icon={getTopicIcon(group.topic)}
                groupSummary={group.summary}
                items={group.items}
                isExpanded={expandedGroupId === group.id}
                onToggle={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                onMarkRead={handleMarkRead}
                onMarkUnread={handleMarkUnread}
                onMarkGroupRead={handleMarkGroupRead}
                canOperate={isAdmin}
              />
            ))}
          </div>
        )}
      </main>
      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-sm text-stone-400">
        <p>数据由 GitHub Actions 每小时自动抓取</p>
      </footer>
    </div>
  )
}
// 根据主题名称返回图标
function getTopicIcon(topic: string): string {
  const lower = topic.toLowerCase()
  if (lower.includes('ai') || lower.includes('agent') || lower.includes('llm')) return '🤖'
  if (lower.includes('web') || lower.includes('frontend') || lower.includes('react')) return '🌐'
  if (lower.includes('tool') || lower.includes('cli') || lower.includes('dev')) return '🛠️'
  if (lower.includes('finance') || lower.includes('trading') || lower.includes('crypto'))
    return '💰'
  if (lower.includes('security') || lower.includes('hack')) return '🔒'
  if (lower.includes('data') || lower.includes('database')) return '📊'
  return '📰'
}
