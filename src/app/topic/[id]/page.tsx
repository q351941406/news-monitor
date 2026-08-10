import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTopicById } from '@/lib/db'

/**
 * 主题详情页（ISR）
 *
 * SEO 改造：每个主题组拥有独立可索引 URL。
 * - revalidate=3600：服务端渲染并缓存 1 小时，与每小时数据抓取节奏对齐
 * - dynamicParams 默认 true：访问时按需生成，构建不预渲染全部主题
 * - JSON-LD：BreadcrumbList + ItemList 结构化数据
 */
export const revalidate = 3600

const SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub',
  producthunt: 'Product Hunt',
  twitter: 'X / Twitter',
}

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const group = await getTopicById(id)
  if (!group) return { title: '主题不存在 - News Monitor' }
  const sourceLabel = SOURCE_LABEL[group.source] ?? group.source
  const title = `${group.topic} - ${sourceLabel}热点 - News Monitor`
  const description =
    group.summary?.slice(0, 150) ??
    `${group.topic} 相关热点新闻聚合，共 ${group.items.length} 条，来自 ${sourceLabel}。`
  return {
    title,
    description,
    alternates: { canonical: `/topic/${encodeURIComponent(id)}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `/topic/${encodeURIComponent(id)}`,
      siteName: 'News Monitor',
      locale: 'zh_CN',
    },
  }
}

export default async function TopicPage({ params }: Props) {
  const { id } = await params
  const group = await getTopicById(id)
  if (!group) notFound()

  const sourceLabel = SOURCE_LABEL[group.source] ?? group.source
  const canonicalPath = `/topic/${encodeURIComponent(id)}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: '/' },
          { '@type': 'ListItem', position: 2, name: group.topic, item: canonicalPath },
        ],
      },
      {
        '@type': 'ItemList',
        name: group.topic,
        description: group.summary,
        itemListElement: group.items.map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.title ?? '未命名条目',
          url: item.url,
        })),
      },
    ],
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* 顶部导航（无 JS 依赖，爬虫可读） */}
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/" className="font-serif text-2xl font-bold text-stone-900 tracking-tight">
            News Monitor
          </Link>
          <nav className="text-sm text-stone-500">
            <Link href="/" className="hover:text-stone-900 transition-colors">
              返回首页
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 面包屑 */}
        <nav aria-label="面包屑" className="text-sm text-stone-500 mb-6">
          <Link href="/" className="hover:text-stone-900">
            首页
          </Link>
          <span className="mx-2">/</span>
          <span className="text-stone-700">{group.topic}</span>
        </nav>

        {/* 主题标题 + 元信息 */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-600">
              {sourceLabel}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
              {group.items.length} 条
            </span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-stone-900 tracking-tight">
            {group.topic}
          </h1>
          {group.summary && (
            <p className="mt-4 text-base text-stone-600 leading-relaxed max-w-3xl">
              {group.summary}
            </p>
          )}
        </section>

        {/* 条目列表 */}
        <section className="space-y-3">
          {group.items.length === 0 ? (
            <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-400">
              该主题暂无内容
            </div>
          ) : (
            group.items.map((item) => (
              <article
                key={item.id}
                className="bg-white rounded-xl border border-stone-200 p-5 hover:border-stone-300 transition-colors"
              >
                <h2 className="font-medium text-lg text-stone-900 leading-snug">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {item.title ?? '未命名条目'}
                  </a>
                </h2>
                {item.summary && (
                  <p className="mt-2 text-sm text-stone-600 leading-relaxed line-clamp-3">
                    {item.summary}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-stone-400">
                  <span>{SOURCE_LABEL[item.source] ?? item.source}</span>
                  <time dateTime={new Date(item.fetchedAt).toISOString()}>
                    {new Date(item.fetchedAt).toLocaleDateString('zh-CN')}
                  </time>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    查看原文 →
                  </a>
                </div>
              </article>
            ))
          )}
        </section>

        <footer className="mt-12 text-center text-sm text-stone-400">
          <p>数据由 GitHub Actions 每小时自动抓取 · AI 摘要聚合 · News Monitor</p>
        </footer>
      </main>

      {/* nosemgrep: react-dangerouslysetinnerhtml — JSON-LD 结构化数据标准注入方式：
          <script type="application/ld+json"> 内不会解析 HTML，无 XSS 风险（Next.js 官方推荐写法） */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  )
}
