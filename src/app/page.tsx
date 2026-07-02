import { getAllNews, type NewsItem } from '@/lib/db'

const sourceLabels: Record<string, { name: string; icon: string; color: string }> = {
  github: { name: 'GitHub Trending', icon: '🐙', color: 'bg-gray-900' },
  producthunt: { name: 'Product Hunt', icon: '🚀', color: 'bg-orange-500' },
  twitter: { name: 'X / Twitter', icon: '𝕏', color: 'bg-blue-500' },
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-lg leading-tight">
          <a href={item.url} target="_blank" rel="noopener noreferrer"
             className="hover:text-blue-600 transition-colors">
            {item.title}
          </a>
        </h3>
        {item.metrics?.stars && (
          <span className="text-sm text-gray-500 whitespace-nowrap">
            ⭐ {item.metrics.stars.toLocaleString()}
            {item.metrics.todayStars > 0 && (
              <span className="text-green-500"> +{item.metrics.todayStars}</span>
            )}
          </span>
        )}
        {item.metrics?.votes && (
          <span className="text-sm text-gray-500 whitespace-nowrap">
            ▲ {item.metrics.votes}
          </span>
        )}
      </div>

      <p className="text-gray-600 text-sm mt-1">{item.description}</p>

      {item.summary && (
        <div className="mt-3 p-3 bg-gray-50 rounded text-sm whitespace-pre-line">
          {item.summary}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
        {item.author && <span>by {item.author}</span>}
        <span>•</span>
        <span>{new Date(item.fetchedAt).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  )
}

export default async function Home() {
  const allNews = await getAllNews()

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">📰 热点新闻监控</h1>
        <p className="text-gray-500 mt-2">每日热点新闻汇总与领域知识发现</p>
      </header>

      <div className="grid gap-8">
        {Object.entries(sourceLabels).map(([slug, meta]) => {
          const items = allNews[slug] || []
          return (
            <section key={slug}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">{meta.icon}</span>
                <h2 className="text-xl font-semibold">{meta.name}</h2>
                <span className="text-sm text-gray-400">({items.length} 条)</span>
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

      <footer className="mt-12 text-center text-sm text-gray-400">
        <p>数据由 GitHub Actions 每 4 小时自动抓取</p>
      </footer>
    </main>
  )
}
