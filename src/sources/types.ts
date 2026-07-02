export interface NewsItem {
  id: string
  source: string
  title: string
  description: string
  url: string
  author?: string
  metrics?: Record<string, number>
  summary?: string
  fetchedAt: number
}

export interface NewsSource {
  name: string
  slug: string
  fetch(): Promise<NewsItem[]>
}

export interface SourceConfig {
  enabled: boolean
  schedule?: string  // cron 表达式
}
