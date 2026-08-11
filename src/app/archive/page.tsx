import type { Metadata } from 'next'
import { getArchivedNews } from '@/lib/db'
import ArchiveView from '../components/ArchiveView'

export const metadata: Metadata = {
  title: '历史归档',
  description:
    'News Monitor 已读内容归档：浏览已读的 GitHub、Product Hunt、Twitter 热点条目，支持按来源与时间筛选、搜索。',
}
/** 归档页服务端渲染（SEO 可索引），交互在客户端组件内完成 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  searchParams: Promise<{ source?: string; q?: string; days?: string; page?: string }>
}

export default async function ArchivePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const source = sp.source || 'all'
  const q = sp.q || ''
  const days = sp.days ? Math.max(1, parseInt(sp.days, 10) || 7) : null
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const pageSize = 20
  const { items, total } = await getArchivedNews({ source, page, pageSize, q, days })
  return (
    <ArchiveView
      initialItems={items}
      initialTotal={total}
      initialSource={source}
      initialQ={q}
      initialDays={days}
      page={page}
      pageSize={pageSize}
    />
  )
}
