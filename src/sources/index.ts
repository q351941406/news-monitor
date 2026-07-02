import { NewsSource } from './types'
import { githubSource } from './github'
import { productHuntSource } from './producthunt'
import { twitterSource } from './twitter'

export const sources: NewsSource[] = [
  githubSource,
  productHuntSource,
  twitterSource,
]

export function getSource(slug: string): NewsSource | undefined {
  return sources.find(s => s.slug === slug)
}

export type { NewsItem } from '@/lib/db'
export type { NewsSource } from './types'
