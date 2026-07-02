// Re-export from db module
import type { NewsItem } from '@/lib/db'
export type { NewsItem }

export interface NewsSource {
  name: string
  slug: string
  fetch(): Promise<NewsItem[]>
}

export interface SourceConfig {
  enabled: boolean
  schedule?: string  // cron 表达式
}
