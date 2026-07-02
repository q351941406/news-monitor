import { getAllNews, type NewsItem } from '@/lib/db'

const sourceLabels: Record<string, { name: string; icon: string }> = {
  github: { name: 'GitHub Trending', icon: '🐙' },
  producthunt: { name: 'Product Hunt', icon: '🚀' },
  twitter: { name: 'X / Twitter', icon: '𝕏' },
}

function NewsCard({ item }: { item: NewsItem }) {
  const rawData = item.rawData

  // 根据数据源提取显示信息
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
    <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow bg-white">
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
        <span>{new Date(item.fetchedAt).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  )
}

export default async function Home() {
  const allNews = await getAllNews()

  const totalCount = Object.values(allNews).reduce((sum, items) => sum + items.length, 0)

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">📰 热点新闻监控</h1>
        <p className="text-gray-500 mt-2">每日热点新闻汇总与领域知识发现 · 共 {totalCount} 条</p>
      </header>

      <div className="grid gap-8">
        {Object.entries(sourceLabels).map(([slug, meta]) => {
          const items = allNews[slug] || []
          return (
            <section key={slug}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">{meta.icon}</span>
                <h2 className="text-xl font-semibold">{meta.name}</h2>
                <span className="text-sm text-gray-400">({items.length})</span>
              </div>

              {items.length === 0 ? (
                <p className="text-gray-400 italic">暂无数据，等待下次抓取...</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {items.map(item => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <footer className="mt-12 text-center text-sm text-gray-400 pb-8">
        <p>数据由 GitHub Actions 每 4 小时自动抓取</p>
      </footer>
    </main>
  )
}
