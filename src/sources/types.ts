export interface RawItem {
  id: string
  source: string
  title?: string
  url: string
  rawData: Record<string, unknown>
  fetchedAt: number
}

export interface NewsSource {
  name: string
  slug: string
  fetch(): Promise<RawItem[]>
}
