'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getAdminToken, setAdminToken, clearAdminToken, adminFetch } from '../../lib/admin-token'
import Header from './Header'
import SourceTabs from './SourceTabs'
import TopicGroup from './TopicGroup'
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
/** 主题组元信息（轻量，不含 items） */
interface TopicGroupMeta {
  id: string
  topic: string
  summary: string
  unreadCount: number
  totalCount: number
}
interface SourceCounts {
  total: number
  unread: number
}
interface HomeViewProps {
  /** 服务端预取的主题组元信息（showAll=true，供首屏 SSR 与 SEO） */
  initialTopics: Record<string, TopicGroupMeta[]>
  /** 服务端预取的来源计数 */
  initialCounts: Record<string, SourceCounts>
  /** 首屏是否显示已读（SEO 场景默认 true，展示全部内容） */
  initialShowRead: boolean
}
export default function HomeView({ initialTopics, initialCounts, initialShowRead }: HomeViewProps) {
  const [topics, setTopics] = useState<Record<string, TopicGroupMeta[]>>(initialTopics)
  /** 已加载的主题组 items 缓存：{ topicId: NewsItem[] } */
  const [groupItems, setGroupItems] = useState<Record<string, NewsItem[]>>({})
  /** 每个组的加载中状态：{ topicId: boolean } */
  const [loadingGroups, setLoadingGroups] = useState<Record<string, boolean>>({})
  const [counts, setCounts] = useState<Record<string, SourceCounts>>(initialCounts)
  const [loading, setLoading] = useState(false)
  const [showRead, setShowRead] = useState(initialShowRead)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeSource, setActiveSource] = useState('all')
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const isFirstRender = useRef(true)
  const prevShowRead = useRef(showRead)
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
  /**
   * 初始数据来自服务端 props；仅当 showRead 过滤条件变化时才重新请求。
   */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [topicsRes, countsRes] = await Promise.all([
        fetch(`/api/topics?showAll=${showRead}`),
        fetch('/api/news/counts'),
      ])
      const topicsData = await topicsRes.json()
      const countsData = await countsRes.json()
      setTopics(topicsData.data || {})
      setCounts(countsData.data || {})
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }, [showRead])
  useEffect(() => {
    // 首屏用服务端预取数据，跳过首次请求；之后 showRead 变化才重新拉取
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    fetchData()
  }, [fetchData])
  // showRead 切换后，items 缓存基于旧过滤条件，需要整体清空
  useEffect(() => {
    if (prevShowRead.current === showRead) return
    prevShowRead.current = showRead
    setGroupItems({})
    setLoadingGroups({})
    setExpandedGroupId(null)
  }, [showRead])
  /** 展开主题组：未加载过则按需拉取该组 items */
  const handleToggle = async (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null)
      return
    }
    setExpandedGroupId(groupId)
    if (!groupItems[groupId]) {
      setLoadingGroups((prev) => ({ ...prev, [groupId]: true }))
      try {
        const res = await fetch(`/api/topics/${groupId}/items?showAll=${showRead}`)
        const data = await res.json()
        setGroupItems((prev) => ({ ...prev, [groupId]: data.items }))
      } catch (error) {
        console.error('Failed to load group items:', error)
      } finally {
        setLoadingGroups((prev) => ({ ...prev, [groupId]: false }))
      }
    }
  }
  /** 找到某 item 所属的主题组 id 列表 */
  const findGroupsOfItem = useCallback(
    (itemId: string): string[] => {
      return Object.keys(groupItems).filter((gid) => groupItems[gid].some((i) => i.id === itemId))
    },
    [groupItems],
  )
  /** 找到某 item 的 source */
  const findSourceOfItem = useCallback(
    (itemId: string): string | undefined => {
      for (const gid of Object.keys(groupItems)) {
        const item = groupItems[gid].find((i) => i.id === itemId)
        if (item) return item.source
      }
      return undefined
    },
    [groupItems],
  )
  const handleMarkRead = async (itemId: string) => {
    try {
      await adminFetch('/api/news', {
        method: 'POST',
        body: JSON.stringify({ action: 'read', itemId }),
      })
      setGroupItems((prev) => {
        const updated = { ...prev }
        for (const gid of Object.keys(updated)) {
          updated[gid] = updated[gid].map((item) =>
            item.id === itemId ? { ...item, isRead: true } : item,
          )
        }
        return updated
      })
      // 更新所属组的未读数
      const groupIds = findGroupsOfItem(itemId)
      if (groupIds.length > 0) {
        setTopics((prev) => {
          const updated = { ...prev }
          for (const source of Object.keys(updated)) {
            updated[source] = updated[source].map((g) =>
              groupIds.includes(g.id) ? { ...g, unreadCount: Math.max(0, g.unreadCount - 1) } : g,
            )
          }
          return updated
        })
      }
      // 更新来源计数
      const source = findSourceOfItem(itemId)
      if (source) {
        setCounts((prev) => ({
          ...prev,
          [source]: { ...prev[source], unread: Math.max(0, prev[source].unread - 1) },
        }))
      }
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
      setGroupItems((prev) => {
        const updated = { ...prev }
        for (const gid of Object.keys(updated)) {
          updated[gid] = updated[gid].map((item) =>
            item.id === itemId ? { ...item, isRead: false } : item,
          )
        }
        return updated
      })
      const groupIds = findGroupsOfItem(itemId)
      if (groupIds.length > 0) {
        setTopics((prev) => {
          const updated = { ...prev }
          for (const source of Object.keys(updated)) {
            updated[source] = updated[source].map((g) =>
              groupIds.includes(g.id) ? { ...g, unreadCount: g.unreadCount + 1 } : g,
            )
          }
          return updated
        })
      }
      const source = findSourceOfItem(itemId)
      if (source) {
        setCounts((prev) => ({
          ...prev,
          [source]: { ...prev[source], unread: prev[source].unread + 1 },
        }))
      }
    } catch (error) {
      console.error('Failed to mark as unread:', error)
    }
  }
  /** 整组标记已读：后端单条 UPDATE，替代原前端逐条请求 */
  const handleMarkGroupRead = async (topicId: string) => {
    try {
      await adminFetch('/api/news', {
        method: 'POST',
        body: JSON.stringify({ action: 'readGroup', topicId }),
      })
      // 更新该组 items 缓存与元信息
      const groupUnread = groupItems[topicId]?.filter((i) => !i.isRead).length ?? 0
      const groupSource = groupItems[topicId]?.[0]?.source
      setGroupItems((prev) => {
        const updated = { ...prev }
        if (updated[topicId]) {
          updated[topicId] = updated[topicId].map((item) => ({ ...item, isRead: true }))
        }
        return updated
      })
      setTopics((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map((g) =>
            g.id === topicId ? { ...g, unreadCount: 0 } : g,
          )
        }
        return updated
      })
      if (groupSource && groupUnread > 0) {
        setCounts((prev) => ({
          ...prev,
          [groupSource]: {
            ...prev[groupSource],
            unread: Math.max(0, prev[groupSource].unread - groupUnread),
          },
        }))
      }
    } catch (error) {
      console.error('Failed to mark group as read:', error)
    }
  }
  const handleMarkAllRead = async () => {
    try {
      await adminFetch('/api/news', {
        method: 'POST',
        body: JSON.stringify({ action: 'readAll' }),
      })
      setGroupItems((prev) => {
        const updated = { ...prev }
        for (const gid of Object.keys(updated)) {
          updated[gid] = updated[gid].map((item) => ({ ...item, isRead: true }))
        }
        return updated
      })
      setTopics((prev) => {
        const updated = { ...prev }
        for (const source of Object.keys(updated)) {
          updated[source] = updated[source].map((g) => ({ ...g, unreadCount: 0 }))
        }
        return updated
      })
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
      setGroupItems((prev) => {
        const updated = { ...prev }
        for (const gid of Object.keys(updated)) {
          updated[gid] = updated[gid].map((item) => ({ ...item, isRead: false }))
        }
        return updated
      })
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
  // 当前数据源的主题组（元信息）——未勾选"显示已读"时过滤全已读组（与服务端行为一致）
  const currentTopicsAll =
    activeSource === 'all' ? Object.values(topics).flat() : topics[activeSource] || []
  const currentTopics = showRead
    ? currentTopicsAll
    : currentTopicsAll.filter((g) => g.unreadCount > 0)
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
                id={group.id}
                topic={group.topic}
                icon={getTopicIcon(group.topic)}
                groupSummary={group.summary}
                items={groupItems[group.id]}
                loading={!!loadingGroups[group.id]}
                unreadCount={group.unreadCount}
                totalCount={group.totalCount}
                isExpanded={expandedGroupId === group.id}
                onToggle={() => handleToggle(group.id)}
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
        <p>数据由 GitHub Actions 每小时自动抓取 · AI 摘要聚合</p>
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
